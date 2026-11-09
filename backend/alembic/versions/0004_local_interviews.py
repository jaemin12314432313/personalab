"""로컬 점검 출처와 실행별 후속 문답."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
revision='0004'
down_revision='0003'
branch_labels=None
depends_on=None

def upgrade():
    op.create_table('local_demo_studies',sa.Column('study_id',sa.Integer(),sa.ForeignKey('studies.id',ondelete='CASCADE'),primary_key=True),sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False))
    op.create_table('interview_threads',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('run_id',sa.Integer(),sa.ForeignKey('runs.id',ondelete='CASCADE'),nullable=False),sa.Column('persona_id',sa.Integer(),sa.ForeignKey('personas.id',ondelete='CASCADE'),nullable=False),sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),sa.UniqueConstraint('run_id','persona_id',name='uq_interview_run_persona'))
    op.create_index('ix_interview_threads_run_id','interview_threads',['run_id'])
    op.create_index('ix_interview_threads_persona_id','interview_threads',['persona_id'])
    op.create_table('interview_messages',sa.Column('id',sa.Integer(),primary_key=True),sa.Column('thread_id',sa.Integer(),sa.ForeignKey('interview_threads.id',ondelete='CASCADE'),nullable=False),sa.Column('question',sa.Text(),nullable=False),sa.Column('answer',sa.Text(),nullable=False),sa.Column('mode',sa.String(12),nullable=False),sa.Column('evidence_json',postgresql.JSONB(),nullable=False),sa.Column('created_at',sa.DateTime(timezone=True),server_default=sa.func.now(),nullable=False),sa.CheckConstraint("mode IN ('records','llm')",name='ck_interview_message_mode'))
    op.create_index('ix_interview_messages_thread_id','interview_messages',['thread_id'])

def downgrade():
    op.drop_table('interview_messages')
    op.drop_table('interview_threads')
    op.drop_table('local_demo_studies')