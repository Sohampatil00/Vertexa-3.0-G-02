import io
import json
import logging
from datetime import timedelta

from sqlalchemy import select, text
from sqlalchemy.exc import DBAPIError

from govfix.database import utcnow
from govfix.models import AuditEvent, OutboxMessage, WorkerStatus
from govfix.observability import SCHEMA_REVISION, logger, operations_status
from govfix.settings import Settings
from govfix.worker import Worker


def test_ready_checks_schema_policy_and_keeps_health_independent(backend):
    response = backend.client.get("/ready")
    assert response.status_code == 200
    assert all(response.json()["checks"].values())
    with backend.sessions() as session, session.begin():
        session.execute(text("UPDATE alembic_version SET version_num='old'"))
    response = backend.client.get("/ready")
    assert response.status_code == 503
    assert response.json()["checks"]["schema"] is False
    with backend.sessions() as session, session.begin():
        session.execute(
            text("UPDATE alembic_version SET version_num=:revision"),
            {"revision": SCHEMA_REVISION},
        )
    assert backend.client.get("/health").status_code == 200


def test_missing_policy_reports_not_ready(backend):
    from govfix.observability import readiness

    result = readiness(backend.sessions, Settings(policy_version="unconfigured"))
    assert result["status"] == "not_ready"
    assert result["checks"]["policy"] is False


def test_database_outage_is_sanitized(backend, monkeypatch):
    def offline():
        raise DBAPIError(None, None, OSError("database-password-private"))

    from govfix.observability import readiness

    monkeypatch.setattr(
        "govfix.api.readiness", lambda sessions, settings: readiness(offline, settings)
    )
    response = backend.client.get("/ready")
    assert response.status_code == 503
    assert "database-password-private" not in response.text
    assert backend.client.get("/health").status_code == 200


def test_status_is_auditor_only_and_detects_missing_then_stale_worker(backend):
    assert backend.client.get("/v1/operations/status").status_code == 401
    assert backend.client.get("/v1/operations/status", headers=backend.headers()).status_code == 403
    response = backend.client.get("/v1/operations/status", headers=backend.headers("auditor"))
    assert response.status_code == 200
    assert response.json()["alerts"] == ["WORKER_MISSING"]
    worker = Worker(backend.sessions, Settings())
    assert "error" not in worker.run_once()
    status = backend.client.get("/v1/operations/status", headers=backend.headers("auditor")).json()
    assert status["status"] == "healthy"
    assert status["worker"]["recent_success"] is True
    stale = operations_status(backend.sessions, Settings(), now=utcnow() + timedelta(minutes=3))
    assert "WORKER_STALE" in stale["alerts"]


def test_failed_delivery_and_overdue_backlog_are_visible_without_case_details(backend):
    case = backend.submit().json()["case"]
    now = utcnow()
    with backend.sessions() as session, session.begin():
        event_id = session.scalar(select(AuditEvent.id))
        message = OutboxMessage(event_id=event_id, kind="SLA_THRESHOLD", payload={}, status="RETRY")
        session.add(message)
        message.last_error = "RECIPIENT_UNAVAILABLE"
        message.next_attempt_at = now - timedelta(minutes=10)
    status = operations_status(backend.sessions, Settings(), now=now)
    assert status["notifications"]["RETRY"] == 1
    assert status["notifications"]["overdue"] == 1
    assert "NOTIFICATION_BACKLOG" in status["alerts"]
    assert case["id"] not in json.dumps(status)
    with backend.sessions() as session, session.begin():
        session.scalar(select(OutboxMessage)).status = "FAILED"
    assert "NOTIFICATIONS_FAILED" in operations_status(backend.sessions, Settings())["alerts"]


def test_worker_failure_persists_and_recovers(backend, monkeypatch):
    worker = Worker(backend.sessions, Settings())
    original = worker.scan

    def unavailable(*args):
        raise DBAPIError(None, None, OSError("private diagnostic"))

    monkeypatch.setattr(worker, "scan", unavailable)
    assert worker.run_once() == {"error": "DEPENDENCY_UNAVAILABLE"}
    status = operations_status(backend.sessions, Settings())
    assert "WORKER_CYCLE_FAILED" in status["alerts"]
    assert "private diagnostic" not in json.dumps(status)
    monkeypatch.setattr(worker, "scan", original)
    worker.run_once()
    assert operations_status(backend.sessions, Settings())["status"] == "healthy"
    with backend.sessions() as session:
        assert len(session.scalars(select(WorkerStatus)).all()) == 1


def test_partial_dispatch_failure_is_reported_as_failed_cycle(backend, monkeypatch):
    worker = Worker(backend.sessions, Settings())
    monkeypatch.setattr(
        worker, "dispatch", lambda limit: {"UNAVAILABLE": 1, "FAILED": 0, "RETRY": 0}
    )
    worker.run_once()
    status = operations_status(backend.sessions, Settings())
    assert status["worker"]["last_error"] == "DEPENDENCY_UNAVAILABLE"
    assert "WORKER_CYCLE_FAILED" in status["alerts"]


def test_structured_logs_and_metrics_do_not_record_private_inputs(backend):
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    logger.addHandler(handler)
    try:
        response = backend.client.get(
            "/v1/cases/private-case?token=secret-query",
            headers={"Authorization": "Bearer private-token"},
        )
        backend.client.get("/unknown-private-path")
        backend.client.post(
            "/v1/auth/login", json={"username": "secret-name", "password": "secret-password"}
        )
    finally:
        logger.removeHandler(handler)
    contents = stream.getvalue()
    rows = [json.loads(line) for line in contents.splitlines()]
    assert any(row.get("request_id") == response.headers["x-request-id"] for row in rows)
    assert any(row.get("route") == "/v1/cases/{case_id}" for row in rows)
    for private in (
        "private-case",
        "secret-query",
        "private-token",
        "unknown-private-path",
        "secret-name",
        "secret-password",
    ):
        assert private not in contents
    metrics = backend.app.state.metrics.snapshot()
    assert metrics["requests"] >= 3
    assert metrics["scope"] == "api_process"


def test_unexpected_api_error_is_sanitized_and_correlated(backend):
    @backend.app.get("/test-failure")
    def failure():
        raise ValueError("private case content")

    response = backend.client.get("/test-failure")
    assert response.status_code == 500
    assert "private case content" not in response.text
    assert response.json()["request_id"] == response.headers["x-request-id"]


def test_unexpected_worker_failure_is_safe_and_keeps_loop_recoverable(backend, monkeypatch):
    worker = Worker(backend.sessions, Settings())

    def fail(*args):
        raise ValueError("private worker detail")

    monkeypatch.setattr(worker, "scan", fail)
    assert worker.run_once() == {"error": "WORKER_INTERNAL_ERROR"}
    status = operations_status(backend.sessions, Settings())
    assert status["worker"]["last_error"] == "WORKER_INTERNAL_ERROR"
    assert "private worker detail" not in json.dumps(status)
