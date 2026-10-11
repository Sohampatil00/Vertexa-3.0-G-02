"""Schedule a supervisor alert for unanswered citizen verification."""

import json
from datetime import UTC, datetime, timedelta

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("grievances", sa.Column("verification_due_at", sa.DateTime(timezone=True)))
    op.add_column("grievances", sa.Column("verification_alerted_at", sa.DateTime(timezone=True)))
    op.create_index("ix_grievances_verification_due_at", "grievances", ["verification_due_at"])
    connection = op.get_bind()
    cases = sa.table(
        "grievances",
        sa.column("id", sa.String),
        sa.column("policy_version", sa.String),
        sa.column("workflow_state", sa.String),
        sa.column("verification_due_at", sa.DateTime(timezone=True)),
    )
    policies = sa.table(
        "policy_versions", sa.column("version", sa.String), sa.column("definition", sa.JSON)
    )
    events = sa.table(
        "audit_events",
        sa.column("case_id", sa.String),
        sa.column("operation", sa.String),
        sa.column("result", sa.String),
        sa.column("occurred_at", sa.DateTime(timezone=True)),
        sa.column("case_version", sa.Integer),
    )
    pending = connection.execute(
        sa.select(cases.c.id, policies.c.definition)
        .join(policies, cases.c.policy_version == policies.c.version)
        .where(cases.c.workflow_state == "CITIZEN_VERIFICATION")
    )
    for case_id, definition in pending:
        latest = connection.execute(
            sa.select(events.c.occurred_at)
            .where(
                events.c.case_id == case_id,
                events.c.operation == "request-verification",
                events.c.result == "ACCEPTED",
            )
            .order_by(events.c.case_version.desc())
            .limit(1)
        ).scalar_one_or_none()
        if latest is None:
            raise RuntimeError("Pending verification has no request event")
        if isinstance(definition, str):
            definition = json.loads(definition)
        if isinstance(latest, str):
            latest = datetime.fromisoformat(latest)
        started = latest.replace(tzinfo=UTC) if latest.tzinfo is None else latest.astimezone(UTC)
        due = started + timedelta(hours=definition["verification_review_after_hours"])
        connection.execute(
            cases.update().where(cases.c.id == case_id).values(verification_due_at=due)
        )


def downgrade():
    op.drop_index("ix_grievances_verification_due_at", table_name="grievances")
    op.drop_column("grievances", "verification_alerted_at")
    op.drop_column("grievances", "verification_due_at")
