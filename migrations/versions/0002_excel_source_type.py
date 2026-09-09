"""Allow Excel workbooks as an import source_type in the existing imports CHECK."""
from alembic import op

revision = '0002'
down_revision = '0001'
branch_labels = None
depends_on = None

CONSTRAINT = 'source_type'
OLD = "source_type IN ('json','paste','csv')"
NEW = "source_type IN ('json','paste','csv','excel')"


def upgrade():
    op.drop_constraint(CONSTRAINT, 'imports', type_='check')
    op.create_check_constraint(CONSTRAINT, 'imports', NEW)


def downgrade():
    op.drop_constraint(CONSTRAINT, 'imports', type_='check')
    op.create_check_constraint(CONSTRAINT, 'imports', OLD)