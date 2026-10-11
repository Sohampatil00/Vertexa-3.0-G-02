import asyncio
from dataclasses import replace

from fastapi.testclient import TestClient
from sqlalchemy import select

from govfix.api import create_app
from govfix.background import worker_loop
from govfix.models import WorkerStatus
from govfix.settings import Settings


def test_embedded_worker_runs_and_stops_with_api(backend):
    settings = Settings(database_url=backend.url, embedded_worker=True)
    app = create_app(settings)
    with TestClient(app) as client:
        assert client.get("/ready").status_code == 200
    with backend.sessions() as session:
        status = session.scalar(select(WorkerStatus))
        assert status is not None
        assert status.last_success_at is not None
        assert status.finished_at is not None


def test_worker_retries_failed_cycle_and_does_not_overlap(monkeypatch):
    calls = []
    stop = asyncio.Event()

    class FakeWorker:
        def __init__(self, *args):
            pass

        def run_once(self, limit):
            calls.append(limit)
            return {"error": "DEPENDENCY_UNAVAILABLE"}

    async def run_in_threadpool(function, limit):
        result = function(limit)
        if len(calls) == 2:
            stop.set()
        return result

    monkeypatch.setattr("govfix.background.Worker", FakeWorker)
    monkeypatch.setattr("govfix.background.run_in_threadpool", run_in_threadpool)
    asyncio.run(worker_loop(None, replace(Settings(), worker_poll_seconds=1), stop))
    assert calls == [100, 100]
