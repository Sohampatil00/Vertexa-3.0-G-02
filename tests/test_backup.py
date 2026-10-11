import json
import stat
from uuid import uuid4
from zipfile import ZipFile

import pytest
from sqlalchemy import func, select, text
from sqlalchemy.engine import make_url

from govfix.backup import backup_database, restore_database
from govfix.cli import migrate
from govfix.database import make_engine, make_sessions
from govfix.evidence import make_evidence_store
from govfix.models import AuditEvent, AuthSession, Case, Evidence
from govfix.settings import Settings
from tests.test_operations import photo, upload


@pytest.fixture
def restore_target(backend, tmp_path):
    database_name = "govfix_restore_" + uuid4().hex
    source_url = make_url(backend.url)
    postgres = source_url.get_backend_name() == "postgresql"
    if postgres:
        # backend always uses the explicitly disposable test database, never Supabase.
        with (
            backend.sessions.kw["bind"]
            .connect()
            .execution_options(isolation_level="AUTOCOMMIT") as connection
        ):
            connection.execute(text(f'CREATE DATABASE "{database_name}"'))
        url = source_url.set(database=database_name).render_as_string(hide_password=False)
    else:
        url = f"sqlite:///{tmp_path / 'restored.db'}"
    engine = make_engine(url)
    try:
        migrate(url)
        yield (
            make_sessions(engine),
            Settings(database_url=url, evidence_directory=str(tmp_path / "restored-evidence")),
        )
    finally:
        engine.dispose()
        if postgres:
            with (
                backend.sessions.kw["bind"]
                .connect()
                .execution_options(isolation_level="AUTOCOMMIT") as connection
            ):
                connection.execute(text(f'DROP DATABASE "{database_name}"'))


def test_database_and_private_evidence_restore_preserves_history_and_revokes_tokens(
    backend, tmp_path, restore_target
):
    case = backend.in_progress()
    assert upload(backend, case).status_code == 201
    with backend.sessions() as db:
        audit_count = db.scalar(select(func.count()).select_from(AuditEvent))
    source_settings = backend.app.state.workflow.settings
    destination = tmp_path / "backup.zip"
    result = backup_database(backend.sessions, source_settings, destination)
    assert result["objects"] == 1
    assert stat.S_IMODE(destination.stat().st_mode) == 0o600
    target_sessions, target_settings = restore_target
    assert restore_database(target_sessions, target_settings, destination) == result
    with target_sessions() as db:
        restored = db.scalar(select(Case))
        assert restored.public_id == case["id"]
        assert restored.workflow_state == "IN_PROGRESS"
        assert db.scalar(select(func.count()).select_from(AuditEvent)) == audit_count
        assert all(item.revoked for item in db.scalars(select(AuthSession)))
        evidence = db.scalar(select(Evidence))
        assert make_evidence_store(target_settings).read(evidence) == photo()
    with pytest.raises(ValueError, match="must be empty"):
        restore_database(target_sessions, target_settings, destination)
    with pytest.raises(FileExistsError):
        backup_database(backend.sessions, source_settings, destination)


def test_tampered_backup_is_rejected_without_writing_rows(backend, tmp_path, restore_target):
    source = tmp_path / "good.zip"
    backup_database(backend.sessions, backend.app.state.workflow.settings, source)
    corrupted = tmp_path / "bad.zip"
    with ZipFile(source) as original, ZipFile(corrupted, "w") as archive:
        for name in original.namelist():
            data = original.read(name)
            if name == "database.json":
                parsed = json.loads(data)
                parsed["tables"]["users"][0]["display_name"] = "Tampered"
                data = json.dumps(parsed).encode()
            archive.writestr(name, data)
    sessions, settings = restore_target
    with pytest.raises(ValueError, match="checksum"):
        restore_database(sessions, settings, corrupted)
    with sessions() as db:
        assert db.scalar(select(func.count()).select_from(AuditEvent)) == 0


def test_pre_coordinates_snapshot_restores_to_current_schema(backend, tmp_path, restore_target):
    case = backend.submit().json()["case"]
    # Exercise the deployed pre-migration schema only in the disposable test database.
    migrate(backend.url, "0009", downgrade=True)
    snapshot = tmp_path / "previous-schema.zip"
    backup_database(backend.sessions, backend.app.state.workflow.settings, snapshot)
    sessions, settings = restore_target
    restore_database(sessions, settings, snapshot)
    with sessions() as db:
        restored = db.scalar(select(Case))
        assert restored.public_id == case["id"]
        assert restored.latitude is None
        assert restored.longitude is None
