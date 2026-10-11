"""Explicit runtime configuration for the local pilot backend."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str = "sqlite:///./govfix.db"
    policy_version: str = "demo-pilot-v1"
    session_minutes: int = 60
    evidence_directory: str = "./var/evidence"
    evidence_max_bytes: int = 5 * 1024 * 1024
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    supabase_service_role_key: str | None = None
    supabase_storage_bucket: str = "evidence"

    elevenlabs_webhook_secret: str | None = None
    elevenlabs_api_key: str | None = None
    elevenlabs_agent_en: str | None = None
    elevenlabs_agent_hi: str | None = None
    elevenlabs_agent_mr: str | None = None

    def __post_init__(self):
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
            policy_version=os.getenv("GOVFIX_POLICY_VERSION", "demo-pilot-v1"),
            evidence_directory=os.getenv("GOVFIX_EVIDENCE_DIRECTORY", "./var/evidence"),
            evidence_max_bytes=int(os.getenv("GOVFIX_EVIDENCE_MAX_BYTES", str(5 * 1024 * 1024))),
            session_minutes=int(os.getenv("GOVFIX_SESSION_MINUTES", "60")),
            supabase_url=os.getenv("SUPABASE_URL"),
            supabase_anon_key=os.getenv("SUPABASE_ANON_KEY"),
            supabase_service_role_key=os.getenv("SUPABASE_SERVICE_ROLE_KEY"),
            supabase_storage_bucket=os.getenv("SUPABASE_STORAGE_BUCKET", "evidence"),
        )
