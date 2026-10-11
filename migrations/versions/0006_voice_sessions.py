"""Consent-bound voice intake sessions."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "voice_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("actor_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("provider_conversation_id", sa.String(100), nullable=False, unique=True),
        sa.Column("provider_transcript", sa.JSON()),
        sa.Column("language", sa.String(2), nullable=False),
        sa.Column(
            "policy_version",
            sa.String(100),
            sa.ForeignKey("policy_versions.version"),
            nullable=False,
        ),
        sa.Column("consent_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cancelled", sa.Boolean(), nullable=False),
        sa.Column("transcript", sa.Text()),
        sa.Column("draft", sa.JSON()),
        sa.Column("draft_hash", sa.String(64)),
        sa.Column("confirmed_at", sa.DateTime(timezone=True)),
        sa.Column("result", sa.JSON()),
    )
    op.create_index("ix_voice_sessions_actor_id", "voice_sessions", ["actor_id"])


def downgrade():
    op.drop_index("ix_voice_sessions_actor_id", table_name="voice_sessions")
    op.drop_table("voice_sessions")
