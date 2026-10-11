import copy
import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import datetime, timedelta

import pytest
from sqlalchemy import event, func, select, update
from sqlalchemy.exc import DBAPIError, OperationalError

from govfix.cli import import_policy
from govfix.database import as_utc, utcnow, write_transaction
from govfix.models import (
    AuditEvent,
    Case,
    Notification,
    OutboxMessage,
    PolicyVersion,
    RoleGrant,
    SlaThreshold,
    User,
)
from govfix.worker import Worker


class Clock:
    def __init__(self, value):
        self.value = value

    def __call__(self):
        return self.value


def setup_worker(backend, case):
    with backend.sessions() as session:
        row = session.scalar(select(Case).where(Case.public_id == case["id"]))
        clock = Clock(as_utc(row.submitted_at))
    return Worker(
        backend.app.state.sessions, backend.app.state.workflow.settings, clock=clock
    ), clock


def read_case(backend, case):
    return backend.client.get(
        f"/v1/cases/{case['id']}", headers=backend.headers("supervisor")
    ).json()["case"]


def messages(backend):
    with backend.sessions() as session:
        return list(session.scalars(select(OutboxMessage).order_by(OutboxMessage.created_at)).all())


def ward_head(backend):
    with write_transaction(backend.sessions) as session:
        user = User(
            username="ward-head", display_name="Ward Head", password_hash="not-a-login-hash"
        )
        session.add(user)
        session.flush()
        session.add(RoleGrant(user_id=user.id, role="WARD_HEAD", ward="WARD-A", department=None))
        return user.id


def test_threshold_boundaries_and_retry_once(backend):
    case = backend.in_progress()
    worker, clock = setup_worker(backend, case)
    start = clock.value
    for hours, expected_count, expected_level in ((57.6, 1, 0), (72, 2, 1), (108, 3, 2)):
        clock.value = start + timedelta(hours=hours) - timedelta(microseconds=1)
        assert worker.scan()["thresholds_recorded"] == 0
        clock.value += timedelta(microseconds=1)
        assert worker.scan()["thresholds_recorded"] == 1
        assert worker.scan()["thresholds_recorded"] == 0
        current = read_case(backend, case)
        assert current["escalation_level"] == expected_level
        assert current["workflow_state"] == "IN_PROGRESS"
        assert current["version"] == case["version"] + expected_count
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(SlaThreshold)) == 3
        assert session.scalar(select(func.count()).select_from(OutboxMessage)) == 3
        assert (
            session.scalar(select(Case.next_sla_check).where(Case.public_id == case["id"])) is None
        )


def test_jump_records_all_thresholds_and_delivers_to_scoped_recipients(backend):
    case = backend.in_progress()
    head = ward_head(backend)
    worker, clock = setup_worker(backend, case)
    clock.value += timedelta(hours=109)
    result = worker.run_once()
    assert result["sla"]["thresholds_recorded"] == 3
    assert result["notifications"]["DELIVERED"] == 3
    assert worker.run_once()["notifications"]["DELIVERED"] == 0
    with backend.sessions() as session:
        notices = session.scalars(select(Notification)).all()
        assert {n.recipient_id for n in notices} == {
            backend.users["officer"],
            backend.users["supervisor"],
            head,
        }
        assert len(notices) == 3
    inbox = backend.client.get("/v1/notifications", headers=backend.headers("officer")).json()
    assert len(inbox["notifications"]) == 1
    assert inbox["notifications"][0]["case_id"] == case["id"]
    assert (
        backend.client.get("/v1/notifications", headers=backend.headers("other-officer")).json()[
            "notifications"
        ]
        == []
    )
    assert (
        backend.client.get(
            "/v1/notifications", headers=backend.headers("outside-supervisor")
        ).json()["notifications"]
        == []
    )


def test_recipient_failure_backoff_terminal_failure_and_manual_retry(backend):
    case = backend.in_progress()
    worker, clock = setup_worker(backend, case)
    clock.value += timedelta(hours=109)
    worker.scan()
    worker.dispatch()
    failed = [m for m in messages(backend) if m.last_error == "RECIPIENT_UNAVAILABLE"][0]
    assert failed.status == "RETRY" and failed.attempts == 1
    assert worker.deliver(failed.id) == "SKIPPED"
    for attempt in range(2, 6):
        current = next(m for m in messages(backend) if m.id == failed.id)
        clock.value = as_utc(current.next_attempt_at)
        status = worker.deliver(failed.id)
        assert status == ("FAILED" if attempt == 5 else "RETRY")
    current = read_case(backend, case)
    sla = backend.client.get(
        f"/v1/cases/{case['id']}/sla", headers=backend.headers("supervisor")
    ).json()
    assert any(d["status"] == "FAILED" and d["attempts"] == 5 for d in sla["deliveries"])
    ward_head(backend)
    response = backend.command(
        current,
        "notification-retry",
        {"message_id": failed.id, "reason": "Ward head account provisioned"},
        "supervisor",
        key="retry-key",
    )
    assert response.status_code == 200, response.text
    assert worker.deliver(failed.id) == "DELIVERED"
    assert worker.deliver(failed.id) == "SKIPPED"
    assert (
        backend.command(
            current,
            "notification-retry",
            {"message_id": failed.id, "reason": "Ward head account provisioned"},
            "supervisor",
            key="retry-key",
        ).status_code
        == 200
    )
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(SlaThreshold)) == 3


def test_extension_preserves_breaches_and_original_deadline(backend):
    case = backend.in_progress()
    worker, clock = setup_worker(backend, case)
    clock.value += timedelta(hours=73)
    worker.scan()
    current = read_case(backend, case)
    deadline = as_utc(datetime.fromisoformat(current["current_deadline"])) + timedelta(hours=72)
    body = {"new_deadline": deadline.isoformat(), "reason": "Repair materials are delayed"}
    response = backend.command(
        current, "deadline-extension", body, "supervisor", key="extension-key"
    )
    assert response.status_code == 200, response.text
    extended = response.json()["case"]
    assert extended["workflow_state"] == "IN_PROGRESS"
    assert extended["original_deadline"] == case["original_deadline"]
    assert extended["current_deadline"] == deadline.isoformat()
    assert extended["escalation_level"] == 1
    assert (
        backend.command(
            current, "deadline-extension", body, "supervisor", key="extension-key"
        ).json()["case"]
        == extended
    )
    assert worker.scan()["thresholds_recorded"] == 0
    worker.dispatch()
    inbox = backend.client.get("/v1/notifications", headers=backend.headers()).json()[
        "notifications"
    ]
    assert len([n for n in inbox if n["kind"] == "DEADLINE_EXTENDED"]) == 1
    clock.value += timedelta(hours=200)
    assert worker.scan()["thresholds_recorded"] == 1
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(SlaThreshold)) == 3
        event_row = session.scalar(
            select(AuditEvent).where(
                AuditEvent.operation == "deadline-extension", AuditEvent.result == "ACCEPTED"
            )
        )
        assert event_row.before["current_deadline"] == current["current_deadline"]
        assert event_row.after["current_deadline"] == deadline.isoformat()
        assert event_row.details["reason"] == body["reason"]


def test_extension_records_overdue_thresholds_even_before_worker_runs(backend):
    case = backend.in_progress()
    now = utcnow()
    with write_transaction(backend.sessions) as session:
        row = session.scalar(select(Case).where(Case.public_id == case["id"]))
        row.submitted_at = now - timedelta(hours=109)
        row.original_deadline = row.current_deadline = now - timedelta(hours=37)
        row.next_sla_check = row.submitted_at
    response = backend.command(
        case,
        "deadline-extension",
        {"new_deadline": (now + timedelta(days=3)).isoformat(), "reason": "Approved repair window"},
        "supervisor",
    )
    assert response.status_code == 200, response.text
    assert response.json()["case"]["escalation_level"] == 2
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(SlaThreshold)) == 3


@pytest.mark.parametrize(
    "who,status",
    [
        ("officer", 403),
        ("intake", 403),
        ("citizen", 403),
        ("auditor", 403),
        ("outside-supervisor", 404),
    ],
)
def test_extension_role_scope_and_refusal_audit(backend, who, status):
    case = backend.in_progress()
    response = backend.command(
        case,
        "deadline-extension",
        {"new_deadline": (utcnow() + timedelta(days=10)).isoformat(), "reason": "Demo reason"},
        who,
    )
    assert response.status_code == status
    current = read_case(backend, case)
    assert current["current_deadline"] == case["current_deadline"]
    assert current["version"] == case["version"]
    with backend.sessions() as session:
        assert (
            session.scalar(
                select(AuditEvent).where(AuditEvent.operation == "deadline-extension")
            ).result
            == "REFUSED"
        )


@pytest.mark.parametrize(
    "deadline", ["2026-10-11T12:00:00", "invalid", "2001-01-01T00:00:00Z", "9999-12-31T23:59:59Z"]
)
def test_invalid_extension_dates(backend, deadline):
    case = backend.in_progress()
    response = backend.command(
        case,
        "deadline-extension",
        {"new_deadline": deadline, "reason": "Demo reason"},
        "supervisor",
    )
    assert response.status_code == 422, response.text
    assert read_case(backend, case)["version"] == case["version"]


def test_terminal_cases_do_not_escalate_or_extend(backend):
    case = backend.submit().json()["case"]
    rejected = backend.command(
        case, "reject", {"reason_code": "DUPLICATE", "explanation": "Existing report"}, "intake"
    ).json()["case"]
    worker, clock = setup_worker(backend, case)
    clock.value += timedelta(days=10)
    assert worker.scan()["thresholds_recorded"] == 0
    response = backend.command(
        rejected,
        "deadline-extension",
        {"new_deadline": (clock.value + timedelta(days=3)).isoformat(), "reason": "Cannot extend"},
        "supervisor",
    )
    assert response.status_code == 409


def test_scoped_sla_diagnostics_and_revoked_inbox(backend):
    case = backend.in_progress()
    worker, clock = setup_worker(backend, case)
    clock.value += timedelta(hours=73)
    worker.run_once()
    for who in ("citizen", "officer"):
        result = backend.client.get(
            f"/v1/cases/{case['id']}/sla", headers=backend.headers(who)
        ).json()
        assert result["thresholds"] and result["deliveries"] == []
    assert (
        backend.client.get(
            f"/v1/cases/{case['id']}/sla", headers=backend.headers("other-citizen")
        ).status_code
        == 404
    )
    assert backend.client.get("/v1/notifications").status_code == 401
    with write_transaction(backend.sessions) as session:
        grant = session.scalar(
            select(RoleGrant).where(RoleGrant.user_id == backend.users["officer"])
        )
        grant.ward = "WARD-B"
    assert (
        backend.client.get("/v1/notifications", headers=backend.headers("officer")).json()[
            "notifications"
        ]
        == []
    )


def test_pinned_policy_and_no_duplicate_notification_with_multiple_grants(backend, tmp_path):
    case = backend.in_progress()
    with write_transaction(backend.sessions) as session:
        original = session.get(PolicyVersion, case["policy_version"])
        definition = copy.deepcopy(original.definition)
        definition["version"] = "changed-sla"
        definition["thresholds"][0]["percent_of_sla"] = 90
        path = tmp_path / "changed-policy.json"
        path.write_text(json.dumps(definition))
        import_policy(session, path)
        session.add(
            RoleGrant(
                user_id=backend.users["supervisor"],
                role="SUPERVISOR",
                ward="WARD-A",
                department="PUBLIC_WORKS",
            )
        )
    worker, clock = setup_worker(backend, case)
    worker.workflow.settings = replace(worker.workflow.settings, policy_version="changed-sla")
    clock.value += timedelta(hours=58)
    assert worker.scan()["thresholds_recorded"] == 1
    clock.value += timedelta(hours=15)
    worker.run_once()
    with backend.sessions() as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(Notification)
                .where(Notification.recipient_id == backend.users["supervisor"])
            )
            == 1
        )


def test_concurrent_workers_create_and_deliver_once(backend):
    case = backend.in_progress()
    ward_head(backend)
    worker, clock = setup_worker(backend, case)
    clock.value += timedelta(hours=109)
    with ThreadPoolExecutor(max_workers=2) as executor:
        results = list(executor.map(lambda _: worker.scan(), range(2)))
    assert sum(result["thresholds_recorded"] for result in results) == 3
    with ThreadPoolExecutor(max_workers=2) as executor:
        list(executor.map(lambda _: worker.dispatch(), range(2)))
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(SlaThreshold)) == 3
        assert session.scalar(select(func.count()).select_from(Notification)) == 3


def test_sla_audit_failure_rolls_back_threshold_and_schedule(backend):
    case = backend.in_progress()
    worker, clock = setup_worker(backend, case)
    clock.value += timedelta(hours=109)
    engine = backend.app.state.sessions.kw["bind"]

    def fail(_conn, _cursor, statement, _params, _context, _many):
        if "INSERT INTO audit_events" in statement:
            raise OperationalError("injected", {}, Exception("audit unavailable"))

    event.listen(engine, "before_cursor_execute", fail)
    try:
        with pytest.raises(OperationalError):
            worker.scan()
    finally:
        event.remove(engine, "before_cursor_execute", fail)
    assert read_case(backend, case)["version"] == case["version"]
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(SlaThreshold)) == 0
        assert session.scalar(select(func.count()).select_from(OutboxMessage)) == 0
    assert worker.scan()["thresholds_recorded"] == 3


def test_delivery_audit_failure_rolls_back_inbox_and_job(backend):
    case = backend.in_progress()
    worker, clock = setup_worker(backend, case)
    clock.value += timedelta(hours=58)
    worker.scan()
    message = messages(backend)[0]
    engine = backend.app.state.sessions.kw["bind"]

    def fail(_conn, _cursor, statement, _params, _context, _many):
        if "INSERT INTO audit_events" in statement:
            raise OperationalError("injected", {}, Exception("audit unavailable"))

    event.listen(engine, "before_cursor_execute", fail)
    try:
        assert worker.dispatch()["UNAVAILABLE"] == 1
    finally:
        event.remove(engine, "before_cursor_execute", fail)
    with backend.sessions() as session:
        assert session.get(OutboxMessage, message.id).attempts == 0
        assert session.scalar(select(func.count()).select_from(Notification)) == 0
    assert worker.deliver(message.id) == "DELIVERED"


def test_sla_history_is_append_only(backend):
    case = backend.in_progress()
    worker, clock = setup_worker(backend, case)
    clock.value += timedelta(hours=58)
    worker.scan()
    with backend.sessions() as session, pytest.raises(DBAPIError):
        session.execute(update(SlaThreshold).values(threshold_key="tampered"))


def test_postgres_delivery_does_not_deadlock_recipient_command(backend, monkeypatch):
    from threading import Event

    engine = backend.app.state.sessions.kw["bind"]
    if engine.dialect.name != "postgresql":
        pytest.skip("PostgreSQL foreign-key lock compatibility")
    case = backend.in_progress()
    worker, clock = setup_worker(backend, case)
    clock.value += timedelta(hours=73)
    worker.scan()
    current = read_case(backend, case)
    message = next(m for m in messages(backend) if m.payload["recipient_role"] == "SUPERVISOR")
    actor_locked, delivery_locked = Event(), Event()

    def pause_actor(_conn, _cursor, statement, _params, _context, _many):
        if statement.startswith("SELECT users.") and "FOR NO KEY UPDATE" in statement:
            actor_locked.set()
            assert delivery_locked.wait(10)

    original = worker.recipients

    def release_command(session, row, job):
        delivery_locked.set()
        return original(session, row, job)

    monkeypatch.setattr(worker, "recipients", release_command)
    event.listen(engine, "after_cursor_execute", pause_actor)
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            command = executor.submit(
                backend.command,
                current,
                "deadline-extension",
                {
                    "new_deadline": (utcnow() + timedelta(days=7)).isoformat(),
                    "reason": "Concurrent extension",
                },
                "supervisor",
            )
            assert actor_locked.wait(10)
            delivery = executor.submit(worker.deliver, message.id)
            assert delivery.result(timeout=15) == "DELIVERED"
            response = command.result(timeout=15)
            assert response.status_code == 200, response.text
    finally:
        delivery_locked.set()
        event.remove(engine, "after_cursor_execute", pause_actor)


def test_postgres_locked_oldest_case_does_not_starve_later_delivery(backend):
    if backend.app.state.sessions.kw["bind"].dialect.name != "postgresql":
        pytest.skip("PostgreSQL SKIP LOCKED scheduling")
    first = backend.in_progress()
    second = backend.in_progress()
    worker, clock = setup_worker(backend, second)
    clock.value += timedelta(hours=58)
    worker.scan()
    # Force the first message to the front without modifying protected audit history.
    with write_transaction(backend.sessions) as session:
        first_row = session.scalar(select(Case).where(Case.public_id == first["id"]))
        message = session.scalar(
            select(OutboxMessage).join(AuditEvent).where(AuditEvent.case_id == first_row.id)
        )
        message.created_at = utcnow() - timedelta(days=1)
    with write_transaction(backend.sessions) as session:
        session.scalar(select(Case).where(Case.public_id == first["id"]).with_for_update())
        result = worker.dispatch(limit=1)
        assert result["SKIPPED"] == 1
        assert result["DELIVERED"] == 1


def test_migration_schedules_existing_cases_without_rewriting_policy_or_deadline(tmp_path):
    from govfix.cli import migrate
    from govfix.database import make_engine, make_sessions
    from govfix.models import new_id
    from tests.conftest import POLICY_PATH

    url = f"sqlite:///{tmp_path / 'upgrade.db'}"
    migrate(url, "0003")
    engine = make_engine(url)
    sessions = make_sessions(engine)
    now = utcnow()
    identifier = new_id()
    with write_transaction(sessions) as session:
        version = import_policy(session, POLICY_PATH)
        user = User(
            username="migration-citizen", display_name="Migration Citizen", password_hash="unused"
        )
        session.add(user)
        session.flush()
        session.execute(
            Case.__table__.insert().values(
                id=identifier,
                public_id=f"GF-{identifier}",
                citizen_id=user.id,
                workflow_state="SUBMITTED",
                category="POTHOLE",
                department="PUBLIC_WORKS",
                ward="WARD-A",
                description="Existing case",
                location="Demo road",
                policy_version=version,
                submitted_at=now,
                original_deadline=now + timedelta(hours=72),
                current_deadline=now + timedelta(hours=72),
            )
        )
    engine.dispose()
    migrate(url)
    engine = make_engine(url)
    sessions = make_sessions(engine)
    try:
        with sessions() as session:
            case = session.get(Case, identifier)
            assert case.policy_version == version
            assert as_utc(case.current_deadline) == now + timedelta(hours=72)
            assert as_utc(case.next_sla_check) == now
            assert case.version == 1
        from govfix.settings import Settings

        worker = Worker(sessions, Settings(database_url=url), clock=lambda: now)
        assert worker.scan()["thresholds_recorded"] == 0
        with sessions() as session:
            assert as_utc(session.get(Case, identifier).next_sla_check) == now + timedelta(
                hours=57.6
            )
    finally:
        engine.dispose()


def test_notification_retry_rejects_wrong_role_or_different_case(backend):
    case = backend.in_progress()
    worker, clock = setup_worker(backend, case)
    clock.value += timedelta(hours=58)
    worker.scan()
    message = messages(backend)[0]
    body = {"message_id": message.id, "reason": "Retry requested"}
    current = read_case(backend, case)
    assert backend.command(current, "notification-retry", body, "officer").status_code == 403
    assert backend.command(current, "notification-retry", body, "supervisor").status_code == 409
    other = backend.submit().json()["case"]
    assert backend.command(other, "notification-retry", body, "supervisor").status_code == 404
    with backend.sessions() as session:
        assert session.get(OutboxMessage, message.id).status == "PENDING"
        assert session.get(OutboxMessage, message.id).attempts == 0
