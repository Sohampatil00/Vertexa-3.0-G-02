"""Database setup; schema changes run through Alembic, never at API startup."""

from contextlib import contextmanager
from datetime import UTC, datetime

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker


def utcnow() -> datetime:
    return datetime.now(UTC)


def as_utc(value: datetime) -> datetime:
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def make_engine(url: str):
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgres://")
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url.removeprefix("postgresql://")
    options = {"pool_pre_ping": True, "pool_timeout": 5}
    if url.startswith("sqlite"):
        options["connect_args"] = {"check_same_thread": False, "timeout": 30}
    elif url.startswith("postgresql"):
        options["connect_args"] = {"connect_timeout": 5}
    engine = create_engine(url, **options)
    if engine.dialect.name == "sqlite":

        @event.listens_for(engine, "connect")
        def connect(dbapi_connection, _record):
            dbapi_connection.isolation_level = None
            dbapi_connection.execute("PRAGMA foreign_keys=ON")

        @event.listens_for(engine, "begin")
        def begin(connection):
            # Only writers reserve the SQLite writer lock before reading case versions.
            statement = (
                "BEGIN IMMEDIATE"
                if connection.get_execution_options().get("govfix_write")
                else "BEGIN"
            )
            connection.exec_driver_sql(statement)

    return engine


def make_sessions(engine) -> sessionmaker[Session]:
    return sessionmaker(engine, expire_on_commit=False)


@contextmanager
def write_transaction(sessions):
    with sessions() as session, session.begin():
        if session.get_bind().dialect.name == "sqlite":
            session.connection(execution_options={"govfix_write": True})
        yield session


def verify_runtime_role(connection):
    """Fail startup if a hardened runtime has administrative database privileges."""
    if connection.dialect.name != "postgresql":
        raise RuntimeError("Restricted runtime requires PostgreSQL")
    privileged = connection.exec_driver_sql("""
        SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
          OR has_schema_privilege(current_user, 'public', 'CREATE')
          OR NOT pg_has_role(current_user, 'govfix_backend', 'MEMBER')
          OR EXISTS (SELECT 1 FROM pg_tables WHERE schemaname='public' AND tableowner=current_user)
        FROM pg_roles WHERE rolname=current_user
    """).scalar_one()
    if privileged:
        raise RuntimeError("API/worker must use the restricted backend database login")
