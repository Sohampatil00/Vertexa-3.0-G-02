"""Read-only audit of GovFix's Supabase Data API boundary. Load .env before running."""

import json

from sqlalchemy import text

from govfix.database import make_engine
from govfix.models import Base
from govfix.settings import Settings


def audit(connection):
    if connection.dialect.name != "postgresql":
        raise ValueError("Permission audit requires PostgreSQL")
    tables = sorted(set(Base.metadata.tables) | {"alembic_version"})
    results = []
    for table in tables:
        row = (
            connection.execute(
                text("""
            SELECT c.relrowsecurity AS rls,
              (SELECT count(*) FROM pg_policy WHERE polrelid=c.oid AND
                polroles IS DISTINCT FROM ARRAY[(SELECT oid FROM pg_roles
                  WHERE rolname='govfix_backend')])
                AS policies,
              EXISTS (SELECT 1 FROM pg_roles r WHERE
                r.rolname IN ('anon','authenticated','service_role') AND
                has_table_privilege(r.oid,c.oid,
                  'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')) AS api_grants,
              EXISTS (SELECT 1 FROM information_schema.column_privileges p WHERE
                p.table_schema='public' AND p.table_name=:table AND
                p.grantee IN ('PUBLIC','anon','authenticated','service_role')) AS column_grants
            FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE n.nspname='public' AND c.relname=:table AND c.relkind='r'
        """),
                {"table": table},
            )
            .mappings()
            .one_or_none()
        )
        results.append(
            {
                "table": table,
                "safe": bool(
                    row
                    and row["rls"]
                    and not row["policies"]
                    and not row["api_grants"]
                    and not row["column_grants"]
                ),
                **(dict(row) if row else {"missing": True}),
            }
        )
    return results


if __name__ == "__main__":
    with make_engine(Settings.from_env().database_url).connect() as connection:
        result = audit(connection)
    print(json.dumps(result, indent=2))
    raise SystemExit(0 if all(row["safe"] for row in result) else 1)
