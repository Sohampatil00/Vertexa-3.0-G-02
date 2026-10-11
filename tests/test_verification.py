"""Citizen decisions and unanswered verification stay explicit and auditable."""

from datetime import datetime, timedelta

from sqlalchemy import func, select

from govfix.database import as_utc
from govfix.models import AuditEvent, Case, Notification, OutboxMessage
from govfix.worker import Worker
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
    accepted = backend.command(
        waiting, "verification", {"outcome": "ACCEPT", "confirmation": True}, "citizen"
    )
    assert accepted.status_code == 200
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
    assert (
        backend.client.get(f"/v1/cases/{case['id']}/resolution", headers=backend.headers()).json()[
            "resolution"
        ]["note"]
        == "Repaired the uneven surface"
    )
    closed = backend.command(
        pending, "verification", {"outcome": "ACCEPT", "confirmation": True}, "citizen"
    )
    assert closed.status_code == 200
    assert closed.json()["case"]["workflow_state"] == "CLOSED"
