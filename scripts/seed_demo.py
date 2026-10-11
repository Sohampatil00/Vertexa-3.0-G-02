"""Seed synthetic GovFix v2 cases through the governed API. Dry run by default."""

import argparse
import hashlib
import json
import os
import secrets
from dataclasses import replace
from datetime import timedelta
from pathlib import Path
from urllib.parse import urlparse

from fastapi.testclient import TestClient
from sqlalchemy import select

from govfix.api import create_app
from govfix.auth import token_hash
from govfix.cli import import_policy, migrate, provision_user
from govfix.database import make_engine, make_sessions, utcnow, write_transaction
from govfix.models import AuthSession, User
from govfix.settings import Settings
from govfix.worker import Worker

ROOT = Path(__file__).resolve().parents[1]
POLICY = ROOT / "config/policies/demo-pilot-v2.json"
SCENARIOS = ROOT / "config/demo-scenarios-v2.json"
DEFAULT_CREDENTIALS = ROOT / "var/demo-credentials.json"


def accounts(policy):
    names = {
        "sample-citizen": ("CITIZEN", None),
        "sample-intake": ("INTAKE_OFFICER", None),
        "sample-dispatcher": ("DISPATCHER", None),
        "sample-supervisor": ("SUPERVISOR", None),
        "sample-ward-head": ("WARD_HEAD", None),
        "sample-auditor": ("AUDITOR", None),
    }
    for department in policy["departments"]:
        names[f"sample-officer-{department.lower().replace('_', '-')}"] = (
            "OFFICER",
            department,
        )
    return names


def credentials_for(path, names, sessions):
    if path.exists():
        passwords = json.loads(path.read_text())
        if set(passwords) != set(names):
            raise ValueError("Existing demo credentials do not match the expected accounts")
        return passwords
    with sessions() as session:
        existing = session.scalar(select(User.id).where(User.username.in_(list(names))).limit(1))
    if existing:
        raise ValueError("Demo accounts exist but the private credentials file is missing")
    passwords = {name: secrets.token_urlsafe(24) for name in names}
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(descriptor, "w") as stream:
        json.dump(passwords, stream, indent=2)
        stream.write("\n")
    return passwords


def prepare_accounts(sessions, policy, passwords):
    identities = {}
    tokens = {}
    with write_transaction(sessions) as session:
        import_policy(session, POLICY)
        for username, (role, department) in accounts(policy).items():
            user = session.scalar(select(User).where(User.username == username))
            if user is None:
                user = provision_user(
                    session,
                    username=username,
                    display_name=username.replace("sample-", "Demo ").replace("-", " ").title(),
                    password=passwords[username],
                    role=role,
                    wards=policy["wards"],
                    department=department,
                    verified=role == "CITIZEN",
                )
            identities[username] = user.id
            token = secrets.token_urlsafe(32)
            session.add(
                AuthSession(
                    token_hash=token_hash(token),
                    user_id=user.id,
                    expires_at=utcnow() + timedelta(hours=2),
                )
            )
            tokens[username] = token
    return identities, tokens


def check(response, action):
    if response.status_code >= 400:
        raise RuntimeError(f"{action}: HTTP {response.status_code}: {response.text[:500]}")
    return response.json()


def seed_case(client, scenario, policy, identities, tokens):
    key = scenario["key"]
    citizen = tokens["sample-citizen"]
    category = next(item for item in policy["categories"] if item["code"] == scenario["category"])
    department = category["department"]
    officer_name = f"sample-officer-{department.lower().replace('_', '-')}"

    def headers(name, operation, version=None):
        result = {
            "Authorization": f"Bearer {tokens[name]}",
            "Idempotency-Key": f"govfix-demo-v2-{key}-{operation}",
        }
        if version is not None:
            result["If-Match"] = f'"{version}"'
        return result

    created = check(
        client.post(
            "/v1/cases",
            json={
                "description": scenario["description"],
                "location": scenario["location"],
                "category": scenario["category"],
                "ward": scenario["ward"],
                "confirmation": True,
            },
            headers=headers("sample-citizen", "submit"),
        ),
        f"{key} submit",
    )["case"]
    case_id = created["id"]

    def current():
        return check(
            client.get(f"/v1/cases/{case_id}", headers={"Authorization": f"Bearer {citizen}"}),
            f"{key} read",
        )["case"]

    def command(operation, name, body):
        case = current()
        return check(
            client.post(
                f"/v1/cases/{case_id}/{operation}",
                json=body,
                headers=headers(name, operation, case["version"]),
            ),
            f"{key} {operation}",
        )["case"]

    target = scenario["target_state"]
    state = current()["workflow_state"]
    if target == "REJECTED":
        if state == "SUBMITTED":
            command(
                "reject",
                "sample-intake",
                {
                    "reason_code": scenario["rejection_reason_code"],
                    "explanation": scenario["rejection_explanation"],
                },
            )
        elif state != "REJECTED":
            raise RuntimeError(f"{key} is unexpectedly {state}")
        return case_id
    stages = [
        "SUBMITTED",
        "VALIDATED",
        "ASSIGNED",
        "IN_PROGRESS",
        "CITIZEN_VERIFICATION",
    ]
    goal = "CITIZEN_VERIFICATION" if target in {"CLOSED", "SUPERVISOR_REVIEW"} else target
    if state not in stages and state != target:
        raise RuntimeError(f"{key} is unexpectedly {state}")
    while state in stages and stages.index(state) < stages.index(goal):
        if state == "SUBMITTED":
            state = command(
                "validate",
                "sample-intake",
                {
                    "category": scenario["category"],
                    "ward": scenario["ward"],
                    "department": department,
                    "jurisdiction": policy["municipality"],
                },
            )["workflow_state"]
        elif state == "VALIDATED":
            state = command(
                "assign",
                "sample-dispatcher",
                {
                    "officer_id": identities[officer_name],
                    "department": department,
                    "reason": "Synthetic demo work order for the reported civic issue.",
                },
            )["workflow_state"]
        elif state == "ASSIGNED":
            state = command("accept-assignment", officer_name, {"confirmation": True})[
                "workflow_state"
            ]
        elif state == "IN_PROGRESS":
            image_path = ROOT / "web/public" / scenario["after_photo"].lstrip("/")
            data = image_path.read_bytes()
            case = current()
            uploaded = check(
                client.post(
                    f"/v1/cases/{case_id}/evidence?kind=AFTER_PHOTO",
                    content=data,
                    headers={
                        **headers(officer_name, "photo", case["version"]),
                        "Content-Type": "image/jpeg",
                        "X-Content-SHA256": hashlib.sha256(data).hexdigest(),
                    },
                ),
                f"{key} evidence",
            )["evidence"]
            state = command(
                "resolution",
                officer_name,
                {"note": scenario["resolution_note"], "evidence_refs": [uploaded["id"]]},
            )["workflow_state"]
    if target in {"CLOSED", "SUPERVISOR_REVIEW"} and state == "CITIZEN_VERIFICATION":
        outcome = "ACCEPT" if target == "CLOSED" else "DISPUTE"
        result = command(
            "verification",
            "sample-citizen",
            {
                "outcome": outcome,
                "confirmation": True,
                "statement": scenario.get("dispute_statement") if outcome == "DISPUTE" else None,
            },
        )
        state = result["workflow_state"]
    if state != target:
        raise RuntimeError(f"{key} ended in {state}, expected {target}")
    return case_id


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Write the synthetic demo dataset")
    parser.add_argument("--credentials", type=Path, default=DEFAULT_CREDENTIALS)
    args = parser.parse_args()
    dataset = json.loads(SCENARIOS.read_text())
    policy = json.loads(POLICY.read_text())
    assert dataset["policy_version"] == policy["version"] and dataset["synthetic"]
    print(f"Synthetic demo: {len(policy['categories'])} categories, {len(dataset['cases'])} cases")
    if not args.apply:
        print(
            "Dry run. Use --apply with an explicitly configured GOVFIX_DATABASE_URL to write data."
        )
        return
    if "GOVFIX_DATABASE_URL" not in os.environ:
        raise ValueError("Set GOVFIX_DATABASE_URL explicitly before applying the seed")
    settings = replace(Settings.from_env(), policy_version=policy["version"], embedded_worker=False)
    admin_url = settings.migration_database_url or settings.database_url
    parsed = urlparse(settings.database_url)
    print(f"Target: {parsed.scheme}://{parsed.hostname or parsed.path}")
    migrate(admin_url)
    admin_engine = make_engine(admin_url)
    admin_sessions = make_sessions(admin_engine)
    runtime_engine = make_engine(settings.database_url)
    runtime_sessions = make_sessions(runtime_engine)
    token_hashes = []
    try:
        passwords = credentials_for(args.credentials, accounts(policy), admin_sessions)
        identities, tokens = prepare_accounts(admin_sessions, policy, passwords)
        token_hashes = [token_hash(value) for value in tokens.values()]
        with TestClient(create_app(settings)) as client:
            for scenario in dataset["cases"]:
                case_id = seed_case(client, scenario, policy, identities, tokens)
                print(f"{scenario['key']}: {scenario['target_state']} {case_id}")
        result = Worker(runtime_sessions, settings).run_once()
        if result.get("error"):
            raise RuntimeError(f"Worker delivery failed: {result['error']}")
        print(f"Seed complete. Private credentials: {args.credentials}")
    finally:
        if token_hashes:
            with write_transaction(admin_sessions) as session:
                for key in token_hashes:
                    token = session.get(AuthSession, key)
                    if token:
                        session.delete(token)
        runtime_engine.dispose()
        admin_engine.dispose()


if __name__ == "__main__":
    main()
