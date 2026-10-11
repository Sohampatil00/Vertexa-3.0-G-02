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

    def __post_init__(self):
        if not 1 <= self.evidence_max_bytes <= 20 * 1024 * 1024:
            raise ValueError("evidence_max_bytes must be between 1 byte and 20 MiB")
        if not 1 <= self.session_minutes <= 1440:
            raise ValueError("session_minutes must be between 1 and 1440")

    @classmethod
    def from_env(cls):
        return cls(
            database_url=os.getenv("GOVFIX_DATABASE_URL", "sqlite:///./govfix.db"),
            policy_version=os.getenv("GOVFIX_POLICY_VERSION", "demo-pilot-v1"),
            evidence_directory=os.getenv("GOVFIX_EVIDENCE_DIRECTORY", "./var/evidence"),
            evidence_max_bytes=int(os.getenv("GOVFIX_EVIDENCE_MAX_BYTES", str(5 * 1024 * 1024))),
            session_minutes=int(os.getenv("GOVFIX_SESSION_MINUTES", "60")),
        )
