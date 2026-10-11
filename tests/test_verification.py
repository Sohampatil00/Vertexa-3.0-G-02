"""Citizen decisions and unanswered verification stay explicit and auditable."""

from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta

from sqlalchemy import func, select

from govfix.cli import import_policy, migrate
from govfix.database import as_utc, make_engine, make_sessions, utcnow, write_transaction
from govfix.models import AuditEvent, Case, Notification, OutboxMessage, User, new_id
from govfix.settings import Settings
from govfix.worker import Worker
from tests.conftest import POLICY_PATH
from tests.test_workflow import confirmed_evidence, verification_case


def current(backend, case, who="citizen"):
    return backend.client.get(f"/v1/cases/{case['id']}", headers=backend.headers(who)).json()[
        "case"
    ]


def test_resolution_presentation_and_explicit_acceptance(backend):
    case = verification_case(backend)
    response = backend.client.get(f"/v1/cases/{case['id']}/resolution", headers=backend.headers())
    assert response.status_code == 200
    assert response.json()["resolution"]["note"] == "Road repaired"
    assert len(response.json()["resolution"]["evidence_refs"]) == 1
    assert (
        backend.client.get(
            f"/v1/cases/{case['id']}/resolution", headers=backend.headers("other-citizen")
        ).status_code
        == 404
    )
    refused = backend.command(
        case, "verification", {"outcome": "ACCEPT", "confirmation": False}, "citizen"
    )
    assert refused.status_code == 403
    assert current(backend, case)["workflow_state"] == "CITIZEN_VERIFICATION"
    accepted = backend.command(
        case, "verification", {"outcome": "ACCEPT", "confirmation": True}, "citizen"
    )
    assert accepted.status_code == 200
    closed = accepted.json()["case"]
    assert closed["workflow_state"] == "CLOSED"
    assert closed["verification_due_at"] is None
    with backend.sessions() as session:
        record = session.scalar(select(Case).where(Case.public_id == case["id"]))
        assert record.terminal_at is not None
    worker = Worker(backend.sessions, backend.app.state.workflow.settings)
    assert worker.scan_verification()["cases_flagged"] == 0


def test_unanswered_verification_alerts_supervisor_once_without_closure(backend):
    case = verification_case(backend)
    due = as_utc(datetime.fromisoformat(case["verification_due_at"]))

    def clock():
        return due - timedelta(microseconds=1)

    worker = Worker(backend.sessions, backend.app.state.workflow.settings, clock=clock)
    assert worker.scan_verification()["cases_flagged"] == 0
    worker.clock = lambda: due
    assert worker.run_once()["verification"]["cases_flagged"] == 1
    assert worker.run_once()["verification"]["cases_flagged"] == 0
    waiting = current(backend, case)
    assert waiting["workflow_state"] == "CITIZEN_VERIFICATION"
    assert waiting["verification_alerted_at"] is not None
    with backend.sessions() as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.operation == "verification-wait-review")
            )
            == 1
        )
        message = session.scalar(
            select(OutboxMessage).where(OutboxMessage.kind == "VERIFICATION_WAIT_REVIEW")
        )
        assert message.status == "DELIVERED"
        assert (
            session.scalar(
                select(func.count())
                .select_from(Notification)
                .where(Notification.message_id == message.id)
            )
            == 1
        )
    inbox = backend.client.get("/v1/notifications", headers=backend.headers("supervisor")).json()[
        "notifications"
    ]
    assert any(item["kind"] == "VERIFICATION_WAIT_REVIEW" for item in inbox)
    assert (
        backend.client.get("/v1/operations/summary", headers=backend.headers("supervisor")).json()[
            "verification_waiting"
        ]
        == 1
    )
    queue = backend.client.get(
        "/v1/cases?verification_waiting=true", headers=backend.headers("supervisor")
    ).json()["cases"]
    assert [item["id"] for item in queue] == [case["id"]]
    assert (
        backend.client.get(
            "/v1/cases?verification_waiting=true", headers=backend.headers("outside-supervisor")
        ).json()["cases"]
        == []
    )
    accepted = backend.command(
        waiting, "verification", {"outcome": "ACCEPT", "confirmation": True}, "citizen"
    )
    assert accepted.status_code == 200
    assert (
        backend.client.get(
            "/v1/cases?verification_waiting=true", headers=backend.headers("supervisor")
        ).json()["cases"]
        == []
    )
    assert (
        backend.client.get("/v1/operations/summary", headers=backend.headers("supervisor")).json()[
            "verification_waiting"
        ]
        == 0
    )


def test_dispute_supervisor_rework_and_second_verification_cycle(backend):
    case = verification_case(backend)
    missing = backend.command(
        case,
        "verification",
        {"outcome": "DISPUTE", "confirmation": True},
        "citizen",
    )
    assert missing.status_code == 422
    disputed = backend.command(
        case,
        "verification",
        {"outcome": "DISPUTE", "confirmation": True, "statement": "Repair still uneven"},
        "citizen",
    )
    assert disputed.status_code == 200
    review_case = disputed.json()["case"]
    assert review_case["workflow_state"] == "SUPERVISOR_REVIEW"
    assert review_case["verification_due_at"] is None
    resolution = backend.client.get(
        f"/v1/cases/{case['id']}/resolution", headers=backend.headers("supervisor")
    ).json()
    assert resolution["dispute_statement"] == "Repair still uneven"
    rework = backend.command(
        review_case,
        "review",
        {
            "decision": "REASSIGN",
            "officer_id": backend.users["other-officer"],
            "reason": "Inspect surface again",
        },
        "supervisor",
    )
    assert rework.status_code == 200
    assigned = rework.json()["case"]
    assert assigned["workflow_state"] == "ASSIGNED"
    assert assigned["owner_id"] == backend.users["other-officer"]
    assert (
        backend.client.get(
            f"/v1/cases/{case['id']}/resolution", headers=backend.headers("other-officer")
        ).json()["dispute_statement"]
        == "Repair still uneven"
    )
    in_progress = backend.command(
        assigned, "accept-assignment", {"confirmation": True}, "other-officer"
    ).json()["case"]
    evidence_id = confirmed_evidence(backend, in_progress)
    second = backend.command(
        in_progress,
        "resolution",
        {"note": "Repaired the uneven surface", "evidence_refs": [evidence_id]},
        "other-officer",
    )
    assert second.status_code == 200
    pending = second.json()["case"]
    assert pending["workflow_state"] == "CITIZEN_VERIFICATION"
    assert pending["verification_due_at"] is not None
    assert pending["verification_alerted_at"] is None
    latest = backend.client.get(
        f"/v1/cases/{case['id']}/resolution", headers=backend.headers()
    ).json()
    assert latest["resolution"]["note"] == "Repaired the uneven surface"
    assert latest["dispute_statement"] is None
    closed = backend.command(
        pending, "verification", {"outcome": "ACCEPT", "confirmation": True}, "citizen"
    )
    assert closed.status_code == 200
    assert closed.json()["case"]["workflow_state"] == "CLOSED"


def test_concurrent_wait_workers_flag_once(backend):
    case = verification_case(backend)
    due = datetime.fromisoformat(case["verification_due_at"])
    workers = [
        Worker(backend.sessions, backend.app.state.workflow.settings, clock=lambda: due)
        for _ in range(2)
    ]
    with ThreadPoolExecutor(max_workers=2) as pool:
        counts = list(pool.map(lambda worker: worker.scan_verification()["cases_flagged"], workers))
    assert sorted(counts) == [0, 1]
    with backend.sessions() as session:
        assert (
            session.scalar(
                select(func.count())
                .select_from(AuditEvent)
                .where(AuditEvent.operation == "verification-wait-review")
            )
            == 1
        )


def test_migration_schedules_existing_pending_verification(tmp_path):
    url = f"sqlite:///{tmp_path / 'verification-upgrade.db'}"
    migrate(url, "0004")
    engine = make_engine(url)
    sessions = make_sessions(engine)
    started = utcnow()
    identifier = new_id()
    with write_transaction(sessions) as session:
        version = import_policy(session, POLICY_PATH)
        user = User(username="upgrade-citizen", display_name="Citizen", password_hash="unused")
        session.add(user)
        session.flush()
        session.execute(
            Case.__table__.insert().values(
                id=identifier,
                public_id=f"GF-{identifier}",
                citizen_id=user.id,
                workflow_state="CITIZEN_VERIFICATION",
                category="POTHOLE",
                department="PUBLIC_WORKS",
                ward="WARD-A",
                description="Pending verification",
                location="Demo road",
                policy_version=version,
                submitted_at=started - timedelta(hours=2),
                original_deadline=started + timedelta(hours=70),
                current_deadline=started + timedelta(hours=70),
                version=6,
            )
        )
        session.add(
            AuditEvent(
                case_id=identifier,
                operation="request-verification",
                result="ACCEPTED",
                actor_role="WORKFLOW_ENGINE",
                channel="TEXT",
                occurred_at=started,
                case_version=6,
                policy_version=version,
                request_id="req_upgrade",
                details={},
            )
        )
    engine.dispose()
    migrate(url)
    engine = make_engine(url)
    sessions = make_sessions(engine)
    try:
        with sessions() as session:
            case = session.get(Case, identifier)
            assert as_utc(case.verification_due_at) == started + timedelta(hours=72)
            assert case.verification_alerted_at is None
            assert case.version == 6
        worker = Worker(
            sessions, Settings(database_url=url), clock=lambda: started + timedelta(hours=72)
        )
        assert worker.scan_verification()["cases_flagged"] == 1
    finally:
        engine.dispose()
