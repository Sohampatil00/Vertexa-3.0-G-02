"""Start a hosted service only with durable storage and restricted database access."""

import os
import sys
from collections.abc import Mapping

from sqlalchemy.engine import make_url


def startup_command(service: str, env: Mapping[str, str]) -> list[str]:
    if service not in {"web", "worker"}:
        raise ValueError("Service must be web or worker")
    if env.get("GOVFIX_MIGRATION_DATABASE_URL"):
        raise ValueError("Remove GOVFIX_MIGRATION_DATABASE_URL from runtime services")
    if env.get("GOVFIX_REQUIRE_RESTRICTED_ROLE", "").lower() not in {"true", "1", "yes"}:
        raise ValueError("Set GOVFIX_REQUIRE_RESTRICTED_ROLE=true")
    try:
        url = make_url(env.get("GOVFIX_DATABASE_URL", ""))
    except Exception:
        raise ValueError("Set GOVFIX_DATABASE_URL to a valid PostgreSQL URI") from None
    if url.drivername not in {"postgres", "postgresql", "postgresql+psycopg"}:
        raise ValueError("GOVFIX_DATABASE_URL must use PostgreSQL")
    if not url.host or not url.username or not url.password or not url.database:
        raise ValueError("GOVFIX_DATABASE_URL must include host, login, password and database")
    if url.query.get("sslmode") not in {"require", "verify-ca", "verify-full"}:
        raise ValueError("GOVFIX_DATABASE_URL requires sslmode=require or certificate verification")
    secret = env.get("GOVFIX_LOGIN_RATE_SECRET", "")
    if len(secret) < 32 or secret == "local-demo-login-budget":
        raise ValueError(
            "Set GOVFIX_LOGIN_RATE_SECRET to a random secret of at least 32 characters"
        )
    if service == "worker":
        return [sys.executable, "-m", "govfix.cli", "worker", "--poll-seconds", "30"]
    for key in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_STORAGE_BUCKET"):
        if not env.get(key):
            raise ValueError(f"Set {key} for durable Supabase evidence storage")
    if not env["SUPABASE_URL"].startswith("https://"):
        raise ValueError("SUPABASE_URL must use HTTPS")
    try:
        port = int(env.get("PORT", "10000"))
    except ValueError:
        raise ValueError("PORT must be an integer from 1 to 65535") from None
    if not 1 <= port <= 65535:
        raise ValueError("PORT must be an integer from 1 to 65535")
    command = [
        sys.executable,
        "-m",
        "uvicorn",
        "govfix.api:app",
        "--host",
        "0.0.0.0",
        "--port",
        str(port),
        "--no-access-log",
    ]
    trusted_proxies = env.get("FORWARDED_ALLOW_IPS", "").strip()
    if trusted_proxies:
        if "*" in trusted_proxies:
            raise ValueError("FORWARDED_ALLOW_IPS must specify trusted proxy IPs or CIDRs")
        command.extend(["--proxy-headers", "--forwarded-allow-ips", trusted_proxies])
    else:
        command.append("--no-proxy-headers")
    return command


def main():
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: python scripts/render_start.py web|worker")
        command = startup_command(sys.argv[1], os.environ)
    except ValueError as exc:
        print(f"Deployment configuration error: {exc}", file=sys.stderr)
        raise SystemExit(1) from None
    os.execvp(command[0], command)


if __name__ == "__main__":
    main()
