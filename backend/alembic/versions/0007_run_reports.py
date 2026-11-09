"""실행 결과 스냅샷."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('run_reports',
        sa.Column('run_id', sa.Integer(), sa.ForeignKey('runs.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('outcome', sa.String(10), nullable=False),
        sa.Column('rules_version', sa.Integer(), nullable=False),
        sa.Column('results_json', postgresql.JSONB(), nullable=False),
        sa.Column('built_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.CheckConstraint("outcome in ('done','cancelled','failed')", name='ck_run_reports_outcome'))

def downgrade():
    op.drop_table('run_reports')
