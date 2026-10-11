"""Shared login budgets and a restricted backend group with explicit RLS policies."""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

READ_ONLY = ("alembic_version", "policy_versions", "user_roles")
INSERT_ONLY = ("audit_events", "evidence", "sla_thresholds", "idempotency_records")
MUTABLE = (
    "assignments",
    "auth_sessions",
    "grievances",
    "notifications",
    "outbox_messages",
    "voice_sessions",
    "login_budgets",
)


def upgrade():
    op.create_table(
        "login_budgets",
        sa.Column("key", sa.String(64), primary_key=True),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_login_budgets_expires_at", "login_budgets", ["expires_at"])
    connection = op.get_bind()
    if connection.dialect.name != "postgresql":
        return
    if not connection.exec_driver_sql(
        "SELECT 1 FROM pg_roles WHERE rolname='govfix_backend'"
    ).scalar():
        op.execute(
            "CREATE ROLE govfix_backend NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE "
            "NOINHERIT NOREPLICATION NOBYPASSRLS"
        )
    else:
        role = connection.exec_driver_sql(
            "SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls "
            "OR rolcanlogin FROM pg_roles WHERE rolname='govfix_backend'"
        ).scalar()
        if role:
            raise RuntimeError(
                "Existing govfix_backend role is privileged; review it before migration"
            )
    op.execute("REVOKE CREATE ON SCHEMA public FROM PUBLIC")
    op.execute("GRANT USAGE ON SCHEMA public TO govfix_backend")
    op.execute("GRANT govfix_backend TO CURRENT_USER")
    roles = ["PUBLIC"] + [
        r[0]
        for r in connection.exec_driver_sql(
            "SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')"
        )
    ]
    for role in roles:
        op.execute(f"REVOKE ALL ON public.login_budgets FROM {role}")
    for table in (*READ_ONLY, *INSERT_ONLY, *MUTABLE, "users"):
        op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY')
        op.execute(f'REVOKE ALL ON public."{table}" FROM govfix_backend')
        op.execute(f'GRANT SELECT ON public."{table}" TO govfix_backend')
        op.execute(
            f'CREATE POLICY govfix_backend_access ON public."{table}" '
            "TO govfix_backend USING (true) WITH CHECK (true)"
        )
        if table in INSERT_ONLY or table in MUTABLE:
            op.execute(f'GRANT INSERT ON public."{table}" TO govfix_backend')
        if table in MUTABLE:
            op.execute(f'GRANT UPDATE ON public."{table}" TO govfix_backend')
    # PostgreSQL row locks need UPDATE on at least one column. Passwords/roles stay read-only.
    op.execute("GRANT UPDATE (active) ON public.users TO govfix_backend")
    op.execute("GRANT DELETE ON public.login_budgets TO govfix_backend")


def downgrade():
    if op.get_bind().dialect.name == "postgresql":
        for table in (*READ_ONLY, *INSERT_ONLY, *MUTABLE, "users"):
            op.execute(f'DROP POLICY govfix_backend_access ON public."{table}"')
            op.execute(f'REVOKE ALL ON public."{table}" FROM govfix_backend')
        op.execute("REVOKE UPDATE (active) ON public.users FROM govfix_backend")
    op.drop_index("ix_login_budgets_expires_at", table_name="login_budgets")
    op.drop_table("login_budgets")
