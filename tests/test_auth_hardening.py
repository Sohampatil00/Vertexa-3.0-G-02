from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import sessionmaker

from govfix.api import create_app
from govfix.database import utcnow, verify_runtime_role
from govfix.errors import Refusal
from govfix.login_limits import reserve_login
from govfix.models import AuthSession, LoginBudget
from govfix.settings import Settings
from tests.conftest import PASSWORD


def test_login_budget_shared_between_apps_and_ignores_forwarded_header(backend):
    settings = Settings(database_url=backend.url, login_account_limit=2, login_ip_limit=10)
    with TestClient(create_app(settings)) as one, TestClient(create_app(settings)) as two:
        payload = {"username": "citizen", "password": "incorrect"}
        assert one.post("/v1/auth/login", json=payload).status_code == 401
        assert two.post("/v1/auth/login", json=payload).status_code == 401
        response = one.post(
            "/v1/auth/login",
            json={**payload, "password": PASSWORD},
            headers={"X-Forwarded-For": "192.0.2.99"},
        )
        assert response.status_code == 429
        assert 1 <= int(response.headers["Retry-After"]) <= 900
        assert response.json()["error"]["code"] == "LOGIN_RATE_LIMITED"
        assert PASSWORD not in response.text
        with backend.sessions() as session:
            assert session.scalars(select(LoginBudget)).all()
            assert session.get(AuthSession, response.json().get("access_token", "none")) is None


def test_ip_budget_blocks_username_rotation_without_allocating_accounts(backend):
    settings = Settings(login_ip_limit=2)
    reserve_login(backend.sessions, settings, "192.0.2.1", "account-a")
    reserve_login(backend.sessions, settings, "192.0.2.1", "account-b")
    for index in range(20):
        with pytest.raises(Refusal) as caught:
            reserve_login(backend.sessions, settings, "192.0.2.1", f"rotating-{index}")
        assert caught.value.status == 429
    with backend.sessions() as session:
        rows = session.scalars(select(LoginBudget)).all()
        assert len(rows) == 3
        assert all(len(row.key) == 64 for row in rows)
        assert all("account" not in row.key and "192.0.2.1" not in row.key for row in rows)


def test_budget_expiry_and_success_do_not_reset_security_window(backend):
    settings = Settings(login_account_limit=1, login_ip_limit=10, login_window_seconds=10)
    now = utcnow()
    reserve_login(backend.sessions, settings, "ip-a", "Citizen", now=now)
    with pytest.raises(Refusal):
        reserve_login(backend.sessions, settings, "ip-b", " citizen ", now=now)
    reserve_login(backend.sessions, settings, "ip-b", "citizen", now=now + timedelta(seconds=10))


def test_concurrent_attempts_cannot_exceed_account_budget(backend):
    settings = Settings(login_account_limit=3, login_ip_limit=100)

    def attempt(index):
        try:
            reserve_login(backend.sessions, settings, f"client-{index}", "same-account")
            return True
        except Refusal:
            return False

    with ThreadPoolExecutor(max_workers=8) as pool:
        assert sum(pool.map(attempt, range(12))) == 3


def test_budget_database_failure_refuses_login(backend, monkeypatch):
    def unavailable(*args, **kwargs):
        raise DBAPIError(None, None, OSError("private failure"))

    monkeypatch.setattr("govfix.api.reserve_login", unavailable)
    response = backend.client.post(
        "/v1/auth/login", json={"username": "citizen", "password": PASSWORD}
    )
    assert response.status_code == 503
    assert "private failure" not in response.text
    assert "access_token" not in response.json()


def test_restricted_role_can_login_and_run_workflow_but_not_administer(backend):
    with backend.sessions() as session:
        if session.get_bind().dialect.name != "postgresql":
            pytest.skip("PostgreSQL role privileges required")
    engine = backend.app.state.workflow.sessions.kw["bind"]
    with engine.connect() as connection:
        transaction = connection.begin()
        with pytest.raises(RuntimeError, match="restricted backend"):
            verify_runtime_role(connection)
        connection.exec_driver_sql("SET LOCAL ROLE govfix_backend")
        sessions = sessionmaker(
            bind=connection, expire_on_commit=False, join_transaction_mode="create_savepoint"
        )
        with patch("govfix.api.make_sessions", return_value=sessions):
            app = create_app(Settings(database_url=backend.url, require_restricted_role=True))
        with TestClient(app) as client:
            original_client = backend.client
            backend.client = client
            try:
                for who in ("citizen", "intake", "dispatcher", "officer"):
                    response = client.post(
                        "/v1/auth/login", json={"username": who, "password": PASSWORD}
                    )
                    assert response.status_code == 200
                case = backend.in_progress()
                assert case["workflow_state"] == "IN_PROGRESS"
                from govfix.worker import Worker

                worker = Worker(sessions, Settings(), clock=lambda: utcnow() + timedelta(days=5))
                result = worker.run_once()
                assert "error" not in result
                assert result["sla"]["thresholds_recorded"] > 0
                assert (
                    client.get(
                        f"/v1/cases/{case['id']}/timeline", headers=backend.headers()
                    ).status_code
                    == 200
                )
            finally:
                backend.client = original_client
        for sql in (
            "CREATE TABLE public.forbidden_table (id int)",
            "UPDATE public.users SET password_hash='invalid' WHERE false",
            "INSERT INTO public.users (id,username) VALUES ('bad','bad')",
            "UPDATE public.user_roles SET role=role WHERE false",
            "DELETE FROM public.audit_events WHERE false",
            "UPDATE public.policy_versions SET checksum=checksum WHERE false",
            "TRUNCATE public.login_budgets",
            "ALTER TABLE public.grievances DISABLE ROW LEVEL SECURITY",
            "CREATE ROLE forbidden_role",
        ):
            savepoint = connection.begin_nested()
            try:
                with pytest.raises(DBAPIError) as caught:
                    connection.exec_driver_sql(sql)
                assert caught.value.orig.sqlstate == "42501"
            finally:
                savepoint.rollback()
        transaction.rollback()


def test_worker_prunes_expired_budgets_without_removing_current_window(backend):
    from govfix.worker import Worker

    now = utcnow()
    settings = Settings(login_window_seconds=10)
    reserve_login(
        backend.sessions, settings, "old-ip", "old-account", now=now - timedelta(seconds=11)
    )
    reserve_login(backend.sessions, settings, "new-ip", "new-account", now=now)
    worker = Worker(backend.sessions, settings, clock=lambda: now)
    assert worker.prune_login_budgets(limit=1) == 1
    assert worker.prune_login_budgets(limit=10) == 1
    with backend.sessions() as session:
        rows = session.scalars(select(LoginBudget)).all()
        assert len(rows) == 2
        assert all(row.attempts == 1 for row in rows)
