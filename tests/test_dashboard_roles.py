"""Dashboard context must narrow a multi-role account throughout reads and commands."""

import secrets
from dataclasses import replace
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from govfix.api import create_app
from govfix.models import AuditEvent, Case, Notification, OutboxMessage, RoleGrant, User
from govfix.worker import Worker
from tests.test_operations import photo
from tests.test_workflow import verification_case


def grant_roles(backend, who, *roles):
    with backend.sessions() as session, session.begin():
        for role in roles:
            session.add(RoleGrant(user_id=backend.users[who], role=role, ward="WARD-A"))


def role_headers(backend, role, who="citizen", **kwargs):
    return {**backend.headers(who, **kwargs), "X-GovFix-Role": role}


def test_citizen_context_hides_other_reports_and_staff_details(backend):
    own = backend.in_progress()
    other = backend.submit(who="other-citizen").json()["case"]
    grant_roles(backend, "citizen", "SUPERVISOR", "AUDITOR")
    citizen = role_headers(backend, "CITIZEN")
    supervisor = role_headers(backend, "SUPERVISOR")
    path = f"/v1/cases/{own['id']}"
    assert backend.client.get("/v1/operations/summary", headers=citizen).json()["total"] == 1
    assert backend.client.get("/v1/operations/summary", headers=supervisor).json()["total"] == 2
    assert [c["id"] for c in backend.client.get("/v1/cases", headers=citizen).json()["cases"]] == [
        own["id"]
    ]
    for suffix in ("", "/operations", "/timeline", "/allowed-actions", "/sla", "/evidence"):
        assert (
            backend.client.get(f"/v1/cases/{other['id']}{suffix}", headers=citizen).status_code
            == 404
        )
    operations = backend.client.get(path + "/operations", headers=citizen).json()
    assert operations["assignments"] == []
    assert operations["officers"] == []
    assert backend.client.get(path + "/operations", headers=supervisor).json()["assignments"]
    assert backend.client.get(path + "/allowed-actions", headers=citizen).json()["actions"] == []
    staff_events = backend.client.get(path + "/timeline", headers=supervisor).json()["events"]
    citizen_events = backend.client.get(path + "/timeline", headers=citizen).json()["events"]
    assert staff_events and "actor_role" in staff_events[0]
    assert citizen_events and all("actor_role" not in event for event in citizen_events)
    assert all("details" not in event for event in citizen_events)
    assert backend.client.get(path + "/sla", headers=citizen).json()["deliveries"] == []


@pytest.mark.parametrize(
    "role", ["CITIZEN", "INTAKE_OFFICER", "DISPATCHER", "OFFICER", "WARD_HEAD", "AUDITOR"]
)
def test_staff_command_cannot_inherit_supervisor_role_in_another_dashboard(backend, role):
    case = backend.submit().json()["case"]
    grant_roles(backend, "citizen", "SUPERVISOR", *([] if role == "CITIZEN" else [role]))
    body = {
        "new_deadline": (
            datetime.fromisoformat(case["current_deadline"]) + timedelta(hours=24)
        ).isoformat(),
        "reason": "Approved additional repair window",
    }
    path = f"/v1/cases/{case['id']}/deadline-extension"
    denied = backend.client.post(
        path,
        json=body,
        headers=role_headers(backend, role, key=secrets.token_hex(12), version=case["version"]),
    )
    assert denied.status_code == 403, denied.text
    assert denied.json()["error"]["code"] == "ROLE_NOT_ALLOWED"
    granted = backend.client.post(
        path,
        json=body,
        headers=role_headers(
            backend, "SUPERVISOR", key=secrets.token_hex(12), version=case["version"]
        ),
    )
    assert granted.status_code == 200, granted.text
    with backend.sessions() as session:
        event = session.scalar(
            select(AuditEvent).where(AuditEvent.request_id == granted.json()["request_id"])
        )
        assert event.actor_role == "SUPERVISOR"


def test_dashboard_role_must_be_a_stored_grant(backend):
    for role in ("SUPERVISOR", "ADMIN", "", "citizen"):
        response = backend.client.get("/v1/cases", headers=role_headers(backend, role))
        assert response.status_code == 403
    grant_roles(backend, "citizen", "SUPERVISOR")
    assert (
        backend.client.get("/v1/cases", headers=role_headers(backend, "SUPERVISOR")).status_code
        == 200
    )
    with backend.sessions() as session, session.begin():
        grant = session.scalar(
            select(RoleGrant).where(
                RoleGrant.user_id == backend.users["citizen"], RoleGrant.role == "SUPERVISOR"
            )
        )
        session.delete(grant)
    assert (
        backend.client.get("/v1/cases", headers=role_headers(backend, "SUPERVISOR")).status_code
        == 403
    )


def test_notifications_follow_recipient_role_even_for_a_personal_report(backend):
    case = backend.submit().json()["case"]
    grant_roles(backend, "citizen", "SUPERVISOR")
    body = {
        "new_deadline": (
            datetime.fromisoformat(case["current_deadline"]) + timedelta(hours=24)
        ).isoformat(),
        "reason": "Repair materials delayed",
    }
    response = backend.client.post(
        f"/v1/cases/{case['id']}/deadline-extension",
        json=body,
        headers=role_headers(backend, "SUPERVISOR", key="extend", version=case["version"]),
    )
    assert response.status_code == 200
    worker = Worker(backend.sessions, backend.app.state.workflow.settings)
    assert worker.dispatch()["DELIVERED"] == 1
    with backend.sessions() as session, session.begin():
        row = session.scalar(select(Case).where(Case.public_id == case["id"]))
        event = backend.app.state.workflow.audit(
            session,
            actor=None,
            case=row,
            operation="sla-threshold",
            request_id="role-test",
            role="SYSTEM",
            details={"threshold": "TEST"},
        )
        message = OutboxMessage(
            event_id=event.id, kind="SLA_THRESHOLD", payload={"recipient_role": "SUPERVISOR"}
        )
        session.add(message)
        session.flush()
        session.add(
            Notification(
                message_id=message.id,
                recipient_id=backend.users["citizen"],
                case_id=row.id,
                kind=message.kind,
            )
        )
    for role, expected in (("CITIZEN", "DEADLINE_EXTENDED"), ("SUPERVISOR", "SLA_THRESHOLD")):
        notices = backend.client.get(
            "/v1/notifications?limit=1", headers=role_headers(backend, role)
        ).json()["notifications"]
        assert len(notices) == 1 and notices[0]["kind"] == expected


def test_voice_control_is_available_only_for_configured_languages_and_verified_citizens(backend):
    assert backend.client.get("/v1/me", headers=backend.headers()).json()["voice_languages"] == []
    settings = replace(
        backend.app.state.workflow.settings,
        elevenlabs_api_key="test-key",
        elevenlabs_agent_mr="test-agent",
    )
    with TestClient(create_app(settings)) as client:
        assert client.get("/v1/me", headers=backend.headers()).json()["voice_languages"] == ["mr"]
        assert (
            client.get("/v1/me", headers=backend.headers("other-citizen")).json()["voice_languages"]
            == []
        )
        assert (
            client.get("/v1/me", headers=backend.headers("supervisor")).json()["voice_languages"]
            == []
        )
        with backend.sessions() as session, session.begin():
            session.get(User, backend.users["citizen"]).identity_verified = False
        assert client.get("/v1/me", headers=backend.headers()).json()["voice_languages"] == []


def test_resolution_verification_stays_in_citizen_context(backend):
    case = verification_case(backend)
    grant_roles(backend, "citizen", "SUPERVISOR", "AUDITOR")
    path = f"/v1/cases/{case['id']}"
    citizen = role_headers(backend, "CITIZEN")
    supervisor = role_headers(backend, "SUPERVISOR")
    actions = backend.client.get(path + "/allowed-actions", headers=citizen).json()["actions"]
    assert {action["operation"] for action in actions} == {"verification"}
    assert "verification" not in {
        action["operation"]
        for action in backend.client.get(path + "/allowed-actions", headers=supervisor).json()[
            "actions"
        ]
    }
    body = {"outcome": "ACCEPT", "confirmation": True}
    denied = backend.client.post(
        path + "/verification",
        json=body,
        headers=role_headers(
            backend, "SUPERVISOR", key="staff-verification", version=case["version"]
        ),
    )
    assert denied.status_code == 403
    accepted = backend.client.post(
        path + "/verification",
        json=body,
        headers=role_headers(
            backend, "CITIZEN", key="citizen-verification", version=case["version"]
        ),
    )
    assert accepted.status_code == 200
    assert accepted.json()["case"]["workflow_state"] == "CLOSED"


def test_evidence_upload_cannot_inherit_officer_role_in_citizen_mode(backend):
    import hashlib

    grant_roles(backend, "officer", "CITIZEN", "SUPERVISOR")
    case = backend.submit(who="officer").json()["case"]
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
    case = backend.command(
        case,
        "assign",
        {
            "officer_id": backend.users["officer"],
            "department": "PUBLIC_WORKS",
            "reason": "Repair crew",
        },
        "dispatcher",
    ).json()["case"]
    case = backend.command(case, "accept-assignment", {"confirmation": True}, "officer").json()[
        "case"
    ]
    data = photo()
    path = f"/v1/cases/{case['id']}/evidence?kind=AFTER_PHOTO"
    for role, expected in (("CITIZEN", 403), ("SUPERVISOR", 403), ("OFFICER", 201)):
        response = backend.client.post(
            path,
            content=data,
            headers={
                **role_headers(backend, role, who="officer", key=role, version=case["version"]),
                "Content-Type": "image/png",
                "X-Content-SHA256": hashlib.sha256(data).hexdigest(),
            },
        )
        assert response.status_code == expected, response.text
