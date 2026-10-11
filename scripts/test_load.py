"""Concurrent demo load/retry drill against an isolated database, never production."""

import argparse
import json
import secrets
import statistics
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from pathlib import Path
from time import perf_counter

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from govfix.api import create_app
from govfix.cli import import_policy, migrate, provision_user
from govfix.database import make_engine, make_sessions, utcnow
from govfix.models import AuditEvent, Case, SlaThreshold
from govfix.settings import Settings
from govfix.worker import Worker

ROOT = Path(__file__).resolve().parents[1]


def run(url, root):
    migrate(url)
    engine = make_engine(url)
    sessions = make_sessions(engine)
    password = secrets.token_urlsafe(24)
    try:
        with sessions() as db, db.begin():
            import_policy(db, ROOT / "config/policies/demo-pilot-v1.json")
            for role in ("CITIZEN", "OFFICER", "SUPERVISOR", "WARD_HEAD"):
                provision_user(
                    db,
                    username=role.lower(),
                    display_name="Load test " + role,
                    password=password,
                    role=role,
                    verified=True,
                    wards=[] if role == "CITIZEN" else ["WARD-A"],
                )
        settings = Settings(database_url=url, evidence_directory=str(root / "evidence"))
        app = create_app(settings)
        with TestClient(app) as client:
            token = client.post(
                "/v1/auth/login", json={"username": "citizen", "password": password}
            ).json()["access_token"]

            def submit(index):
                started = perf_counter()
                response = client.post(
                    "/v1/cases",
                    headers={
                        "Authorization": "Bearer " + token,
                        "Idempotency-Key": f"load-case-{index % 8}",
                    },
                    json={
                        "description": f"Load test pothole {index % 8}",
                        "location": "Demo road",
                        "category": "POTHOLE",
                        "ward": "WARD-A",
                        "confirmation": True,
                    },
                )
                assert response.status_code == 201, response.status_code
                return (perf_counter() - started) * 1000

            with ThreadPoolExecutor(8) as pool:
                timings = list(pool.map(submit, range(64)))
            with sessions() as db:
                assert db.scalar(select(func.count()).select_from(Case)) == 8
                assert (
                    db.scalar(
                        select(func.count())
                        .select_from(AuditEvent)
                        .where(AuditEvent.operation == "submit", AuditEvent.result == "ACCEPTED")
                    )
                    == 8
                )

            def clock():
                return utcnow() + timedelta(days=5)

            workers = [Worker(sessions, settings, clock=clock) for _ in range(2)]
            with ThreadPoolExecutor(2) as pool:
                results = list(pool.map(lambda worker: worker.run_once(), workers))
            assert all("error" not in result for result in results)
            for worker in workers:
                assert "error" not in worker.run_once()
            with sessions() as db:
                assert db.scalar(select(func.count()).select_from(SlaThreshold)) == 24
            client.post("/v1/auth/logout", headers={"Authorization": "Bearer " + token})
        return {
            "requests": 64,
            "concurrent_clients": 8,
            "unique_cases": 8,
            "sla_thresholds_after_concurrent_retries": 24,
            "p50_ms": round(statistics.median(timings), 2),
            "p95_ms": round(sorted(timings)[int(len(timings) * 0.95)], 2),
            "database": engine.dialect.name,
            "status": "passed",
        }
    finally:
        engine.dispose()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--postgres", action="store_true")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix="govfix-load-") as directory:
        root = Path(directory)
        if args.postgres:
            import pgserver

            server = pgserver.get_server(root / "postgres", cleanup_mode="stop")
            try:
                result = run(server.get_uri(), root)
            finally:
                server.cleanup()
        else:
            result = run(f"sqlite:///{root / 'load.db'}", root)
    print(json.dumps(result), flush=True)


if __name__ == "__main__":
    main()
