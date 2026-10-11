"""Keep governed backend tables inaccessible through the Supabase Data API."""

from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

TABLES = (
    "alembic_version",
    "assignments",
    "audit_events",
    "auth_sessions",
    "evidence",
    "grievances",
    "idempotency_records",
    "notifications",
    "outbox_messages",
    "policy_versions",
    "sla_thresholds",
    "user_roles",
    "users",
    "voice_sessions",
)


def upgrade():
    connection = op.get_bind()
    if connection.dialect.name != "postgresql":
        return
    roles = ["PUBLIC"] + [
        row[0]
        for row in connection.exec_driver_sql(
            "SELECT rolname FROM pg_roles "
            "WHERE rolname IN ('anon', 'authenticated', 'service_role')"
        )
    ]
    for table in TABLES:
        op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY')
        for role in roles:
            op.execute(f'REVOKE ALL ON TABLE public."{table}" FROM {role}')
    for role in roles:
        op.execute(f"REVOKE ALL ON FUNCTION public.govfix_refuse_history_change() FROM {role}")
        op.execute(f"ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM {role}")


def downgrade():
    # A downgrade must never restore Data API access to credentials or governed records.
    pass
