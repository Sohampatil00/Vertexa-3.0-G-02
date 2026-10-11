from dataclasses import replace
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from govfix.api import create_app
from govfix.settings import Settings
from scripts.audit_supabase import audit
from tests.conftest import PASSWORD


def test_database_keys_do_not_switch_local_login_provider(backend):
    settings = Settings(
        database_url=backend.url,
        supabase_url="https://example.supabase.co",
        supabase_anon_key="unused-storage-key",
    )
    with TestClient(create_app(settings)) as client:
        response = client.post("/v1/auth/login", json={"username": "citizen", "password": PASSWORD})
        assert response.status_code == 200
        headers = {"Authorization": "Bearer " + response.json()["access_token"]}
        assert client.get("/v1/me", headers=headers).status_code == 200
        response = client.post(
            "/v1/cases",
            headers={**headers, "Idempotency-Key": "provider-test"},
            json={
                "description": "Pilot road issue",
                "location": "Demo road",
                "ward": "WARD-A",
                "category": "POTHOLE",
                "confirmation": True,
            },
        )
        assert response.status_code == 201
        case = response.json()["case"]
        assert client.get(f"/v1/cases/{case['id']}/timeline", headers=headers).status_code == 200
        assert (
            client.get(
                f"/v1/cases/{case['id']}", headers=backend.headers("other-citizen")
            ).status_code
            == 404
        )
        assert client.post("/v1/auth/logout", headers=headers).status_code == 200
        assert client.get(f"/v1/cases/{case['id']}", headers=headers).status_code == 401


@pytest.mark.parametrize("identity", ["citizen", "missing", "disabled"])
def test_supabase_login_uses_verified_identity_and_revocable_session(
    backend, monkeypatch, identity
):
    import supabase

    from govfix.models import User

    remote_id = backend.users["citizen"] if identity != "missing" else "unmapped-uuid"
    if identity == "disabled":
        with backend.sessions() as session, session.begin():
            session.get(User, remote_id).active = False

    def create_client(url, key, options):
        assert not options.persist_session and not options.auto_refresh_token

        def get_user(token):
            assert token == "provider-jwt"
            return SimpleNamespace(user=SimpleNamespace(id=remote_id))

        return SimpleNamespace(
            auth=SimpleNamespace(
                sign_in_with_password=lambda credentials: SimpleNamespace(
                    session=SimpleNamespace(access_token="provider-jwt"),
                    user=SimpleNamespace(id="untrusted-response-id"),
                ),
                get_user=get_user,
            )
        )

    monkeypatch.setattr(supabase, "create_client", create_client)
    settings = replace(
        Settings(database_url=backend.url),
        auth_provider="supabase",
        supabase_url="https://example.supabase.co",
        supabase_anon_key="test-key",
    )
    with TestClient(create_app(settings)) as client:
        response = client.post(
            "/v1/auth/login", json={"username": "test@example.com", "password": PASSWORD}
        )
        if identity != "citizen":
            assert response.status_code == 401
            return
        assert response.status_code == 200
        token = response.json()["access_token"]
        assert token != "provider-jwt"
        headers = {"Authorization": f"Bearer {token}"}
        assert client.get("/v1/me", headers=headers).json()["id"] == remote_id
        assert (
            client.get("/v1/me", headers={"Authorization": "Bearer provider-jwt"}).status_code
            == 401
        )
        assert client.post("/v1/auth/logout", headers=headers).status_code == 200
        assert client.get("/v1/me", headers=headers).status_code == 401


def test_supabase_provider_outage_never_falls_back_to_local_password(backend, monkeypatch):
    import supabase

    def failing_client(*args, **kwargs):
        def failure(credentials):
            raise OSError("private provider details")

        return SimpleNamespace(auth=SimpleNamespace(sign_in_with_password=failure))

    monkeypatch.setattr(supabase, "create_client", failing_client)
    settings = Settings(
        database_url=backend.url,
        auth_provider="supabase",
        supabase_url="https://example.supabase.co",
        supabase_anon_key="key",
    )
    with TestClient(create_app(settings)) as client:
        response = client.post("/v1/auth/login", json={"username": "citizen", "password": PASSWORD})
        assert response.status_code == 503
        assert "private provider details" not in response.text


def test_postgres_permission_boundary(backend):
    with backend.sessions() as session:
        connection = session.connection()
        if connection.dialect.name != "postgresql":
            pytest.skip("PostgreSQL roles and RLS required")
        assert all(row["safe"] for row in audit(connection))
        for role in ("anon", "authenticated", "service_role"):
            # Disposable test PostgreSQL only; fixture URL must never be production.
            if not connection.execute(
                text("SELECT 1 FROM pg_roles WHERE rolname=:role"), {"role": role}
            ).scalar():
                connection.exec_driver_sql(f"CREATE ROLE {role}")
        session.commit()
    from govfix.cli import migrate

    migrate(backend.url, "0006", downgrade=True)
    migrate(backend.url)
    with backend.sessions() as session:
        assert all(row["safe"] for row in audit(session.connection()))
        session.execute(text("GRANT USAGE ON SCHEMA public TO anon"))
        session.execute(text("GRANT SELECT ON public.users TO anon"))
        session.execute(text("SET LOCAL ROLE anon"))
        assert session.execute(text("SELECT id FROM public.users")).all() == []
        # Roll back the temporary regrant along with SET LOCAL ROLE.


@pytest.mark.parametrize("status,expected", [(400, 401), (401, 401), (429, 503), (500, 503)])
def test_native_provider_errors_are_safe(backend, monkeypatch, status, expected):
    import supabase
    from supabase_auth.errors import AuthApiError

    def create_client(*args, **kwargs):
        def refuse(credentials):
            raise AuthApiError("private provider diagnostic", status, "test_error")

        return SimpleNamespace(auth=SimpleNamespace(sign_in_with_password=refuse))

    monkeypatch.setattr(supabase, "create_client", create_client)
    settings = Settings(
        database_url=backend.url,
        auth_provider="supabase",
        supabase_url="https://example.supabase.co",
        supabase_anon_key="test",
    )
    with TestClient(create_app(settings)) as client:
        response = client.post("/v1/auth/login", json={"username": "citizen", "password": PASSWORD})
        assert response.status_code == expected
        assert "access_token" not in response.json()
        assert "private provider diagnostic" not in response.text
