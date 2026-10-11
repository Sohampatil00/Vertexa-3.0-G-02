"""Hosted startup must reject unsafe or ephemeral deployment configuration."""

import pytest

from scripts.render_start import startup_command


@pytest.fixture
def deployment_env():
    return {
        "GOVFIX_DATABASE_URL": (
            "postgresql://govfix_runtime:fake-password@db.example.com:5432/postgres"
            "?sslmode=require"
        ),
        "GOVFIX_REQUIRE_RESTRICTED_ROLE": "true",
        "GOVFIX_LOGIN_RATE_SECRET": "test-secret-" * 4,
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "fake-test-service-key",
        "SUPABASE_STORAGE_BUCKET": "evidence",
        "PORT": "12345",
    }


def test_web_binds_render_port_without_sensitive_access_logs(deployment_env):
    command = startup_command("web", deployment_env)
    assert command[command.index("--host") + 1] == "0.0.0.0"
    assert command[command.index("--port") + 1] == "12345"
    assert "--no-access-log" in command
    assert "--no-proxy-headers" in command
    assert deployment_env["GOVFIX_DATABASE_URL"] not in " ".join(command)


def test_worker_does_not_require_web_storage_credentials(deployment_env):
    env = {key: value for key, value in deployment_env.items() if not key.startswith("SUPABASE")}
    assert startup_command("worker", env)[1:] == [
        "-m", "govfix.cli", "worker", "--poll-seconds", "30",
    ]


@pytest.mark.parametrize("key,value", [
    ("GOVFIX_MIGRATION_DATABASE_URL", "postgresql://owner:private@db.example.com/postgres"),
    ("GOVFIX_REQUIRE_RESTRICTED_ROLE", "false"),
    ("GOVFIX_DATABASE_URL", "sqlite:///./govfix.db"),
    ("GOVFIX_DATABASE_URL", "postgresql://user:private@db.example.com/postgres?sslmode=disable"),
    ("GOVFIX_DATABASE_URL", "invalid-private-secret"),
    ("GOVFIX_LOGIN_RATE_SECRET", "local-demo-login-budget"),
    ("SUPABASE_SERVICE_ROLE_KEY", ""),
    ("SUPABASE_URL", "http://example.supabase.co"),
    ("PORT", "not-a-port"),
    ("PORT", "65536"),
    ("FORWARDED_ALLOW_IPS", "*"),
])
def test_unsafe_configuration_fails_without_exposing_secrets(deployment_env, key, value):
    deployment_env[key] = value
    with pytest.raises(ValueError) as error:
        startup_command("web", deployment_env)
    assert "private" not in str(error.value)
    assert "fake-password" not in str(error.value)
    assert "fake-test-service-key" not in str(error.value)


def test_explicit_trusted_proxy_range_enables_forwarded_headers(deployment_env):
    deployment_env["FORWARDED_ALLOW_IPS"] = "10.0.0.0/8"
    command = startup_command("web", deployment_env)
    assert "--proxy-headers" in command
    assert command[command.index("--forwarded-allow-ips") + 1] == "10.0.0.0/8"
