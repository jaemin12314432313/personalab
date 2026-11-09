"""AI 패널과 실행 결과 (계획서 9장: personas, runs, ask_responses, act_logs)."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import (
    ACT_LOG_DROP_REASONS,
    PARTICIPANT_TYPES,
    RUN_MODES,
    RUN_STATUS_DEFAULT,
)
from app.models.base import Base, check_in


class Persona(Base):
    __tablename__ = "personas"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"), index=True)
    attributes_json: Mapped[dict] = mapped_column(JSONB)


class Run(Base):
    __tablename__ = "runs"
    __table_args__ = (check_in("mode", RUN_MODES, "mode"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"), index=True)
    mode: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(20), server_default=RUN_STATUS_DEFAULT)
    # 0.0 ~ 1.0
    progress: Mapped[float] = mapped_column(Float, server_default="0")


class AskResponse(Base):
    __tablename__ = "ask_responses"

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    persona_id: Mapped[int] = mapped_column(
        ForeignKey("personas.id", ondelete="CASCADE"), index=True
    )
    response_json: Mapped[dict] = mapped_column(JSONB)


class ActLog(Base):
    """⚠️ AI 와 실제 참가자를 같은 테이블에 저장한다. 분리 금지 (CLAUDE.md).

    participant_id 는 participant_type 에 따라 personas.id(ai) 또는 invites.id(real) 를
    가리킨다. 대상이 둘이라 FK 를 걸지 않고, 무결성은 repositories/ 에서 검사한다.

    drop_reason 은 8개 카테고리 또는 MAX_TURNS(강제 종료). MAX_TURNS 는 이탈 이유
    집계에서 제외한다.
    """

    __tablename__ = "act_logs"
    __table_args__ = (
        check_in("participant_type", PARTICIPANT_TYPES, "participant_type"),
        check_in("drop_reason", ACT_LOG_DROP_REASONS, "drop_reason"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    participant_type: Mapped[str] = mapped_column(String(10))
    participant_id: Mapped[int] = mapped_column(Integer)
    turn: Mapped[int] = mapped_column(Integer)
    screen_id: Mapped[str] = mapped_column(String(50))
    action: Mapped[str] = mapped_column(String(20))
    target: Mapped[str | None] = mapped_column(Text)
    drop_reason: Mapped[str | None] = mapped_column(String(30))
    reason: Mapped[str | None] = mapped_column(Text)


class RunReport(Base):
    """실행이 끝나거나 중단되는 순간 한 번 저장하는 결과 스냅샷.

    act_logs 에서 매번 다시 계산하면 집계 규칙이 바뀔 때 과거 보고서도 달라진다.
    outcome 은 done(정상 종료) / cancelled(사용자 취소) / failed(오류 중단, 부분 기록).
    """

    __tablename__ = "run_reports"

    run_id: Mapped[int] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), primary_key=True)
    outcome: Mapped[str] = mapped_column(String(10))
    rules_version: Mapped[int] = mapped_column(Integer)
    results_json: Mapped[list] = mapped_column(JSONB)
    built_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
