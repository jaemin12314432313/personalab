"""실제 참가자와 검증 (계획서 9장: invites, benchmark_*, calibrations)."""

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.config import BENCHMARK_CATEGORIES, BENCHMARK_GROUPS, INVITE_STATUS_DEFAULT
from app.models.base import Base, check_in


class Invite(Base):
    __tablename__ = "invites"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(20), server_default=INVITE_STATUS_DEFAULT)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class BenchmarkApp(Base):
    """⚠️ group 으로 보정용(calib)과 평가용(eval)을 강제 분리한다 (계획서 11-1)."""

    __tablename__ = "benchmark_apps"
    __table_args__ = (check_in("group", BENCHMARK_GROUPS, "group"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    prelaunch_info: Mapped[str] = mapped_column(Text)
    group: Mapped[str] = mapped_column(String(10))


class BenchmarkIssue(Base):
    """리뷰 라벨. category 는 8개 카테고리 또는 OTHER(해당 없음)."""

    __tablename__ = "benchmark_issues"
    __table_args__ = (check_in("category", BENCHMARK_CATEGORIES, "category"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    app_id: Mapped[int] = mapped_column(
        ForeignKey("benchmark_apps.id", ondelete="CASCADE"), index=True
    )
    category: Mapped[str] = mapped_column(String(30))
    weight: Mapped[float] = mapped_column(Float)
    labeler_id: Mapped[str] = mapped_column(String(20))


class Calibration(Base):
    """AI 예측과 실측의 오차. 이후 스터디의 신뢰도 블록에 표시된다."""

    __tablename__ = "calibrations"

    id: Mapped[int] = mapped_column(primary_key=True)
    study_id: Mapped[int] = mapped_column(ForeignKey("studies.id", ondelete="CASCADE"), index=True)
    metric: Mapped[str] = mapped_column(String(50))
    ai_value: Mapped[float] = mapped_column(Float)
    real_value: Mapped[float] = mapped_column(Float)
    gap: Mapped[float] = mapped_column(Float)
