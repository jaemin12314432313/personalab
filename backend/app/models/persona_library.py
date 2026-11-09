"""기존 생성 패널의 변경 불가능한 버전과 재사용 카드 보관함."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PersonaLibraryPanel(Base):
    __tablename__ = "persona_library_panels"
    __table_args__ = (UniqueConstraint("panel_key", "version_hash", name="uq_library_panel_version"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    panel_key: Mapped[str] = mapped_column(String(200))
    version_hash: Mapped[str] = mapped_column(String(64))
    source_commit: Mapped[str] = mapped_column(String(40))
    metadata_json: Mapped[dict] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class PersonaLibraryEntry(Base):
    __tablename__ = "persona_library_entries"
    __table_args__ = (UniqueConstraint("panel_id", "source_persona_id", name="uq_library_panel_persona"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    panel_id: Mapped[int] = mapped_column(ForeignKey("persona_library_panels.id", ondelete="RESTRICT"), index=True)
    source_persona_id: Mapped[str] = mapped_column(String(50))
    profile_hash: Mapped[str] = mapped_column(String(64))
    attributes_json: Mapped[dict] = mapped_column(JSONB)
