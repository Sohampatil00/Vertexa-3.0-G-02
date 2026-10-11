"""Operational signals without credentials, request bodies, or private case content."""

import json
import logging
import sys
from collections import Counter
from threading import Lock
from time import perf_counter

from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError

from govfix.database import as_utc, utcnow, verify_runtime_role
from govfix.models import OutboxMessage, PolicyVersion, WorkerStatus

SCHEMA_REVISION = "0009"
logger = logging.getLogger("govfix.operations")
if not logger.handlers:
    handler = logging.StreamHandler(sys.stderr)
    handler.setFormatter(logging.Formatter("%(message)s"))
    logger.addHandler(handler)
logger.setLevel(logging.INFO)
logger.propagate = False


def emit(event, *, level=logging.INFO, **fields):
    logger.log(level, json.dumps({"timestamp": utcnow().isoformat(), "event": event, **fields}))


class RequestMetrics:
    """Bounded per-process counters; distributed worker/queue status lives in PostgreSQL."""

    def __init__(self):
        self.lock = Lock()
        self.counts = Counter()
        self.duration_ms = 0.0

    def record(self, method, route, status, duration_ms, request_id):
        with self.lock:
            self.counts[(method, route, status)] += 1
            self.duration_ms += duration_ms
        emit(
            "http_request",
            level=logging.ERROR
            if status >= 500
            else logging.WARNING
            if status >= 400
            else logging.INFO,
            method=method,
            route=route,
            status=status,
            duration_ms=round(duration_ms, 2),
            request_id=request_id,
        )

    def snapshot(self):
        with self.lock:
            return {
                "scope": "api_process",
                "requests": sum(self.counts.values()),
                "duration_ms_total": round(self.duration_ms, 2),
                "responses": [
                    {"method": method, "route": route, "status": status, "count": count}
                    for (method, route, status), count in sorted(self.counts.items())
                ],
            }


def readiness(sessions, settings):
    checks = {"database": False, "schema": False, "policy": False, "runtime_role": False}
    started = perf_counter()
    try:
        with sessions() as session:
            if session.get_bind().dialect.name == "postgresql":
                session.execute(
                    text("SELECT set_config('statement_timeout', :timeout, true)"),
                    {"timeout": str(settings.readiness_timeout_ms)},
                )
            session.execute(text("SELECT 1"))
            checks["database"] = True
            checks["schema"] = (
                session.execute(text("SELECT version_num FROM alembic_version")).scalar()
                == SCHEMA_REVISION
            )
            checks["policy"] = session.get(PolicyVersion, settings.policy_version) is not None
            if settings.require_restricted_role:
                verify_runtime_role(session.connection())
            checks["runtime_role"] = True
    except (SQLAlchemyError, RuntimeError):
        pass
    ready = all(checks.values())
    if not ready:
        emit("readiness_failed", level=logging.WARNING, checks=checks)
    return {
        "status": "ready" if ready else "not_ready",
        "checks": checks,
        "duration_ms": round((perf_counter() - started) * 1000, 2),
    }


def operations_status(sessions, settings, *, now=None):
    now = as_utc(now or utcnow())
    ready = readiness(sessions, settings)
    result = {
        "status": "healthy",
        "readiness": ready,
        "alerts": [],
        "worker": None,
        "notifications": {"PENDING": 0, "RETRY": 0, "FAILED": 0, "overdue": 0},
    }
    if ready["status"] != "ready":
        result.update(status="unavailable", alerts=["API_NOT_READY"], notifications=None)
        return result
    try:
        with sessions() as session:
            statuses = session.scalars(select(WorkerStatus)).all()
            latest = max(statuses, key=lambda row: as_utc(row.started_at)) if statuses else None
            successes = [as_utc(row.last_success_at) for row in statuses if row.last_success_at]
            fresh = bool(
                successes
                and 0 <= (now - max(successes)).total_seconds() <= settings.worker_stale_seconds
            )
            if latest:
                result["worker"] = {
                    "started_at": as_utc(latest.started_at).isoformat(),
                    "finished_at": as_utc(latest.finished_at).isoformat()
                    if latest.finished_at
                    else None,
                    "last_success_at": max(successes).isoformat() if successes else None,
                    "last_error": latest.last_error,
                    "recent_success": fresh,
                }
                if latest.last_error:
                    result["alerts"].append("WORKER_CYCLE_FAILED")
            if not fresh:
                result["alerts"].append("WORKER_STALE" if statuses else "WORKER_MISSING")
            for status, count in session.execute(
                select(OutboxMessage.status, func.count())
                .where(OutboxMessage.status.in_(["PENDING", "RETRY", "FAILED"]))
                .group_by(OutboxMessage.status)
            ):
                result["notifications"][status] = count
            due = func.coalesce(OutboxMessage.next_attempt_at, OutboxMessage.created_at)
            result["notifications"]["overdue"] = session.scalar(
                select(func.count())
                .select_from(OutboxMessage)
                .where(
                    OutboxMessage.status.in_(["PENDING", "RETRY"]),
                    due < now - settings.notification_backlog_delta,
                )
            )
    except SQLAlchemyError:
        result.update(status="unavailable", alerts=["MONITORING_UNAVAILABLE"], notifications=None)
        return result
    for field, alert in (
        ("FAILED", "NOTIFICATIONS_FAILED"),
        ("RETRY", "NOTIFICATIONS_RETRYING"),
        ("overdue", "NOTIFICATION_BACKLOG"),
    ):
        if result["notifications"][field]:
            result["alerts"].append(alert)
    if result["alerts"]:
        result["status"] = "degraded"
        emit(
            "operational_alert",
            level=logging.WARNING,
            alerts=result["alerts"],
            notifications=result["notifications"],
        )
    return result
