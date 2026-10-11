"""SLA threshold events, due scheduling, and durable local notification delivery."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "grievances", sa.Column("next_sla_check", sa.DateTime(timezone=True), nullable=True)
    )
    op.create_index("ix_grievances_next_sla_check", "grievances", ["next_sla_check"])
    # Existing cases must be evaluated once using their pinned policies by the worker.
    op.execute("UPDATE grievances SET next_sla_check = submitted_at WHERE terminal_at IS NULL")
    for name, kind in (
        ("next_attempt_at", sa.DateTime(timezone=True)),
        ("last_error", sa.String(100)),
        ("delivered_at", sa.DateTime(timezone=True)),
    ):
        op.add_column("outbox_messages", sa.Column(name, kind, nullable=True))
    op.create_index("ix_outbox_due", "outbox_messages", ["status", "next_attempt_at"])
    op.create_table(
        "sla_thresholds",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("case_id", sa.String(36), sa.ForeignKey("grievances.id"), nullable=False),
        sa.Column(
            "policy_version",
            sa.String(100),
            sa.ForeignKey("policy_versions.version"),
            nullable=False,
        ),
        sa.Column("threshold_key", sa.String(100), nullable=False),
        sa.Column(
            "event_id", sa.String(36), sa.ForeignKey("audit_events.id"), nullable=False, unique=True
        ),
        sa.Column("threshold_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("observed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("deadline", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("case_id", "policy_version", "threshold_key", name="uq_sla_threshold"),
    )
    op.create_index("ix_sla_thresholds_case_id", "sla_thresholds", ["case_id"])
    op.create_table(
        "notifications",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("message_id", sa.String(36), sa.ForeignKey("outbox_messages.id"), nullable=False),
        sa.Column("recipient_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("case_id", sa.String(36), sa.ForeignKey("grievances.id"), nullable=False),
        sa.Column("kind", sa.String(100), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("message_id", "recipient_id", name="uq_notification_recipient"),
    )
    op.create_index("ix_notifications_recipient_id", "notifications", ["recipient_id"])
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        for action in ("UPDATE", "DELETE"):
            op.execute(
                f"CREATE TRIGGER sla_thresholds_no_{action.lower()} BEFORE {action} ON sla_thresholds BEGIN SELECT RAISE(ABORT, 'Immutable SLA history'); END"
            )
    elif dialect == "postgresql":
        op.execute(
            "CREATE TRIGGER sla_thresholds_immutable BEFORE UPDATE OR DELETE ON sla_thresholds FOR EACH ROW EXECUTE FUNCTION govfix_refuse_history_change()"
        )


def downgrade():
    op.drop_table("notifications")
    op.drop_table("sla_thresholds")
    op.drop_index("ix_outbox_due", table_name="outbox_messages")
    for name in ("delivered_at", "last_error", "next_attempt_at"):
        op.drop_column("outbox_messages", name)
    op.drop_index("ix_grievances_next_sla_check", table_name="grievances")
    op.drop_column("grievances", "next_sla_check")
