import json

import pytest
from sqlalchemy import delete, select, update
from sqlalchemy.exc import DBAPIError

from govfix.cli import import_policy, provision_user
from govfix.models import AuditEvent, PolicyVersion
from govfix.policy import PolicyError, load_policy
from tests.conftest import PASSWORD, POLICY_PATH


def test_policy_json_cannot_override_a_field_with_a_duplicate_key(tmp_path):
    path = tmp_path / "ambiguous.json"
    path.write_text('{"version":"first","version":"second"}')
    with pytest.raises(PolicyError, match="duplicate JSON field"):
        load_policy(path)


def test_policy_reimport_is_idempotent_and_changed_version_is_refused(backend, tmp_path):
    with backend.sessions() as session, session.begin():
        assert import_policy(session, POLICY_PATH) == "demo-pilot-v1"
    policy = json.loads(POLICY_PATH.read_text())
    policy["categories"][0]["sla_hours"] = 1
    changed = tmp_path / "changed.json"
    changed.write_text(json.dumps(policy))
    with pytest.raises(PolicyError, match="cannot be changed"):
        with backend.sessions() as session, session.begin():
            import_policy(session, changed)


@pytest.mark.parametrize("mutation", ["update", "delete"])
def test_audit_history_cannot_be_changed_by_ordinary_database_writes(backend, mutation):
    backend.submit()
    with pytest.raises(DBAPIError):
        with backend.sessions() as session, session.begin():
            statement = (
                update(AuditEvent).values(result="REFUSED")
                if mutation == "update"
                else delete(AuditEvent)
            )
            session.execute(statement)
    with backend.sessions() as session:
        assert session.scalar(select(AuditEvent)).result == "ACCEPTED"


def test_stored_policy_cannot_be_rewritten(backend):
    with pytest.raises(DBAPIError):
        with backend.sessions() as session, session.begin():
            session.execute(update(PolicyVersion).values(checksum="0" * 64))


def test_internal_workflow_role_cannot_be_provisioned(backend):
    with pytest.raises(ValueError, match="internal actor"):
        with backend.sessions() as session, session.begin():
            provision_user(
                session,
                username="system",
                display_name="System",
                password=PASSWORD,
                role="WORKFLOW_ENGINE",
                wards=["WARD-A"],
            )


def test_staff_requires_explicit_ward_scope(backend):
    with pytest.raises(ValueError, match="explicit ward"):
        with backend.sessions() as session, session.begin():
            provision_user(
                session, username="staff", display_name="Staff", password=PASSWORD, role="OFFICER"
            )
