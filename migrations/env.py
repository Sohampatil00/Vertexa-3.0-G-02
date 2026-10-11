from alembic import context
from sqlalchemy import create_engine, pool

from govfix.models import Base
from govfix.settings import Settings

config = context.config
target_metadata = Base.metadata
url = config.attributes.get("database_url", Settings.from_env().database_url)
if url.startswith("postgres://"):
    url = "postgresql+psycopg://" + url.removeprefix("postgres://")
elif url.startswith("postgresql://"):
    url = "postgresql+psycopg://" + url.removeprefix("postgresql://")

if context.is_offline_mode():
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    engine = create_engine(url, poolclass=pool.NullPool)
    with engine.connect() as connection:
        if engine.dialect.name == "sqlite":
            connection.exec_driver_sql("PRAGMA foreign_keys=ON")
            connection.commit()
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()
