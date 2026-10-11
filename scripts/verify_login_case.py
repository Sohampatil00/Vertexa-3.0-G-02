"""Verify login-to-case on the configured DB, rolling back ALL verification records.

Uses isolated savepoints on one connection, so request commits are exercised without
leaving demo accounts, cases, audit events or outbox messages in the live database.
Load .env first. This checks the current local-account provider through the HTTP API.
"""

import secrets
from unittest.mock import patch

from fastapi.testclient import TestClient
from sqlalchemy.orm import sessionmaker

from govfix.api import create_app
from govfix.cli import provision_user
from govfix.database import make_engine
from govfix.settings import Settings


def verify(settings):
    if settings.auth_provider != "local":
        raise ValueError(
            "Live smoke requires local provider; native Auth needs a provisioned identity"
        )
    engine = make_engine(settings.migration_database_url or settings.database_url)
    try:
        with engine.connect() as connection:
            transaction = connection.begin()
            sessions = sessionmaker(
                bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
            )
            password = secrets.token_urlsafe(24)
            names = ["smoke-" + secrets.token_hex(8) for _ in range(2)]
            try:
                with sessions() as session, session.begin():
                    for name in names:
                        provision_user(
                            session,
                            username=name,
                            display_name="Rollback verification",
                            password=password,
                            role="CITIZEN",
                        )
                if settings.migration_database_url:
                    # Seed with administration rights, then verify under backend RLS/privileges.
                    connection.exec_driver_sql("SET LOCAL ROLE govfix_backend")
                with patch("govfix.api.make_sessions", return_value=sessions):
                    app = create_app(settings)
                with TestClient(app) as client:

                    def login(name):
                        response = client.post(
                            "/v1/auth/login", json={"username": name, "password": password}
                        )
                        assert response.status_code == 200
                        return {"Authorization": "Bearer " + response.json()["access_token"]}

                    headers, other = login(names[0]), login(names[1])
                    assert client.get("/v1/me", headers=headers).status_code == 200
                    assert client.get("/v1/intake-options", headers=headers).status_code == 200
                    response = client.post(
                        "/v1/cases",
                        headers={**headers, "Idempotency-Key": secrets.token_hex(16)},
                        json={
                            "description": "Rollback pilot workflow verification",
                            "location": "Fictional demo road",
                            "category": "POTHOLE",
                            "ward": "WARD-A",
                            "confirmation": True,
                        },
                    )
                    assert response.status_code == 201
                    case = response.json()["case"]
                    assert case["id"] in str(client.get("/v1/cases", headers=headers).json())
                    for suffix in ("", "/timeline", "/allowed-actions"):
                        path = f"/v1/cases/{case['id']}{suffix}"
                        assert client.get(path, headers=headers).status_code == 200
                        assert client.get(path, headers=other).status_code == 404
                    assert client.get("/v1/cases", headers=other).json()["cases"] == []
                    assert client.post("/v1/auth/logout", headers=headers).status_code == 200
                    assert client.get(f"/v1/cases/{case['id']}", headers=headers).status_code == 401
            finally:
                transaction.rollback()
            print(
                "PASS: login, identity, intake, create, list, detail, timeline, "
                "actions, ownership, logout"
            )
            print("Verification records rolled back; no live accounts or cases retained.")
    finally:
        engine.dispose()


if __name__ == "__main__":
    verify(Settings.from_env())
