"""설정과 상수. 매직 넘버는 여기에만 선언한다."""

from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# 저장소 루트의 .env (backend/app/core/config.py 기준 세 단계 위)
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    database_url: str = "postgresql+asyncpg://personalab:password@localhost:5432/personalab"

    llm_api_key: str = ""
    llm_model: str = ""
    llm_max_retries: int = 3
    llm_timeout: int = 30

    figma_access_token: str = ""

    max_turns: int = 10
    panel_size: int = 100
    dev_panel_size: int = 20
    dev_max_turns: int = 3

    run_mode: str = "live"


settings = Settings()


# ── 이탈 이유 카테고리 (계획서 8-5) ─────────────────────────────
# ⚠️ 6주차 이후 변경 금지. AI 이탈 / 실제 참가자 이탈 / 리뷰 라벨링 세 곳 공용.
DROP_REASONS: tuple[str, ...] = (
    "UNCLEAR_PURPOSE",
    "TOO_MANY_STEPS",
    "PRIVACY",
    "PRICE",
    "TRUST",
    "FEATURE_MISSING",
    "SWITCHING_COST",
    "NAVIGATION_LOST",
)

# Agent Loop 강제 종료 표시 (계획서 8-2). 카테고리가 아니므로 이탈 이유 집계에서 제외한다.
DROP_REASON_MAX_TURNS = "MAX_TURNS"

# 리뷰 라벨링 전용 '해당 없음' (계획서 11-3). 순위 대조에서 제외한다.
LABEL_OTHER = "OTHER"

ACT_LOG_DROP_REASONS: tuple[str, ...] = (*DROP_REASONS, DROP_REASON_MAX_TURNS)
BENCHMARK_CATEGORIES: tuple[str, ...] = (*DROP_REASONS, LABEL_OTHER)

# ── 열거값 ────────────────────────────────────────────────────
RUN_MODES: tuple[str, ...] = ("ask", "act")
PARTICIPANT_TYPES: tuple[str, ...] = ("ai", "real")
BENCHMARK_GROUPS: tuple[str, ...] = ("calib", "eval")

STUDY_STATUS_DEFAULT = "draft"
RUN_STATUS_DEFAULT = "pending"
RUN_STATUS_RUNNING = "running"
RUN_STATUS_DONE = "done"
RUN_STATUS_FAILED = "failed"
INVITE_STATUS_DEFAULT = "pending"

# ── Ask 응답 범위 (계획서 7-2) ───────────────────────────────
USAGE_INTENTION_RANGE = (1, 5)
MAX_WTP = 1_000_000  # Q6 월 지불 의향 상한 (원). 이상치 차단용

# ── act_logs.action 값 ────────────────────────────────────────
# click / abandon 은 LLM 응답, complete / stop 은 Agent Loop 가 남기는 종료 기록
ACT_CLICK = "click"
ACT_ABANDON = "abandon"
ACT_COMPLETE = "complete"
ACT_STOP = "stop"

# ponytail: 인증 미정이라 모든 요청을 개발용 사용자 한 명으로 처리. 로그인 방식이 정해지면 교체
DEV_USER_EMAIL = "dev@personalab.local"
