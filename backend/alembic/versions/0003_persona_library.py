"""검증된 생성 패널을 테스트와 별도로 보관한다."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table("persona_library_panels",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("panel_key", sa.String(200), nullable=False),
        sa.Column("version_hash", sa.String(64), nullable=False),
        sa.Column("source_commit", sa.String(40), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint("panel_key", "version_hash", name="uq_library_panel_version"))
    op.create_table("persona_library_entries",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("panel_id", sa.Integer(), sa.ForeignKey("persona_library_panels.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("source_persona_id", sa.String(50), nullable=False),
        sa.Column("profile_hash", sa.String(64), nullable=False),
        sa.Column("attributes_json", postgresql.JSONB(), nullable=False),
        sa.UniqueConstraint("panel_id", "source_persona_id", name="uq_library_panel_persona"))
    op.create_index("ix_persona_library_entries_panel_id", "persona_library_entries", ["panel_id"])


def downgrade():
    op.drop_table("persona_library_entries")
    op.drop_table("persona_library_panels")
