"""DATABASE_URL only; no credentials in ini or logs. Allows isolated test connections."""
from alembic import context
from sqlalchemy import create_engine, pool
from persistence.database import database_url
from persistence.schema_v1 import metadata

config = context.config
if context.is_offline_mode():
    context.configure(dialect_name='postgresql', target_metadata=metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()
else:
    supplied = config.attributes.get('connection')
    def migrate(connection):
        context.configure(connection=connection, target_metadata=metadata)
        with context.begin_transaction():
            context.run_migrations()
    if supplied is not None:
        migrate(supplied)
    else:
        engine = create_engine(database_url(), poolclass=pool.NullPool, hide_parameters=True,
                               connect_args={'connect_timeout': 5})
        try:
            with engine.connect() as connection:
                migrate(connection)
        finally:
            engine.dispose()
