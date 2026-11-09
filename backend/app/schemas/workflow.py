from typing import Annotated, Literal

from pydantic import BaseModel, Field

from app.core.config import (
    BROWSER_RUN_MAX_TURNS,
    SCOPE_FOCUS_MAX_CHARS,
    SITE_SCAN_MAX_PRIORITIES,
    SITE_SCAN_PRIORITY_MAX_CHARS,
)
from app.schemas.audience import AudienceDefinition


class ScopeIn(BaseModel):
    reviewed_exploration_id: str = Field(default="", max_length=64)
    exploration: Literal["site", "journey"] | None = None
    priorities: list[
        Annotated[str, Field(min_length=1, max_length=SITE_SCAN_PRIORITY_MAX_CHARS)]
    ] = Field(default_factory=list, max_length=SITE_SCAN_MAX_PRIORITIES)
    max_turns: int | None = Field(default=None, ge=1, le=BROWSER_RUN_MAX_TURNS)
    product_kind: Literal["web", "ios", "android"] = "web"
    audience: AudienceDefinition = Field(default_factory=AudienceDefinition)
    mode: Literal["general", "focused"] = "general"
    focus: str = Field(default="", max_length=SCOPE_FOCUS_MAX_CHARS)
    goal_url: str = Field(default="", max_length=2000)
    goal_text: str = Field(default="", max_length=200)
    viewport: Literal["desktop", "mobile"] = "desktop"
    scenario: str = Field(default="", max_length=500)
    # 이번 회차를 구분하는 짧은 상세 설명 (예: 온보딩 v3 · 회원가입 흐름)
    round_note: str = Field(default="", max_length=200)
    # 같은 앱·웹(제품)에 속한 테스트를 묶는 식별자와 테스트 이름. DB 스키마는 바꾸지 않고 워크플로 범위(JSONB)에 둔다
    product_id: str = Field(default="", max_length=64)
    test_title: str = Field(default="", max_length=120)


class WorkflowIn(BaseModel):
    scope: ScopeIn


class WebSourceIn(BaseModel):
    product_kind: Literal["web", "ios", "android"] = "web"
    url: str = Field(min_length=1, max_length=2000)
    viewport: Literal["desktop", "mobile"] = "desktop"


class HtmlFile(BaseModel):
    path: str = Field(min_length=1, max_length=300)
    data: str = Field(max_length=12000000)


class HtmlSourceIn(BaseModel):
    product_kind: Literal["web", "ios", "android"] = "web"
    files: list[HtmlFile] = Field(min_length=1, max_length=100)
    entry: str = Field(default="index.html", max_length=300)
    viewport: Literal["desktop", "mobile"] = "desktop"


class WorkflowOut(BaseModel):
    study_id: int
    root_study_id: int
    revision: int = 1
    source: dict = {}
    scope: ScopeIn = Field(default_factory=ScopeIn)


class SourceOut(WorkflowOut):
    screens: list[dict] = []


class RevisionIn(BaseModel):
    note: str = Field(default="", max_length=200)
    # False면 대상 사용자·참여 구성·탐색 범위를 비운 채 새 앱·웹처럼 시작한다. 이전 내용은 화면에서 골라 가져온다
    carry: bool = True


class RevisionOut(BaseModel):
    note: str = ""
    study_id: int
    revision: int
    name: str
    status: str
    created_at: str | None = None
    runs: list[dict] = []


class EvidenceOut(BaseModel):
    id: int
    persona_id: int
    turn: int
    screen: dict
    image: str
    action: dict


class ControlOut(BaseModel):
    cancel_requested: bool = False
    error: str | None = None


class ExplorationIn(BaseModel):
    job_id: str | None = Field(default=None, min_length=1, max_length=64)
    action: Literal["start", "pause", "resume"] = "start"


class ExplorationOut(BaseModel):
    job: dict | None = None
    source: dict | None = None


class CaptureRefreshIn(BaseModel):
    job_id: str | None = Field(default=None, max_length=64)


class ExplorationReviewIn(BaseModel):
    job_id: str = Field(min_length=1, max_length=64)
