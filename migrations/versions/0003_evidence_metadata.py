"""Store verified private evidence metadata."""

import sqlalchemy as sa
from alembic import op

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("evidence", sa.Column("content_type", sa.String(50), nullable=True))
    op.add_column("evidence", sa.Column("size_bytes", sa.Integer(), nullable=True))
    op.add_column("evidence", sa.Column("uploaded_at", sa.DateTime(timezone=True), nullable=True))


def downgrade():
    op.drop_column("evidence", "uploaded_at")
    op.drop_column("evidence", "size_bytes")
    op.drop_column("evidence", "content_type")
