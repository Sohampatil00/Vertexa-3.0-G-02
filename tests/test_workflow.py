import json
from concurrent.futures import ThreadPoolExecutor
from dataclasses import replace
from datetime import timedelta

import pytest
from sqlalchemy import event, func, select
from sqlalchemy.exc import OperationalError

from govfix.cli import import_policy
from govfix.database import as_utc
from govfix.models import Assignment, AuditEvent, Case, Evidence, OutboxMessage
from tests.conftest import POLICY_PATH


def audits(backend, *, result=None, operation=None):
    with backend.sessions() as session:
        query = select(AuditEvent)
        if result:
            query = query.where(AuditEvent.result == result)
        if operation:
            query = query.where(AuditEvent.operation == operation)
        return session.scalars(query).all()


def assert_refused(backend, case, response, code, status):
    assert response.status_code == status, response.text
    assert response.json()["error"]["code"] == code
    current = backend.client.get(f"/v1/cases/{case['id']}", headers=backend.headers()).json()[
        "case"
    ]
    assert current["version"] == case["version"]
    assert current["workflow_state"] == case["workflow_state"]
    assert current["owner_id"] == case["owner_id"]
    assert any(item.reason_code == code for item in audits(backend, result="REFUSED"))


def confirmed_evidence(backend, case):
    # Simulate the trusted completion step of the future private upload service.
    with backend.sessions() as session, session.begin():
        internal = session.scalar(select(Case).where(Case.public_id == case["id"]))
        item = Evidence(
            case_id=internal.id,
            uploader_id=backend.users["officer"],
            kind="AFTER_PHOTO",
            object_key="private/test-photo",
            sha256="a" * 64,
            complete=True,
        )
        session.add(item)
        session.flush()
        return item.id


def verification_case(backend):
    case = backend.in_progress()
    evidence_id = confirmed_evidence(backend, case)
    response = backend.command(
        case, "resolution", {"note": "Road repaired", "evidence_refs": [evidence_id]}, "officer"
    )
    assert response.status_code == 200, response.text
    return response.json()["case"]


def test_valid_foundation_path_with_one_owner(backend):
    case = backend.in_progress()
    assert case["workflow_state"] == "IN_PROGRESS"
    assert case["version"] == 4
    assert case["owner_id"] == backend.users["officer"]
    assert case["policy_version"] == "demo-pilot-v1"
    with backend.sessions() as session:
        internal = session.scalar(select(Case))
        assert as_utc(internal.original_deadline) - as_utc(internal.submitted_at) == timedelta(
            hours=72
        )
        assert session.scalar(select(func.count()).select_from(Assignment)) == 1
    assert len(audits(backend, result="ACCEPTED")) == 4


def test_skipped_closure_is_refused_and_audited(backend):
    case = backend.assigned()
    response = backend.command(
        case, "verification", {"outcome": "ACCEPT", "confirmation": True}, "officer"
    )
    assert_refused(backend, case, response, "INVALID_TRANSITION", 409)


def test_wrong_role_is_refused(backend):
    case = backend.submit().json()["case"]
    response = backend.command(
        case,
        "validate",
        {
            "category": "POTHOLE",
            "ward": "WARD-A",
            "department": "PUBLIC_WORKS",
            "jurisdiction": "Fictional Demo Municipality",
        },
        "citizen",
    )
    assert_refused(backend, case, response, "ROLE_NOT_ALLOWED", 403)


def test_wrong_owner_is_refused(backend):
    case = backend.in_progress()
    response = backend.command(
        case, "resolution", {"note": "Repaired", "evidence_refs": ["fake"]}, "other-officer"
    )
    assert_refused(backend, case, response, "NOT_ASSIGNED_OWNER", 403)


@pytest.mark.parametrize(
    "body", [{"note": "Done"}, {"note": "Done", "evidence_refs": ["invented"]}]
)
def test_missing_or_invented_evidence_is_refused(backend, body):
    case = backend.in_progress()
    response = backend.command(case, "resolution", body, "officer")
    assert_refused(backend, case, response, "EVIDENCE_REQUIRED", 422)


def test_incomplete_evidence_is_refused(backend):
    case = backend.in_progress()
    evidence_id = confirmed_evidence(backend, case)
    with backend.sessions() as session, session.begin():
        session.get(Evidence, evidence_id).complete = False
    response = backend.command(
        case, "resolution", {"note": "Done", "evidence_refs": [evidence_id]}, "officer"
    )
    assert_refused(backend, case, response, "EVIDENCE_REQUIRED", 422)


def test_other_case_evidence_is_refused(backend):
    first = backend.in_progress()
    evidence_id = confirmed_evidence(backend, first)
    second = backend.in_progress()
    response = backend.command(
        second, "resolution", {"note": "Done", "evidence_refs": [evidence_id]}, "officer"
    )
    assert_refused(backend, second, response, "EVIDENCE_REQUIRED", 422)


def test_missing_confirmation_never_creates_case(backend):
    response = backend.submit(confirmation=False)
    assert response.status_code == 422
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(Case)) == 0
    assert audits(backend, result="REFUSED")[0].reason_code == "IDENTITY_OR_CONFIRMATION_REQUIRED"


def test_missing_fields_are_audited_without_raw_body(backend):
    response = backend.client.post(
        "/v1/cases", json={"confirmation": True}, headers=backend.headers(key="missing-fields")
    )
    assert response.status_code == 422
    assert audits(backend, result="REFUSED")[0].details == {}


def test_client_cannot_supply_roles_or_deadlines(backend):
    response = backend.submit(role="SUPERVISOR", current_deadline="2099-01-01")
    assert response.status_code == 422
    assert len(audits(backend, result="REFUSED")) == 1


def test_voice_actions_require_a_verified_voice_session(backend):
    response = backend.submit(channel="VOICE")
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "IDENTITY_OR_CONFIRMATION_REQUIRED"


def test_stale_version_cannot_change_case(backend):
    case = backend.in_progress()
    response = backend.command(
        case, "resolution", {"note": "Done", "evidence_refs": ["fake"]}, "officer", version=1
    )
    assert_refused(backend, case, response, "STALE_CASE_VERSION", 409)


def test_idempotent_create_returns_original_without_duplicate_audit(backend):
    first = backend.submit(key="same-create")
    second = backend.submit(key="same-create")
    assert first.status_code == second.status_code == 201
    assert first.json()["case"] == second.json()["case"]
    assert first.json()["audit_event_id"] == second.json()["audit_event_id"]
    assert len(audits(backend, result="ACCEPTED")) == 1


def test_idempotency_conflict_is_audited(backend):
    backend.submit(key="reused-key")
    response = backend.submit(key="reused-key", description="Different request")
    assert response.status_code == 409
    assert audits(backend, result="REFUSED")[0].reason_code == "IDEMPOTENCY_CONFLICT"


def test_command_retry_returns_original_despite_changed_case_version(backend):
    case = backend.submit().json()["case"]
    body = {"reason_code": "OUT_OF_JURISDICTION", "explanation": "Outside pilot boundary"}
    first = backend.command(case, "reject", body, "intake", key="reject-once")
    second = backend.command(case, "reject", body, "intake", key="reject-once")
    assert first.status_code == second.status_code == 200
    assert first.json()["case"] == second.json()["case"]
    assert len(audits(backend, operation="reject")) == 1


def test_two_concurrent_creates_with_same_key_only_create_once(backend):
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(executor.map(lambda _: backend.submit(key="concurrent-create"), range(2)))
    assert [response.status_code for response in responses] == [201, 201]
    assert responses[0].json()["case"]["id"] == responses[1].json()["case"]["id"]
    assert len(audits(backend, result="ACCEPTED")) == 1


def test_concurrent_different_commands_from_same_version_have_one_winner(backend):
    case = backend.submit().json()["case"]
    body = {"reason_code": "OUT_OF_JURISDICTION", "explanation": "Outside pilot boundary"}
    with ThreadPoolExecutor(max_workers=2) as executor:
        responses = list(
            executor.map(
                lambda who: backend.command(case, "reject", body, who),
                ("intake", "other-intake"),
            )
        )
    assert sorted(response.status_code for response in responses) == [200, 409]
    assert len(audits(backend, operation="reject", result="ACCEPTED")) == 1
    assert len(audits(backend, operation="reject", result="REFUSED")) == 1


def test_audit_insert_failure_rolls_back_assignment(backend):
    case = backend.submit().json()["case"]
    case = backend.command(
        case,
        "validate",
        {
            "category": "POTHOLE",
            "ward": "WARD-A",
            "department": "PUBLIC_WORKS",
            "jurisdiction": "Fictional Demo Municipality",
        },
        "intake",
    ).json()["case"]
    engine = backend.app.state.sessions.kw["bind"]

    def fail_audit(_conn, _cursor, statement, _params, _context, _many):
        if statement.lower().startswith("insert into audit_events"):
            raise OperationalError("audit insert", None, Exception("injected failure"))

    event.listen(engine, "before_cursor_execute", fail_audit)
    try:
        response = backend.command(
            case,
            "assign",
            {
                "officer_id": backend.users["officer"],
                "department": "PUBLIC_WORKS",
                "reason": "Demo route",
            },
            "dispatcher",
            key="retry-after-failure",
        )
        assert response.status_code == 503, response.text
    finally:
        event.remove(engine, "before_cursor_execute", fail_audit)
    with backend.sessions() as session:
        stored = session.scalar(select(Case))
        assert stored.version == case["version"]
        assert stored.owner_id is None
        assert session.scalar(select(func.count()).select_from(Assignment)) == 0
    retry = backend.command(
        case,
        "assign",
        {
            "officer_id": backend.users["officer"],
            "department": "PUBLIC_WORKS",
            "reason": "Demo route",
        },
        "dispatcher",
        key="retry-after-failure",
    )
    assert retry.status_code == 200


def test_ineligible_assignment_preserves_ownership_history(backend):
    case = backend.submit().json()["case"]
    case = backend.command(
        case,
        "validate",
        {
            "category": "POTHOLE",
            "ward": "WARD-A",
            "department": "PUBLIC_WORKS",
            "jurisdiction": "Fictional Demo Municipality",
        },
        "intake",
    ).json()["case"]
    response = backend.command(
        case,
        "assign",
        {
            "officer_id": backend.users["sanitation-officer"],
            "department": "PUBLIC_WORKS",
            "reason": "Wrong department",
        },
        "dispatcher",
    )
    assert_refused(backend, case, response, "INELIGIBLE_OWNER", 422)
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(Assignment)) == 0


def test_new_policy_does_not_change_existing_case(backend, tmp_path):
    original = backend.submit().json()["case"]
    policy = json.loads(POLICY_PATH.read_text())
    policy["version"] = "demo-pilot-v2"
    policy["categories"][0]["sla_hours"] = 1
    path = tmp_path / "policy.json"
    path.write_text(json.dumps(policy))
    with backend.sessions() as session, session.begin():
        import_policy(session, path)
    backend.app.state.workflow.settings = replace(
        backend.app.state.workflow.settings, policy_version="demo-pilot-v2"
    )
    new = backend.submit().json()["case"]
    stored = backend.client.get(f"/v1/cases/{original['id']}", headers=backend.headers()).json()[
        "case"
    ]
    assert stored["policy_version"] == "demo-pilot-v1"
    assert stored["original_deadline"] == original["original_deadline"]
    assert new["policy_version"] == "demo-pilot-v2"


def test_resolution_and_verification_request_commit_once(backend):
    case = backend.in_progress()
    evidence_id = confirmed_evidence(backend, case)
    body = {"note": "Road repaired", "evidence_refs": [evidence_id]}
    first = backend.command(case, "resolution", body, "officer", key="one-resolution")
    retry = backend.command(case, "resolution", body, "officer", key="one-resolution")
    assert first.status_code == retry.status_code == 200
    assert first.json()["case"]["workflow_state"] == "CITIZEN_VERIFICATION"
    assert first.json()["case"]["version"] == 6
    assert len(audits(backend, operation="request-verification")) == 1
    with backend.sessions() as session:
        assert session.scalar(select(func.count()).select_from(OutboxMessage)) == 1


def test_verified_citizen_acceptance_closes_case(backend):
    case = verification_case(backend)
    response = backend.command(
        case, "verification", {"outcome": "ACCEPT", "confirmation": True}, "citizen"
    )
    assert response.status_code == 200
    assert response.json()["case"]["workflow_state"] == "CLOSED"
    with backend.sessions() as session:
        assert session.scalar(select(Assignment)).ended_at is not None


def test_dispute_routes_to_supervisor_and_reassignment_preserves_history(backend):
    case = verification_case(backend)
    response = backend.command(
        case,
        "verification",
        {"outcome": "DISPUTE", "confirmation": True, "statement": "The repair has failed"},
        "citizen",
    )
    assert response.status_code == 200
    case = response.json()["case"]
    assert case["workflow_state"] == "SUPERVISOR_REVIEW"
    response = backend.command(
        case,
        "review",
        {
            "decision": "REASSIGN",
            "officer_id": backend.users["other-officer"],
            "reason": "Reinspect the repair",
        },
        "supervisor",
    )
    assert response.status_code == 200
    assert response.json()["case"]["workflow_state"] == "ASSIGNED"
    with backend.sessions() as session:
        assignments = session.scalars(select(Assignment)).all()
        assert len(assignments) == 2
        assert sum(item.ended_at is None for item in assignments) == 1


def test_pending_verification_stays_open_without_a_response(backend):
    case = verification_case(backend)
    stored = backend.client.get(f"/v1/cases/{case['id']}", headers=backend.headers()).json()["case"]
    assert stored["workflow_state"] == "CITIZEN_VERIFICATION"


def test_assignment_acceptance_cannot_bypass_supervisor_review(backend):
    case = verification_case(backend)
    case = backend.command(
        case,
        "verification",
        {
            "outcome": "DISPUTE",
            "confirmation": True,
            "statement": "Still damaged",
        },
        "citizen",
    ).json()["case"]
    response = backend.command(case, "accept-assignment", {"confirmation": True}, "supervisor")
    assert_refused(backend, case, response, "INVALID_TRANSITION", 409)


def test_review_endpoint_cannot_bypass_initial_assignment_contract(backend):
    case = backend.submit().json()["case"]
    case = backend.command(
        case,
        "validate",
        {
            "category": "POTHOLE",
            "ward": "WARD-A",
            "department": "PUBLIC_WORKS",
            "jurisdiction": "Fictional Demo Municipality",
        },
        "intake",
    ).json()["case"]
    response = backend.command(
        case,
        "review",
        {
            "decision": "REASSIGN",
            "officer_id": backend.users["officer"],
            "reason": "Bypass",
        },
        "dispatcher",
    )
    assert_refused(backend, case, response, "INVALID_TRANSITION", 409)


def test_malformed_voice_command_keeps_channel_in_audit(backend):
    response = backend.client.post(
        "/v1/cases", json={"channel": "VOICE"}, headers=backend.headers(key="malformed-voice")
    )
    assert response.status_code == 422
    assert audits(backend, result="REFUSED")[0].channel == "VOICE"


def test_transport_audit_failure_returns_dependency_error(backend):
    engine = backend.app.state.sessions.kw["bind"]

    def fail_audit(_conn, _cursor, statement, _params, _context, _many):
        if statement.lower().startswith("insert into audit_events"):
            raise OperationalError("audit insert", None, Exception("injected failure"))

    event.listen(engine, "before_cursor_execute", fail_audit)
    try:
        response = backend.client.post(
            "/v1/cases", json={"confirmation": True}, headers=backend.headers(key="bad-command")
        )
        assert response.status_code == 503
        assert response.json()["error"]["code"] == "DEPENDENCY_UNAVAILABLE"
    finally:
        event.remove(engine, "before_cursor_execute", fail_audit)
