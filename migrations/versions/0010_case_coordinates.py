"""Store optional browser coordinates with a grievance."""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("grievances", sa.Column("latitude", sa.Float(), nullable=True))
    op.add_column("grievances", sa.Column("longitude", sa.Float(), nullable=True))
    op.add_column("grievances", sa.Column("accuracy_m", sa.Float(), nullable=True))


def downgrade():
    op.drop_column("grievances", "accuracy_m")
    op.drop_column("grievances", "longitude")
    op.drop_column("grievances", "latitude")
