"""Durable worker heartbeat with the same private backend permission boundary."""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "worker_status",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.Column("last_success_at", sa.DateTime(timezone=True)),
        sa.Column("last_error", sa.String(40)),
    )
    if op.get_bind().dialect.name == "postgresql":
        op.execute("ALTER TABLE public.worker_status ENABLE ROW LEVEL SECURITY")
        roles = ["PUBLIC"] + [
            r[0]
            for r in op.get_bind().exec_driver_sql(
                "SELECT rolname FROM pg_roles "
                "WHERE rolname IN ('anon','authenticated','service_role')"
            )
        ]
        for role in roles:
            op.execute(f"REVOKE ALL ON public.worker_status FROM {role}")
        op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON public.worker_status TO govfix_backend")
        op.execute(
            "CREATE POLICY govfix_backend_access ON public.worker_status "
            "TO govfix_backend USING (true) WITH CHECK (true)"
        )


def downgrade():
    op.drop_table("worker_status")
