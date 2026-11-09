"""테스트 회차 및 브라우저 관찰. 기존 결과 테이블은 보존한다."""

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Text, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class StudyWorkflow(Base):
    __tablename__ = "study_workflows"
    __table_args__ = (UniqueConstraint("root_study_id", "revision", name="uq_workflow_revision"),)
    study_id: Mapped[int] = mapped_column(
        ForeignKey("studies.id", ondelete="CASCADE"), primary_key=True
    )
    root_study_id: Mapped[int] = mapped_column(
        ForeignKey("studies.id", ondelete="CASCADE"), index=True
    )
    revision: Mapped[int] = mapped_column(Integer, default=1)
    source_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    scope_json: Mapped[dict] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class BrowserEvidence(Base):
    __tablename__ = "browser_evidence"
    __table_args__ = (
        UniqueConstraint("run_id", "persona_id", "turn", name="uq_browser_evidence_turn"),
    )
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    persona_id: Mapped[int] = mapped_column(ForeignKey("personas.id", ondelete="CASCADE"))
    turn: Mapped[int] = mapped_column(Integer)
    screen_json: Mapped[dict] = mapped_column(JSONB)
    image_data: Mapped[str] = mapped_column(Text)
    action_json: Mapped[dict] = mapped_column(JSONB, default=dict)


class RunControl(Base):
    __tablename__ = "run_controls"
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), primary_key=True)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    error: Mapped[str | None] = mapped_column(Text)
