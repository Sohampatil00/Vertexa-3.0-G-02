"""Portable private application snapshots, including checksum-verified evidence."""

import hashlib
import json
import os
from datetime import datetime
from pathlib import Path
from zipfile import ZIP_DEFLATED, ZipFile

from sqlalchemy import JSON, DateTime, MetaData, null, select, text

from govfix.database import utcnow, write_transaction
from govfix.evidence import make_evidence_store
from govfix.models import Base, Evidence
from govfix.observability import SCHEMA_REVISION


def backup_database(sessions, settings, destination: Path):
    """Export application tables and completed private objects without credentials."""
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    store = make_evidence_store(settings)
    with sessions() as session, session.begin():
        if session.get_bind().dialect.name == "postgresql":
            session.connection(execution_options={"isolation_level": "REPEATABLE READ"})
        revision = session.execute(text("SELECT version_num FROM alembic_version")).scalar_one()
        if revision not in {"0009", SCHEMA_REVISION}:
            raise ValueError("Backup requires a supported application schema")
        actual = MetaData()
        actual.reflect(bind=session.connection(), only=list(Base.metadata.tables))
        tables = {
            table.name: [dict(row) for row in session.execute(select(table)).mappings()]
            for table in actual.sorted_tables
        }
        objects = session.scalars(select(Evidence).where(Evidence.complete.is_(True))).all()
        payload = json.dumps(
            {"schema_revision": revision, "created_at": utcnow().isoformat(), "tables": tables},
            default=lambda value: value.isoformat(),
            ensure_ascii=False,
            sort_keys=True,
        ).encode()
        descriptor = os.open(destination, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        try:
            with (
                os.fdopen(descriptor, "wb") as stream,
                ZipFile(stream, "w", ZIP_DEFLATED) as archive,
            ):
                archive.writestr("database.json", payload)
                manifest = {
                    "format": "govfix-backup-v1",
                    "database_sha256": hashlib.sha256(payload).hexdigest(),
                    "objects": {},
                }
                for item in objects:
                    data = store.read(item)
                    archive.writestr(f"evidence/{item.object_key}", data)
                    manifest["objects"][item.object_key] = item.sha256
                archive.writestr("manifest.json", json.dumps(manifest, sort_keys=True))
        except BaseException:
            destination.unlink(missing_ok=True)
            raise
    return {"tables": len(tables), "rows": sum(map(len, tables.values())), "objects": len(objects)}


def restore_database(sessions, settings, source: Path):
    """Restore into a migrated, EMPTY database. Never delete or overwrite rows."""
    store = make_evidence_store(settings)
    written = []
    with ZipFile(source) as archive:
        if archive.getinfo("database.json").file_size > 128 * 1024 * 1024:
            raise ValueError("Database snapshot exceeds 128 MiB")
        manifest = json.loads(archive.read("manifest.json"))
        payload = archive.read("database.json")
        if manifest.get("format") != "govfix-backup-v1" or hashlib.sha256(
            payload
        ).hexdigest() != manifest.get("database_sha256"):
            raise ValueError("Backup checksum or format is invalid")
        snapshot = json.loads(payload)
        tables = snapshot["tables"]
        if snapshot.get("schema_revision") not in {"0009", SCHEMA_REVISION} or set(tables) != set(
            Base.metadata.tables
        ):
            raise ValueError("Backup schema does not match this application")
        completed = [row for row in tables["evidence"] if row["complete"]]
        if {row["object_key"]: row["sha256"] for row in completed} != manifest.get("objects"):
            raise ValueError("Evidence manifest does not match the database")
        try:
            with write_transaction(sessions) as session:
                revision = session.execute(
                    text("SELECT version_num FROM alembic_version")
                ).scalar_one()
                if revision != SCHEMA_REVISION:
                    raise ValueError("Restore target must be migrated to the current schema")
                for table in Base.metadata.sorted_tables:
                    if session.execute(select(table).limit(1)).first() is not None:
                        raise ValueError("Restore target must be empty; existing data is preserved")
                for row in completed:
                    name = f"evidence/{row['object_key']}"
                    info = archive.getinfo(name)
                    if (
                        info.file_size != row["size_bytes"]
                        or info.file_size > settings.evidence_max_bytes
                    ):
                        raise ValueError("Evidence size is invalid")
                    data = archive.read(name)
                    if hashlib.sha256(data).hexdigest() != row["sha256"]:
                        raise ValueError("Evidence checksum is invalid")
                    # Local store validates UUID keys; apply the same rule to remote restoration.
                    from uuid import UUID

                    if str(UUID(row["object_key"])) != row["object_key"]:
                        raise ValueError("Evidence object key is invalid")
                    store.save(row["object_key"], data, row["content_type"])
                    written.append(row["object_key"])
                for table in Base.metadata.sorted_tables:
                    for original in tables[table.name]:
                        row = dict(original)
                        for column in table.columns:
                            if column.name not in row:
                                if (
                                    snapshot["schema_revision"] == "0009"
                                    and table.name == "grievances"
                                    and column.name in {"latitude", "longitude", "accuracy_m"}
                                ):
                                    row[column.name] = None
                                else:
                                    raise ValueError("Backup is missing a required column")
                            value = row[column.name]
                            if value is not None and isinstance(column.type, DateTime):
                                row[column.name] = datetime.fromisoformat(value)
                            elif value is None and isinstance(column.type, JSON):
                                row[column.name] = null()
                        # A recovery must not reactivate old browser tokens or microphones.
                        if table.name == "auth_sessions":
                            row["revoked"] = True
                        elif table.name == "voice_sessions":
                            row["cancelled"] = True
                        session.execute(table.insert().values(**row))
        except BaseException:
            for key in written:
                store.delete(key)
            raise
    return {"tables": len(tables), "rows": sum(map(len, tables.values())), "objects": len(written)}
