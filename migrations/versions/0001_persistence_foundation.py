"""Initial PostgreSQL evidence-preserving foundation (empty database)."""
from alembic import op
from sqlalchemy.schema import CreateTable, CreateIndex, DropTable
from persistence.schema_v1 import metadata
from persistence.guards_v1 import FUNCTIONS, TRIGGERS, FUNCTION_NAMES

revision = '0001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    # Versioned/frozen metadata, not mutable current application models.
    for table in metadata.sorted_tables:
        op.execute(CreateTable(table))
        for index in table.indexes:
            op.execute(CreateIndex(index))
    for sql in FUNCTIONS + TRIGGERS:
        op.execute(sql)


def downgrade():
    # Explicit migration rollback destroys these records: never use on live data.
    for table in reversed(metadata.sorted_tables):
        op.execute(DropTable(table))
    for name in FUNCTION_NAMES:
        op.execute(f'DROP FUNCTION {name}()')
