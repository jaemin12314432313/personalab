import importlib.util
from pathlib import Path

from fastapi import FastAPI, Depends, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.api import auth, runs, studies, persona_library, interviews, local, workflow, workspace
from app.api.deps import check_csrf
from app.core.config import OPENAI_DEFAULT_MODEL, LLM_DEFAULT_MODEL, BROWSER_RUNTIME, settings
from app.core.db import get_session
from app.repositories import persona_library as library_repo
from sqlalchemy.ext.asyncio import AsyncSession

from contextlib import asynccontextmanager
from app.core.db import SessionLocal
from app.repositories import run as run_repo
from app.repositories import exploration as exploration_repo
from app.services import exploration

@asynccontextmanager
async def lifespan(app):
    # 이 앱은 단일 실행기 프로세스로 기동한다. 끊긴 실행은 자동으로 유료 재시도하지 않는다.
    async with SessionLocal() as session:
        await run_repo.recover_interrupted(session)
        await exploration_repo.interrupted(session)
    try:yield
    finally:await exploration.shutdown()

app = FastAPI(title="PersonaLab", dependencies=[Depends(check_csrf)], lifespan=lifespan)
app.include_router(auth.router)
app.include_router(studies.router)
app.include_router(runs.router)
app.include_router(persona_library.router)
app.include_router(interviews.router)
app.include_router(local.router)
app.include_router(workflow.router)
from app.api import audience
app.include_router(workspace.router)
app.include_router(audience.router)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, error: RequestValidationError):
    # 인증 입력(특히 비밀번호)을 오류 응답에 반사하지 않는다.
    details = [{"loc": item["loc"], "msg": item["msg"], "type": item["type"]} for item in error.errors()]
    return JSONResponse(status_code=422, content={"detail": details})


class HealthResponse(BaseModel):
    status: str


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")


class CapabilitiesResponse(BaseModel):
    audience_builder_ready: bool = True
    persona_ready: bool
    llm_ready: bool
    provider: str
    missing: list[str]
    max_turns: int
    library_ready: bool = False
    library_count: int = 0
    model: str = ""
    persona_transmission_allowed: bool = False
    figma_ready: bool = False
    local_tools_enabled: bool = False
    workspace_management_ready: bool = True
    workflow_ready: bool = True
    browser_ready: bool = False
    interview_records_ready: bool = True
    interview_llm_ready: bool = False
    # 탐색 판단 엔진: rule=AI 호출 없는 규칙 기반(비용 없음), llm=모델 호출
    agent_engine: str = "llm"


@app.get("/capabilities", response_model=CapabilitiesResponse)
async def capabilities(session: AsyncSession = Depends(get_session)) -> CapabilitiesResponse:
    panels = await library_repo.list_panels(session)
    library_count = sum(count for _, count in panels)
    root = Path(__file__).resolve().parents[2]
    raw = root / "data" / "raw"
    missing = []
    for name in ("p24v32_KMP_spss.sav", "P_codebook_v32.xlsx"):
        if not (raw / name).is_file():
            missing.append(f"페르소나 원본 데이터 필요: {name}")
    for module in ("pandas", "numpy", "scipy", "pyarrow", "pyreadstat", "openpyxl", "datasets"):
        if importlib.util.find_spec(module) is None:
            missing.append(f"페르소나 엔진 패키지 필요: {module}")
    persona_ready = not missing
    if library_count:
        missing = []
    from app.services import rule_agent
    rule_engine = rule_agent.use_rule_engine()
    if not settings.llm_api_key and not rule_engine:
        missing.append("에이전트 실행에 사용할 LLM API 키 설정 필요")
    return CapabilitiesResponse(
        persona_ready=persona_ready,
        browser_ready=bool(importlib.util.find_spec("playwright") and any(BROWSER_RUNTIME.glob("chromium*/*/chrome*"))),
        local_tools_enabled=settings.local_tools_enabled,
        interview_llm_ready=bool(settings.allow_persona_transmission and settings.llm_api_key and not rule_engine),
        figma_ready=bool(settings.figma_access_token),
        llm_ready=bool(settings.llm_api_key),
        agent_engine="rule" if rule_engine else "llm",
        provider=settings.llm_provider,
        persona_transmission_allowed=settings.allow_persona_transmission,
        model=settings.llm_model or (OPENAI_DEFAULT_MODEL if settings.llm_provider == "openai" else LLM_DEFAULT_MODEL),
        library_ready=library_count > 0,
        library_count=library_count,
        missing=missing,
        max_turns=settings.max_turns,
    )
