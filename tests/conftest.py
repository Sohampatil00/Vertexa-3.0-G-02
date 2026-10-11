import os
import secrets
from dataclasses import dataclass
from datetime import timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from govfix.api import create_app
from govfix.auth import password_hasher, token_hash
from govfix.cli import import_policy, migrate
from govfix.database import make_engine, make_sessions, utcnow
from govfix.models import AuthSession, RoleGrant, User
from govfix.settings import Settings

POLICY_PATH = Path(__file__).resolve().parents[1] / "config/policies/demo-pilot-v1.json"
PASSWORD = "local-test-password-2026"
PASSWORD_HASH = password_hasher.hash(PASSWORD)


@dataclass
class Backend:
    client: TestClient
    sessions: object
    app: object
    users: dict
    tokens: dict
    url: str

    def headers(self, who="citizen", key=None, version=None):
        headers = {"Authorization": f"Bearer {self.tokens[who]}"}
        if key is not None:
            headers["Idempotency-Key"] = key
        if version is not None:
            headers["If-Match"] = f'"{version}"'
        return headers

    def submit(self, who="citizen", key=None, **overrides):
        body = {
            "description": "Pothole near the bus stop",
            "location": "Demo main road",
            "category": "POTHOLE",
            "ward": "WARD-A",
            "confirmation": True,
            **overrides,
        }
        return self.client.post(
            "/v1/cases", json=body, headers=self.headers(who, key or secrets.token_hex(12))
        )

    def command(self, case, operation, body, who, *, key=None, version=None):
        return self.client.post(
            f"/v1/cases/{case['id']}/{operation}",
            json=body,
            headers=self.headers(
                who, key or secrets.token_hex(12), case["version"] if version is None else version
            ),
        )

    def assigned(self):
        case = self.submit().json()["case"]
        case = self.command(
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
        case = self.command(
            case,
            "assign",
            {
                "officer_id": self.users["officer"],
                "department": "PUBLIC_WORKS",
                "reason": "Demo route",
            },
            "dispatcher",
        ).json()["case"]
        return case

    def in_progress(self):
        case = self.assigned()
        return self.command(case, "accept-assignment", {"confirmation": True}, "officer").json()[
            "case"
        ]


@pytest.fixture
def backend(tmp_path):
    # The optional PostgreSQL URL must point to a disposable test database.
    external_url = os.getenv("GOVFIX_TEST_DATABASE_URL")
    url = external_url or f"sqlite:///{tmp_path / 'test.db'}"
    if external_url:
        migrate(url, "base", downgrade=True)
    migrate(url)
    engine = make_engine(url)
    sessions = make_sessions(engine)
    users, tokens = {}, {}
    roles = {
        "citizen": ("CITIZEN", None, None),
        "other-citizen": ("CITIZEN", None, None),
        "intake": ("INTAKE_OFFICER", "WARD-A", None),
        "other-intake": ("INTAKE_OFFICER", "WARD-A", None),
        "dispatcher": ("DISPATCHER", "WARD-A", "PUBLIC_WORKS"),
        "officer": ("OFFICER", "WARD-A", "PUBLIC_WORKS"),
        "other-officer": ("OFFICER", "WARD-A", "PUBLIC_WORKS"),
        "sanitation-officer": ("OFFICER", "WARD-A", "SANITATION"),
        "supervisor": ("SUPERVISOR", "WARD-A", None),
        "outside-supervisor": ("SUPERVISOR", "WARD-B", None),
        "auditor": ("AUDITOR", "WARD-A", None),
    }
    with sessions() as session, session.begin():
        import_policy(session, POLICY_PATH)
        for name, (role, ward, department) in roles.items():
            user = User(
                username=name,
                display_name=name,
                password_hash=PASSWORD_HASH,
                identity_verified=name == "citizen",
            )
            session.add(user)
            session.flush()
            users[name] = user.id
            session.add(RoleGrant(user_id=user.id, role=role, ward=ward, department=department))
            tokens[name] = secrets.token_urlsafe(32)
            session.add(
                AuthSession(
                    token_hash=token_hash(tokens[name]),
                    user_id=user.id,
                    expires_at=utcnow() + timedelta(hours=1),
                )
            )
    app = create_app(Settings(database_url=url, evidence_directory=str(tmp_path / "evidence")))
    with TestClient(app) as client:
        yield Backend(client, sessions, app, users, tokens, url)
    engine.dispose()
    if external_url:
        migrate(url, "base", downgrade=True)
