from datetime import timedelta

from sqlalchemy import func, select

from govfix.auth import token_hash
from govfix.database import utcnow
from govfix.models import AuditEvent, AuthSession, RoleGrant, User
from tests.conftest import PASSWORD
from tests.test_workflow import verification_case


def test_login_stores_only_token_hash_and_logout_revokes_session(backend):
    response = backend.client.post(
        "/v1/auth/login", json={"username": "citizen", "password": PASSWORD}
    )
    assert response.status_code == 200
    token = response.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert backend.client.get("/v1/me", headers=headers).status_code == 200
    with backend.sessions() as session:
        auth_session = session.get(AuthSession, token_hash(token))
        assert auth_session is not None
        assert auth_session.token_hash != token
    assert backend.client.post("/v1/auth/logout", headers=headers).status_code == 200
    assert backend.client.get("/v1/me", headers=headers).status_code == 401


def test_wrong_password_and_unknown_user_have_same_response(backend):
    first = backend.client.post(
        "/v1/auth/login", json={"username": "citizen", "password": "wrong-password"}
    )
    second = backend.client.post(
        "/v1/auth/login", json={"username": "unknown", "password": "wrong-password"}
    )
    assert first.status_code == second.status_code == 401
    assert first.json()["error"] == second.json()["error"]


def test_unauthenticated_case_attempt_is_audited(backend):
    response = backend.client.post("/v1/cases", json={"description": "Missing identity"})
    assert response.status_code == 401
    with backend.sessions() as session:
        attempt = session.scalar(select(AuditEvent))
        assert attempt.actor_id is None
        assert attempt.reason_code == "UNAUTHENTICATED"


def test_expired_session_is_denied(backend):
    with backend.sessions() as session, session.begin():
        session.get(AuthSession, token_hash(backend.tokens["citizen"])).expires_at = (
            utcnow() - timedelta(seconds=1)
        )
    assert backend.client.get("/v1/me", headers=backend.headers()).status_code == 401


def test_disabled_account_cannot_use_existing_session(backend):
    with backend.sessions() as session, session.begin():
        session.get(User, backend.users["citizen"]).active = False
    assert backend.client.get("/v1/me", headers=backend.headers()).status_code == 401


def test_roles_are_loaded_from_storage_on_every_request(backend):
    case = backend.submit().json()["case"]
    with backend.sessions() as session, session.begin():
        grant = session.scalar(
            select(RoleGrant).where(RoleGrant.user_id == backend.users["intake"])
        )
        grant.role = "AUDITOR"
    response = backend.command(
        case,
        "validate",
        {
            "category": "POTHOLE",
            "ward": "WARD-A",
            "department": "PUBLIC_WORKS",
            "jurisdiction": "Fictional Demo Municipality",
        },
        "intake",
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "ROLE_NOT_ALLOWED"


def test_other_citizen_cannot_read_list_or_timeline(backend):
    case = backend.submit().json()["case"]
    for path in (
        f"/v1/cases/{case['id']}",
        f"/v1/cases/{case['id']}/timeline",
        f"/v1/cases/{case['id']}/allowed-actions",
    ):
        response = backend.client.get(path, headers=backend.headers("other-citizen"))
        assert response.status_code == 404
        assert "version" not in response.json()["error"]
    listing = backend.client.get("/v1/cases", headers=backend.headers("other-citizen")).json()
    assert listing["cases"] == []


def test_out_of_scope_staff_cannot_read_or_mutate_case(backend):
    case = backend.submit().json()["case"]
    headers = backend.headers("outside-supervisor")
    assert backend.client.get(f"/v1/cases/{case['id']}", headers=headers).status_code == 404
    assert backend.client.get("/v1/cases", headers=headers).json()["cases"] == []
    response = backend.command(
        case,
        "reject",
        {"reason_code": "DUPLICATE", "explanation": "Duplicate"},
        "outside-supervisor",
    )
    assert response.status_code == 404
    assert "case_version" not in response.json()["error"]
    assert case["id"] not in response.text


def test_refused_attempts_visible_only_to_supervisor_or_auditor(backend):
    case = backend.submit().json()["case"]
    backend.command(case, "verification", {"outcome": "ACCEPT", "confirmation": True}, "citizen")
    path = f"/v1/cases/{case['id']}/timeline"
    citizen_events = backend.client.get(path, headers=backend.headers()).json()["events"]
    auditor_events = backend.client.get(path, headers=backend.headers("auditor")).json()["events"]
    assert len(citizen_events) == 1
    assert citizen_events[0]["occurred_at"].endswith("+00:00")
    assert "actor_id" not in citizen_events[0]
    assert "details" not in citizen_events[0]
    assert len(auditor_events) == 2
    assert any(item["result"] == "REFUSED" for item in auditor_events)


def test_unverified_identity_cannot_accept_resolution(backend):
    case = verification_case(backend)
    with backend.sessions() as session, session.begin():
        session.get(User, backend.users["citizen"]).identity_verified = False
    response = backend.command(
        case, "verification", {"outcome": "ACCEPT", "confirmation": True}, "citizen"
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "IDENTITY_OR_CONFIRMATION_REQUIRED"


def test_required_command_headers_are_audited(backend):
    case = backend.submit().json()["case"]
    body = {"reason_code": "DUPLICATE", "explanation": "Duplicate request"}
    without_key = backend.client.post(
        f"/v1/cases/{case['id']}/reject",
        json=body,
        headers=backend.headers("intake", version=case["version"]),
    )
    without_version = backend.client.post(
        f"/v1/cases/{case['id']}/reject",
        json=body,
        headers=backend.headers("intake", key="missing-version"),
    )
    assert without_key.status_code == without_version.status_code == 400
    with backend.sessions() as session:
        assert (
            session.scalar(
                select(func.count()).select_from(AuditEvent).where(AuditEvent.result == "REFUSED")
            )
            == 2
        )


def test_policy_read_requires_auditor(backend):
    path = "/v1/policies/demo-pilot-v1"
    assert backend.client.get(path, headers=backend.headers()).status_code == 403
    response = backend.client.get(path, headers=backend.headers("auditor"))
    assert response.status_code == 200
    assert response.json()["policy"]["status"] == "DEMO_ONLY"


def test_cached_submission_does_not_bypass_revoked_citizen_role(backend):
    backend.submit(key="before-role-revocation")
    with backend.sessions() as session, session.begin():
        grant = session.scalar(
            select(RoleGrant).where(RoleGrant.user_id == backend.users["citizen"])
        )
        grant.role = "AUDITOR"
        grant.ward = "WARD-B"
    response = backend.submit(key="before-role-revocation")
    assert response.status_code == 403
    assert "case" not in response.json()


def test_unauthenticated_voice_attempt_preserves_channel(backend):
    response = backend.client.post(
        "/v1/cases",
        json={
            "description": "Demo road issue",
            "location": "Main road",
            "category": "POTHOLE",
            "ward": "WARD-A",
            "confirmation": True,
            "channel": "VOICE",
        },
    )
    assert response.status_code == 401
    with backend.sessions() as session:
        attempt = session.scalar(select(AuditEvent))
        assert attempt.channel == "VOICE"


def test_allowed_actions_respect_role_state_and_owner(backend):
    case = backend.in_progress()
    path = f"/v1/cases/{case['id']}/allowed-actions"
    owner = backend.client.get(path, headers=backend.headers("officer")).json()
    other = backend.client.get(path, headers=backend.headers("other-officer")).json()
    assert owner["actions"][0]["operation"] == "resolution"
    assert other["actions"] == []


def test_request_ids_and_safe_validation_errors(backend):
    response = backend.client.post(
        "/v1/auth/login", json={"username": "citizen", "password": PASSWORD, "role": "ADMIN"}
    )
    assert response.status_code == 422
    assert PASSWORD not in response.text
    assert response.headers["x-request-id"] == response.json()["request_id"]
