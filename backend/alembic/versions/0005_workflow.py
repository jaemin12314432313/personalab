"""논리 테스트 회차와 실제 브라우저 근거."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision='0005'
down_revision='0004'
branch_labels=None
depends_on=None

def upgrade():
    op.create_table('study_workflows',sa.Column('study_id',sa.Integer(),sa.ForeignKey('studies.id',ondelete='CASCADE'),primary_key=True),sa.Column('root_study_id',sa.Integer(),sa.ForeignKey('studies.id',ondelete='CASCADE'),nullable=False),sa.Column('revision',sa.Integer(),nullable=False),sa.Column('source_json',postgresql.JSONB(),nullable=False),sa.Column('scope_json',postgresql.JSONB(),nullable=False),sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),sa.UniqueConstraint('root_study_id','revision',name='uq_workflow_revision'))
    op.create_index('ix_study_workflows_root_study_id','study_workflows',['root_study_id'])
    op.create_table('browser_evidence',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('run_id',sa.Integer(),sa.ForeignKey('runs.id',ondelete='CASCADE'),nullable=False),sa.Column('persona_id',sa.Integer(),sa.ForeignKey('personas.id',ondelete='CASCADE'),nullable=False),sa.Column('turn',sa.Integer(),nullable=False),sa.Column('screen_json',postgresql.JSONB(),nullable=False),sa.Column('image_data',sa.Text(),nullable=False),sa.Column('action_json',postgresql.JSONB(),nullable=False),sa.UniqueConstraint('run_id','persona_id','turn',name='uq_browser_evidence_turn'))
    op.create_index('ix_browser_evidence_run_id','browser_evidence',['run_id'])
    op.create_table('run_controls',sa.Column('run_id',sa.Integer(),sa.ForeignKey('runs.id',ondelete='CASCADE'),primary_key=True),sa.Column('cancel_requested',sa.Boolean(),nullable=False),sa.Column('error',sa.Text(),nullable=True))

def downgrade():
    op.drop_table('run_controls')
    op.drop_table('browser_evidence')
    op.drop_table('study_workflows')
