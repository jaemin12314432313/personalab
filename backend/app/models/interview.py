"""실행별 후속 문답과 로컬 점검 출처. 기존 실행/로그 스키마는 유지한다."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint, CheckConstraint, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column
from app.models.base import Base

class LocalDemoStudy(Base):
    __tablename__ = 'local_demo_studies'
    study_id: Mapped[int] = mapped_column(ForeignKey('studies.id', ondelete='CASCADE'), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class InterviewThread(Base):
    __tablename__ = 'interview_threads'
    __table_args__ = (UniqueConstraint('run_id','persona_id',name='uq_interview_run_persona'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    run_id: Mapped[int] = mapped_column(ForeignKey('runs.id',ondelete='CASCADE'),index=True)
    persona_id: Mapped[int] = mapped_column(ForeignKey('personas.id',ondelete='CASCADE'),index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

class InterviewMessage(Base):
    __tablename__ = 'interview_messages'
    __table_args__ = (CheckConstraint("mode IN ('records','llm')",name='ck_interview_message_mode'),)
    id: Mapped[int] = mapped_column(primary_key=True)
    thread_id: Mapped[int] = mapped_column(ForeignKey('interview_threads.id',ondelete='CASCADE'),index=True)
    question: Mapped[str] = mapped_column(Text)
    answer: Mapped[str] = mapped_column(Text)
    mode: Mapped[str] = mapped_column(String(12))
    evidence_json: Mapped[list] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())