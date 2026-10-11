"""Protect stored policy versions and append-only audit history.

Revision ID: 0002
Revises: 0001
"""

from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    dialect = op.get_bind().dialect.name
    if dialect == "sqlite":
        for table in ("policy_versions", "audit_events"):
            for action in ("UPDATE", "DELETE"):
                op.execute(f"""
                    CREATE TRIGGER protect_{table}_{action.lower()}
                    BEFORE {action} ON {table}
                    BEGIN SELECT RAISE(ABORT, '{table} is append-only'); END
                """)
    elif dialect == "postgresql":
        op.execute("""
            CREATE FUNCTION govfix_refuse_history_change() RETURNS trigger AS $$
            BEGIN RAISE EXCEPTION '% is append-only', TG_TABLE_NAME; END;
            $$ LANGUAGE plpgsql
        """)
        for table in ("policy_versions", "audit_events"):
            op.execute(f"""
                CREATE TRIGGER protect_{table} BEFORE UPDATE OR DELETE ON {table}
                FOR EACH ROW EXECUTE FUNCTION govfix_refuse_history_change()
            """)
    else:
        raise RuntimeError(f"Unsupported database dialect: {dialect}")


def downgrade():
    dialect = op.get_bind().dialect.name
    for table in ("policy_versions", "audit_events"):
        if dialect == "sqlite":
            for action in ("update", "delete"):
                op.execute(f"DROP TRIGGER protect_{table}_{action}")
        elif dialect == "postgresql":
            op.execute(f"DROP TRIGGER protect_{table} ON {table}")
    if dialect == "postgresql":
        op.execute("DROP FUNCTION govfix_refuse_history_change()")
