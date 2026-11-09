"""테스트 이름·보관·휴지통 관리."""
from alembic import op
import sqlalchemy as sa
revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None

def upgrade():
    op.create_table('workspace_preferences',
        sa.Column('root_study_id', sa.Integer(), sa.ForeignKey('studies.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('display_name', sa.String(200), nullable=True),
        sa.Column('archived', sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column('trashed', sa.Boolean(), nullable=False, server_default=sa.false()))

def downgrade():
    op.drop_table('workspace_preferences')
