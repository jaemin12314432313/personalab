"""스터디와 스터디 입력 (계획서 9장: users ~ questions)."""

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import STUDY_STATUS_DEFAULT
from app.models.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Study(Base):
    """핵심 단위. AI 패널과 실제 참가자가 모두 하나의 스터디에 속한다."""

    __tablename__ = "studies"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), server_default=STUDY_STATUS_DEFAULT)


class Product(Base):
    """Ask 모드 입력."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(Text)
    features_json: Mapped[list] = mapped_column(JSONB)
    price: Mapped[str] = mapped_column(Text)


class Prototype(Base):
    """Act 모드 입력. 수동 입력 폴백이면 figma_url 이 없다."""

    __tablename__ = "prototypes"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"), index=True)
    figma_url: Mapped[str | None] = mapped_column(Text)
    screens_json: Mapped[list] = mapped_column(JSONB)
    links_json: Mapped[list] = mapped_column(JSONB)


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"), index=True)
    description: Mapped[str] = mapped_column(Text)
    goal_screen_id: Mapped[str] = mapped_column(String(50))


class Question(Base):
    """AI 와 실제 참가자에게 동일하게 제시하는 문항 (Q1~Q6)."""

    __tablename__ = "questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(10))
    type: Mapped[str] = mapped_column(String(20))
    text: Mapped[str] = mapped_column(Text)
