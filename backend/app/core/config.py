"""설정과 상수. 매직 넘버는 여기에만 선언한다."""

from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

# 저장소 루트의 .env (backend/app/core/config.py 기준 세 단계 위)
ENV_FILE = Path(__file__).resolve().parents[3] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, extra="ignore")

    database_url: str = "postgresql+asyncpg://personalab:password@localhost:5432/personalab"

    llm_provider: Literal["gemini", "openai"] = "gemini"
    llm_api_key: str = ""
    llm_model: str = ""
    llm_max_retries: int = 3
    llm_timeout: int = 30
    llm_max_output_tokens: int = 900
    allow_persona_transmission: bool = False
    # auto: 모델 키와 카드 전송 허용이 모두 있을 때만 LLM, 아니면 규칙 기반(비용 없음). llm/rule로 고정할 수도 있다
    agent_engine: Literal["auto", "llm", "rule"] = "auto"
    # 규칙 기반 탐색도 실제 에이전트처럼 천천히 보이도록 판단마다 잠깐 "생각하는 시간"을 둔다(밀리초, 0이면 끔)
    rule_step_delay_ms: int = 1800
    # 브라우저 탐색을 동시에 돌리는 사람 수(각자 브라우저를 따로 연다). 1이면 한 명씩
    run_concurrency: int = 4

    figma_access_token: str = ""

    max_turns: int = 10
    panel_size: int = 100
    dev_panel_size: int = 20
    dev_max_turns: int = 3

    local_tools_enabled: bool = False
    run_mode: str = "live"
    auth_allowed_origins: list[str] = ["http://127.0.0.1:5173", "http://localhost:5173", "http://127.0.0.1:8000", "http://localhost:8000"]
    auth_cookie_secure: bool = False


settings = Settings()

AUTH_COOKIE = "personalab_session"
AUTH_SESSION_SECONDS = 60 * 60 * 24 * 7
AUTH_PASSWORD_MIN = 4
AUTH_PASSWORD_MAX = 128
AUTH_HASH_MEMORY = 19456
AUTH_HASH_TIME = 2
AUTH_HASH_PARALLELISM = 1
AUTH_TOKEN_BYTES = 32
AUTH_RATE_WINDOW_SECONDS = 60
AUTH_RATE_MAX_ATTEMPTS = 10


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
PARTICIPANT_AI = PARTICIPANT_TYPES[0]
BENCHMARK_GROUPS: tuple[str, ...] = ("calib", "eval")

STUDY_STATUS_DEFAULT = "draft"
RUN_STATUS_DEFAULT = "pending"
RUN_STATUS_RUNNING = "running"
RUN_STATUS_DONE = "done"
RUN_STATUS_FAILED = "failed"

# 결과 스냅샷 (models/run.py RunReport)
REPORT_OUTCOMES = ("done", "cancelled", "failed")
# build_results 의 묶음 규칙이 바뀌면 올린다. 저장된 보고서는 당시 버전 그대로 보존한다
REPORT_RULES_VERSION = 1
# 규칙 기반 탐색이 남기는 이유 문장의 머리말. 보고서가 판단 엔진을 구분할 때 쓴다(DB 스키마를 바꾸지 않기 위해)
RULE_REASON_PREFIX = "규칙 기반 탐색"
RULE_ENGINE_INTERVIEW_NOTICE = "지금은 AI 호출 없이 동작하는 모드라 인터뷰는 저장된 기록 조회만 제공합니다."
INVITE_STATUS_DEFAULT = "pending"

# ── Ask 응답 범위 (계획서 7-2) ───────────────────────────────
USAGE_INTENTION_RANGE = (1, 5)
MAX_WTP = 1_000_000  # Q6 월 지불 의향 상한 (원). 이상치 차단용

# ── LLM 호출 (services/llm.py) ─────────────────────────────────
# 무료 티어 모델. 한도는 https://aistudio.google.com/rate-limit. .env 의 LLM_MODEL 로 교체
LLM_DEFAULT_MODEL = "gemini-3.5-flash-lite"
OPENAI_DEFAULT_MODEL = "gpt-5.4-mini"
OPENAI_API_BASE = "https://api.openai.com/v1"
OPENAI_RETRY_WAIT_SEC = 2
LLM_RATE_LIMIT_WAIT_SEC = 30  # 429 면 쉬었다 재시도. 재시도 2번이면 분당 한도 창을 넘긴다
LLM_SERVER_BUSY_WAIT_SEC = 10  # 503 과부하 등 서버 쪽 오류
LLM_IMAGE_TYPES: tuple[str, ...] = ("image/png", "image/jpeg", "image/webp", "image/gif")

# ── 리포트 표기 (services/report.py) ───────────────────────────
# 페르소나 표시 ID. 페르소나 데이터에 persona_id 가 없으면 DB 번호로 만든다 (P007)
PERSONA_ID_PREFIX = "P"
PERSONA_ID_WIDTH = 3
# act_logs.turn 은 0부터, 사람이 읽는 턴 번호는 1부터
TURN_NUMBER_OFFSET = 1

# ── act_logs.action 값 ────────────────────────────────────────
# click / abandon 은 LLM 응답, complete / stop 은 Agent Loop 가 남기는 종료 기록
ACT_CLICK = "click"
ACT_ABANDON = "abandon"
ACT_COMPLETE = "complete"
ACT_STOP = "stop"


PERSONA_TRANSMISSION_BLOCKED = "실제 페르소나 카드의 외부 전송이 보류되어 있습니다."

FIGMA_API_BASE = "https://api.figma.com/v1"
FIGMA_TIMEOUT_SEC = 20
FIGMA_MAX_ATTEMPTS = 3
FIGMA_MAX_SCREENS = 20
FIGMA_MAX_NODES = 50000
FIGMA_MAX_BYTES = 15 * 1024 * 1024
FIGMA_MAX_DESCRIPTION = 6000

INTERVIEW_QUESTION_MAX = 500
INTERVIEW_ANSWER_MAX = 4000
INTERVIEW_HISTORY_LIMIT = 50
INTERVIEW_CONTEXT_LIMIT = 8
LOCAL_CHECK_MAX_TURNS = 3

# 브라우저 기반 UX 탐색의 비용·입력 상한
BROWSER_TIMEOUT_MS = 15000
BROWSER_RUN_MAX_TURNS = 30
BROWSER_MAX_ELEMENTS = 60
BROWSER_MAX_TEXT = 6000
BROWSER_MAX_FILES = 100
BROWSER_UPLOAD_BYTES = 8 * 1024 * 1024
BROWSER_LOCAL_PORTS = (3000, 4173, 5173, 8080)
BROWSER_RUNTIME = Path(__file__).resolve().parents[3] / '.localtools' / 'personalab' / 'browsers'

SITE_SCAN_MAX_PAGES = 20
SITE_SCAN_MAX_DISCOVERED = 200
SITE_SCAN_TIMEOUT_SECONDS = 40
SITE_SCAN_PAGE_TIMEOUT_MS = 5000
# 꼭 확인할 것(한 줄에 하나)과 추가로 알려줄 내용은 페르소나 지시문에 들어간다. 사용자가 자유롭게 쓰되 터무니없이 길어지지는 않게 한다
SITE_SCAN_MAX_PRIORITIES = 50
SITE_SCAN_PRIORITY_MAX_CHARS = 300
SCOPE_FOCUS_MAX_CHARS = 4000
SITE_DEFAULT_MAX_TURNS = 12
# LLM 모드에서 한 화면을 판단할 수 있는 최대 횟수. 되돌아가기·스크롤은 허용하되 같은 화면을 맴도는 무한 반복과 비용을 막는다.
BROWSER_MAX_VISITS_PER_SCREEN = 3
# 모델에 보내는 프롬프트·응답 형식을 바꿀 때마다 올린다. 실행 기록에 남겨 회차 비교가 같은 조건인지 판단하는 데 쓴다.
PROMPT_REVISION = "2026-11-10.3"
# 같은 질문을 이 시간 안에 다시 보내면 유료 호출을 반복하지 않고 직전 답을 돌려준다(더블 클릭·응답 유실 뒤 재시도 방어).
INTERVIEW_DEDUPE_SECONDS = 120

# 연결 시 익명 브라우저에서 수행하는 모델 없는 사전 탐색
PREFLIGHT_MAX_STATES = 20
PREFLIGHT_MAX_ATTEMPTS = 40
PREFLIGHT_MAX_DEPTH = 20
PREFLIGHT_TIMEOUT_SECONDS = 40
PREFLIGHT_ACTION_TIMEOUT_MS = 1800
PREFLIGHT_MAX_ELEMENTS = 120
PREFLIGHT_MAX_IMAGES = 6
PREFLIGHT_MAX_INPUTS = 5
PREFLIGHT_MAX_CLICKS = 120

PREFLIGHT_NAV_STATE_RESERVE = 12
PREFLIGHT_NAV_IMAGE_RESERVE = 5

# 모델 없는 구조 탐색 작업의 누적 예산과 저장/동시성 한도
EXPLORATION_STATE_STEP = 200
EXPLORATION_ATTEMPT_STEP = 400
EXPLORATION_CLICK_STEP = 1200
EXPLORATION_TIME_STEP = 300
EXPLORATION_MAX_STATES = 1000
EXPLORATION_MAX_ATTEMPTS = 2000
EXPLORATION_MAX_CLICKS = 6000
EXPLORATION_MAX_SECONDS = 1800
EXPLORATION_MAX_PENDING = 5000
EXPLORATION_MAX_IMAGES = 24
EXPLORATION_MAX_DEPTH = 40
EXPLORATION_MAX_PAGES = 100
EXPLORATION_MAX_DISCOVERED = 1000
EXPLORATION_CONCURRENCY = 2
EXPLORATION_POLL_SECONDS = 2

BROWSER_PREVIEW_READY_MS = 5000
BROWSER_PREVIEW_FONT_MS = 1000

# 대상 사용자 구성의 연령대 구간(개별 적합성/모집단 분포를 의미하지 않음).
AUDIENCE_AGE_BAND_YEARS = 10

# 사전 탐색 한 묶음에서 동일 실패 경로를 재확인하는 상한. 남은 경로는 체크포인트에 보존한다.
PREFLIGHT_FAILURE_RETRIES = 2
PREFLIGHT_HOVER_SETTLE_MS = 120

# 연결 단계의 직접 URL 구조·이미지 수집. 실제 클릭 탐색은 Act에서 수행한다.
SNAPSHOT_PAGE_STEP = 24
SNAPSHOT_TIME_STEP = 20
SNAPSHOT_CONCURRENCY = 4
SNAPSHOT_NAVIGATION_MS = 4000
SNAPSHOT_READY_MS = 600
SNAPSHOT_CAPTURE_MS = 1500

# 실행 중 진입 페이드가 끝나기 전 흰 화면을 저장하지 않도록 유한하게 기다린다.
BROWSER_ACTION_READY_MS = 1200
# 자바스크립트로 그려지는 앱은 페이지가 열린 직후 비어 있다. 관찰 전에 네트워크가 잠잠해지고 누를 수 있는 요소가 보일 때까지 최대 이만큼 기다린다
BROWSER_SETTLE_MS = 3500
# 첫 캡처가 비어 있으면(자바스크립트 앱이 아직 안 그려진 경우) 한 번 더 기다렸다가 다시 찍는다
BROWSER_RECAPTURE_WAIT_MS = 2000
BROWSER_INTERACTIVE_SELECTOR = "a[href],button,input,textarea,select,summary,[role=button],[role=link],[role=tab],[role=menuitem],[onclick]"
