"""Run the suite against an isolated PostgreSQL process, then stop and remove it.

Usage: uv run --with pgserver python scripts/test_postgres.py
Requires a pgserver binary wheel for your Python/platform combination.
"""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

import pgserver

with tempfile.TemporaryDirectory(prefix="govfix-pg-") as temporary:
    server = pgserver.get_server(Path(temporary) / "data", cleanup_mode="stop")
    try:
        environment = {
            **os.environ,
            "GOVFIX_TEST_DATABASE_URL": server.get_uri().replace(
                "postgresql://", "postgresql+psycopg://", 1
            ),
        }
        print("Running tests against isolated PostgreSQL", flush=True)
        result = subprocess.run([sys.executable, "-m", "pytest", "-q"], env=environment)
    finally:
        server.cleanup()
raise SystemExit(result.returncode)
