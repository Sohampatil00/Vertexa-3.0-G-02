"""Explicit runtime configuration for the local pilot backend."""

import os
from dataclasses import dataclass
from datetime import timedelta


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./govfix.db"
    require_restricted_role: bool = False
    migration_database_url: str | None = None
    login_account_limit: int = 5
    login_ip_limit: int = 30
    login_window_seconds: int = 900
    login_rate_secret: str = "local-demo-login-budget"
    readiness_timeout_ms: int = 2000
    worker_stale_seconds: int = 120
    notification_backlog_seconds: int = 300
    policy_version: str = "demo-pilot-v1"
    session_minutes: int = 60
    evidence_directory: str = "./var/evidence"
    evidence_max_bytes: int = 5 * 1024 * 1024
    auth_provider: str = "local"
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None
    supabase_storage_bucket: str = "evidence"

    elevenlabs_webhook_secret: str | None = None
    elevenlabs_api_key: str | None = None
    elevenlabs_agent_en: str | None = None
    elevenlabs_agent_hi: str | None = None
    elevenlabs_agent_mr: str | None = None

    @property
    def notification_backlog_delta(self):
        return timedelta(seconds=self.notification_backlog_seconds)

    def __post_init__(self):
        if not 100 <= self.readiness_timeout_ms <= 10000:
            raise ValueError("Readiness timeout must be 100–10000 milliseconds")
        if not 1 <= self.worker_stale_seconds <= 86400:
            raise ValueError("Worker staleness must be 1–86400 seconds")
        if not 1 <= self.notification_backlog_seconds <= 86400:
            raise ValueError("Notification backlog threshold must be 1–86400 seconds")
        if not 1 <= self.login_account_limit <= 100 or not 1 <= self.login_ip_limit <= 1000:
            raise ValueError("Login limits must be within account 1–100 and IP 1–1000")
        if not 1 <= self.login_window_seconds <= 86400:
            raise ValueError("Login window must be 1–86400 seconds")
        if len(self.login_rate_secret) < 16:
            raise ValueError("Login rate secret must have at least 16 characters")
        if self.auth_provider not in ("local", "supabase"):
            raise ValueError("auth_provider must be local or supabase")
        if self.auth_provider == "supabase" and not (self.supabase_url and self.supabase_anon_key):
            raise ValueError("Supabase Auth requires SUPABASE_URL and SUPABASE_ANON_KEY")
        if not 1 <= self.evidence_max_bytes <= 20 * 1024 * 1024:
            raise ValueError("evidence_max_bytes must be between 1 byte and 20 MiB")
        if not 1 <= self.session_minutes <= 1440:
            raise ValueError("session_minutes must be between 1 and 1440")

    @classmethod
    def from_env(cls):
        database_url = os.getenv("GOVFIX_DATABASE_URL", "sqlite:///./govfix.db")
        if os.getenv("SUPABASE_URL") and not database_url.startswith(
            ("postgres://", "postgresql://", "postgresql+psycopg://")
        ):
            raise ValueError(
                "Supabase requires GOVFIX_DATABASE_URL with a PostgreSQL connection string; "
                "SQLite fallback is disabled when SUPABASE_URL is configured"
            )
        return cls(
            elevenlabs_webhook_secret=os.getenv("GOVFIX_ELEVENLABS_WEBHOOK_SECRET"),
            elevenlabs_api_key=os.getenv("ELEVENLABS_API_KEY"),
            elevenlabs_agent_en=os.getenv("GOVFIX_ELEVENLABS_AGENT_EN"),
            elevenlabs_agent_hi=os.getenv("GOVFIX_ELEVENLABS_AGENT_HI"),
            elevenlabs_agent_mr=os.getenv("GOVFIX_ELEVENLABS_AGENT_MR"),
            database_url=database_url,
            readiness_timeout_ms=int(os.getenv("GOVFIX_READINESS_TIMEOUT_MS", "2000")),
            worker_stale_seconds=int(os.getenv("GOVFIX_WORKER_STALE_SECONDS", "120")),
            notification_backlog_seconds=int(
                os.getenv("GOVFIX_NOTIFICATION_BACKLOG_SECONDS", "300")
            ),
            require_restricted_role=os.getenv("GOVFIX_REQUIRE_RESTRICTED_ROLE", "false").lower()
            in {"true", "1", "yes"},
            migration_database_url=os.getenv("GOVFIX_MIGRATION_DATABASE_URL"),
            login_account_limit=int(os.getenv("GOVFIX_LOGIN_ACCOUNT_LIMIT", "5")),
            login_ip_limit=int(os.getenv("GOVFIX_LOGIN_IP_LIMIT", "30")),
            login_window_seconds=int(os.getenv("GOVFIX_LOGIN_WINDOW_SECONDS", "900")),
            login_rate_secret=os.getenv("GOVFIX_LOGIN_RATE_SECRET", "local-demo-login-budget"),
            auth_provider=os.getenv("GOVFIX_AUTH_PROVIDER", "local"),
            policy_version=os.getenv("GOVFIX_POLICY_VERSION", "demo-pilot-v1"),
            evidence_directory=os.getenv("GOVFIX_EVIDENCE_DIRECTORY", "./var/evidence"),
            evidence_max_bytes=int(os.getenv("GOVFIX_EVIDENCE_MAX_BYTES", str(5 * 1024 * 1024))),
            session_minutes=int(os.getenv("GOVFIX_SESSION_MINUTES", "60")),
            supabase_url=os.getenv("SUPABASE_URL"),
            supabase_anon_key=os.getenv("SUPABASE_ANON_KEY"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            supabase_storage_bucket=os.getenv("SUPABASE_STORAGE_BUCKET", "evidence"),
        )
