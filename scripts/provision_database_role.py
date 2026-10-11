"""Provision a separate backend login and save its URI privately; no credentials printed.

Usage: uv run python scripts/provision_database_role.py --apply
Uses the existing .env admin URI; only writes .env after the runtime connection succeeds.
Run migrations first. Database schema permissions are defined by migration 0008.
"""

import argparse
import os
import secrets
import shlex
from pathlib import Path

from psycopg import sql
from sqlalchemy.engine import make_url

from govfix.database import make_engine


def provision(path):
    lines = path.read_text().splitlines()
    values = {}
    for line in lines:
        parts = shlex.split(line, comments=True)
        if len(parts) == 1 and "=" in parts[0]:
            key, value = parts[0].split("=", 1)
            values[key] = value
    admin = values.get("GOVFIX_MIGRATION_DATABASE_URL") or values["GOVFIX_DATABASE_URL"]
    original = make_url(admin)
    if not original.drivername.startswith("postgres"):
        raise ValueError("PostgreSQL is required")
    if values.get("GOVFIX_MIGRATION_DATABASE_URL"):
        raise ValueError("A migration URI is already configured; review existing provisioning")
    password = secrets.token_urlsafe(48)
    engine = make_engine(admin)
    try:
        with engine.begin() as connection:
            if connection.exec_driver_sql(
                "SELECT 1 FROM pg_roles WHERE rolname='govfix_runtime'"
            ).scalar():
                raise ValueError(
                    "govfix_runtime already exists; credentials will not be overwritten"
                )
            if not connection.exec_driver_sql(
                "SELECT 1 FROM pg_roles WHERE rolname='govfix_backend'"
            ).scalar():
                raise ValueError("Apply migration 0008 first")
            # psycopg quotes the literal; password is never a shell argument or log output.
            driver = connection.connection.driver_connection
            driver.execute(
                sql.SQL(
                    "CREATE ROLE govfix_runtime LOGIN INHERIT NOSUPERUSER "
                    "NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD {}"
                ).format(sql.Literal(password))
            )
            connection.exec_driver_sql("GRANT govfix_backend TO govfix_runtime")
            db = connection.exec_driver_sql("SELECT current_database()").scalar()
            driver.execute(
                sql.SQL("GRANT CONNECT ON DATABASE {} TO govfix_runtime").format(sql.Identifier(db))
            )
        suffix = (
            "." + original.username.split(".", 1)[1]
            if original.host and original.host.endswith("pooler.supabase.com")
            else ""
        )
        runtime = original.set(username="govfix_runtime" + suffix, password=password)
        runtime_url = runtime.render_as_string(hide_password=False)
        runtime_engine = make_engine(runtime_url)
        try:
            with runtime_engine.connect() as connection:
                assert (
                    connection.exec_driver_sql("SELECT current_user").scalar() == "govfix_runtime"
                )
                connection.exec_driver_sql(
                    "SELECT version_num FROM public.alembic_version"
                ).scalar_one()
        finally:
            runtime_engine.dispose()
        replacements = {
            "GOVFIX_DATABASE_URL": runtime_url,
            "GOVFIX_REQUIRE_RESTRICTED_ROLE": "true",
            "GOVFIX_MIGRATION_DATABASE_URL": admin,
            "GOVFIX_LOGIN_RATE_SECRET": values.get("GOVFIX_LOGIN_RATE_SECRET")
            or secrets.token_urlsafe(32),
        }
        remaining = set(replacements)
        output = []
        for line in lines:
            parts = shlex.split(line, comments=True)
            key = parts[0].split("=", 1)[0] if len(parts) == 1 and "=" in parts[0] else None
            if key in replacements:
                if key in remaining:
                    output.append(key + "=" + shlex.quote(replacements[key]))
                    remaining.remove(key)
            else:
                output.append(line)
        output.extend(key + "=" + shlex.quote(replacements[key]) for key in sorted(remaining))
        temporary = path.with_name(path.name + ".provisioning")
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with os.fdopen(descriptor, "w") as file:
                file.write("\n".join(output) + "\n")
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)
        print(
            "Provisioned restricted runtime login; "
            "migration URI retained separately in private .env."
        )
    finally:
        engine.dispose()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--env", type=Path, default=Path(".env"))
    args = parser.parse_args()
    if not args.apply:
        print(
            "Plan: create govfix_runtime, grant govfix_backend, "
            "verify connection, update private .env."
        )
    else:
        try:
            provision(args.env)
        except Exception as exc:
            # SQL/connection exceptions can contain a password or URI; never render them.
            parser.exit(1, f"Provisioning failed ({type(exc).__name__}); .env was not changed.\n")
