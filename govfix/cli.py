"""Explicit local administration: migrations, policy import, account provisioning."""

import argparse
import getpass
import json
import time
from pathlib import Path

from alembic import command
from alembic.config import Config
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from govfix.auth import password_hasher
from govfix.database import make_engine, make_sessions, verify_runtime_role, write_transaction
from govfix.models import PolicyVersion, RoleGrant, User
from govfix.observability import operations_status
from govfix.policy import PolicyError, load_policy
from govfix.settings import Settings
from govfix.worker import Worker

ROOT = Path(__file__).resolve().parents[1]


def migrate(url: str, revision: str = "head", *, downgrade: bool = False):
    config = Config(str(ROOT / "alembic.ini"))
    config.attributes["database_url"] = url
    (command.downgrade if downgrade else command.upgrade)(config, revision)


def import_policy(session, path: Path) -> str:
    policy, checksum = load_policy(path)
    existing = session.get(PolicyVersion, policy["version"])
    if existing:
        if existing.checksum != checksum:
            raise PolicyError("A stored policy version cannot be changed; use a new version.")
    else:
        session.add(PolicyVersion(version=policy["version"], checksum=checksum, definition=policy))
        session.flush()
    return policy["version"]


def provision_user(
    session, *, username, display_name, password, role, wards=(), department=None, verified=False
):
    if role == "WORKFLOW_ENGINE":
        raise ValueError("WORKFLOW_ENGINE is an internal actor and cannot have an account")
    if not 12 <= len(password) <= 128:
        raise ValueError("Password must have 12 to 128 characters")
    username = username.strip()
    display_name = display_name.strip()
    if not username or not display_name or len(username) > 100 or len(display_name) > 200:
        raise ValueError("Username and display name must fit the account fields")
    if role != "CITIZEN" and not wards:
        raise ValueError("Staff must have explicit ward grants")
    user = User(
        username=username,
        display_name=display_name,
        password_hash=password_hasher.hash(password),
        identity_verified=verified,
    )
    session.add(user)
    session.flush()
    for ward in wards if role != "CITIZEN" else (None,):
        session.add(RoleGrant(user_id=user.id, role=role, ward=ward, department=department))
    return user


def main():
    parser = argparse.ArgumentParser(description="GovFix local administration")
    subparsers = parser.add_subparsers(dest="operation", required=True)
    init = subparsers.add_parser("init-db", help="Apply migrations and import the demo policy")
    init.add_argument("--policy", type=Path, default=ROOT / "config/policies/demo-pilot-v1.json")
    policy = subparsers.add_parser(
        "import-policy", help="Import a new immutable demo policy version"
    )
    policy.add_argument("path", type=Path)
    account = subparsers.add_parser("create-user", help="Provision one local account")
    account.add_argument("username")
    account.add_argument("--name", required=True)
    account.add_argument("--role", required=True)
    account.add_argument("--ward", action="append", default=[])
    account.add_argument("--department")
    account.add_argument(
        "--verified",
        action="store_true",
        help="Record administrator-established demo identity verification",
    )
    worker = subparsers.add_parser("worker", help="Monitor SLAs and deliver in-app notifications")
    worker.add_argument("--once", action="store_true", help="Process one bounded batch and exit")
    worker.add_argument("--poll-seconds", type=float, default=30)
    worker.add_argument("--batch-size", type=int, default=100)
    subparsers.add_parser("check-operations", help="Report readiness, worker and delivery alerts")
    args = parser.parse_args()
    password = (
        getpass.getpass("Password (12+ characters): ") if args.operation == "create-user" else None
    )
    settings = Settings.from_env()
    database_url = (
        settings.database_url
        if args.operation in {"worker", "check-operations"}
        else settings.migration_database_url or settings.database_url
    )
    engine = make_engine(database_url)
    sessions = make_sessions(engine)
    try:
        if args.operation == "check-operations":
            result = operations_status(sessions, settings)
            print(json.dumps(result), flush=True)
            raise SystemExit(0 if result["status"] == "healthy" else 1)
        if args.operation == "worker":
            if settings.require_restricted_role:
                with engine.connect() as connection:
                    verify_runtime_role(connection)
            if not 1 <= args.poll_seconds <= 3600 or not 1 <= args.batch_size <= 1000:
                raise ValueError("Poll interval must be 1–3600 seconds; batch size 1–1000")
            runner = Worker(sessions, settings)
            try:
                while True:
                    result = runner.run_once(args.batch_size)
                    print(json.dumps(result), flush=True)
                    if args.once:
                        if result.get("error") or result.get("notifications", {}).get(
                            "UNAVAILABLE"
                        ):
                            raise SystemExit(1)
                        break
                    time.sleep(args.poll_seconds)
            except KeyboardInterrupt:
                pass
            return
        if args.operation == "init-db":
            migrate(database_url)
        with write_transaction(sessions) as session:
            if args.operation in {"init-db", "import-policy"}:
                version = import_policy(
                    session, args.policy if args.operation == "init-db" else args.path
                )
                print(f"Imported immutable demo policy {version}")
            else:
                policy = session.scalar(
                    select(PolicyVersion).where(
                        PolicyVersion.version == settings.policy_version,
                    )
                )
                if policy is None:
                    raise ValueError("Run init-db first")
                definition = policy.definition
                if args.role not in definition["roles"]:
                    raise ValueError("Role is not configured")
                if set(args.ward) - set(definition["wards"]):
                    raise ValueError("Ward is not configured")
                if args.department and args.department not in definition["departments"]:
                    raise ValueError("Department is not configured")
                user = provision_user(
                    session,
                    username=args.username,
                    display_name=args.name,
                    password=password,
                    role=args.role,
                    wards=args.ward,
                    department=args.department,
                    verified=args.verified,
                )
                print(f"Created {args.role} account {user.username}: {user.id}")
    except (PolicyError, ValueError, IntegrityError) as exc:
        message = (
            "Account or policy conflicts with existing data"
            if isinstance(exc, IntegrityError)
            else str(exc)
        )
        parser.exit(
            1,
            f"Administration failed: {exc.__class__.__name__}: {message}\n",
        )
    finally:
        engine.dispose()


if __name__ == "__main__":
    main()
