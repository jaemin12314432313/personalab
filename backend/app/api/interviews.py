import asyncio
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user_id
from app.core.config import (
    INTERVIEW_DEDUPE_SECONDS,
    INTERVIEW_HISTORY_LIMIT,
    PERSONA_TRANSMISSION_BLOCKED,
    RULE_ENGINE_INTERVIEW_NOTICE,
    settings,
)
from app.core.db import get_session
from app.repositories import interview as repo
from app.schemas.interview import InterviewIn, InterviewMessageOut, InterviewOut
from app.services import interview as service
from app.services import rule_agent
from app.services.llm import LLMError
from app.services.report import build_act

router = APIRouter(prefix="/runs", tags=["interviews"])


def message_out(m):
    return InterviewMessageOut(
        id=m.id,
        question=m.question,
        answer=m.answer,
        mode=m.mode,
        evidence=m.evidence_json,
        created_at=m.created_at,
    )


async def owned_context(run_id: int, persona_id: int, session: AsyncSession, user_id: int):
    ctx = await repo.context(session, run_id, persona_id, user_id)
    if ctx is None:
        raise HTTPException(404, "이 실행의 페르소나가 없습니다.")
    if ctx["run"].status not in ("done", "failed"):
        raise HTTPException(409, "실행이 모두 종료된 뒤 인터뷰를 열 수 있습니다.")
    return ctx


def response(ctx, rows):
    return InterviewOut(
        run_id=ctx["run"].id,
        persona_id=ctx["persona"].id,
        source=ctx["source"],
        llm_allowed=bool(
            settings.allow_persona_transmission
            and settings.llm_api_key
            and ctx["source"] != "local-demo"
            and not rule_agent.use_rule_engine()
        ),
        history_limit=INTERVIEW_HISTORY_LIMIT,
        messages=[message_out(m) for m in rows],
    )


@router.get("/{run_id}/personas/{persona_id}/interview", response_model=InterviewOut)
async def get_interview(
    run_id: int,
    persona_id: int,
    session: AsyncSession = Depends(get_session),
    user_id: int = Depends(current_user_id),
):
    ctx = await owned_context(run_id, persona_id, session, user_id)
    thread = await repo.thread(session, run_id, persona_id)
    return response(ctx, await repo.messages(session, thread.id) if thread else [])


@router.post(
    "/{run_id}/personas/{persona_id}/interview", response_model=InterviewMessageOut, status_code=201
)
async def post_interview(
    run_id: int,
    persona_id: int,
    body: InterviewIn,
    session: AsyncSession = Depends(get_session),
    user_id: int = Depends(current_user_id),
):
    ctx = await owned_context(run_id, persona_id, session, user_id)
    if body.mode == "llm":
        if rule_agent.use_rule_engine():
            raise HTTPException(409, RULE_ENGINE_INTERVIEW_NOTICE)
        if not settings.allow_persona_transmission:
            raise HTTPException(409, PERSONA_TRANSMISSION_BLOCKED)
        if ctx["source"] == "local-demo":
            raise HTTPException(409, "로컬 연결 점검 예시는 기록 조회만 제공합니다.")
        if not settings.llm_api_key:
            raise HTTPException(503, "LLM 키 설정이 필요합니다.")
    if build_act(ctx["logs"]) is None:
        raise HTTPException(409, "완료된 탐색 기록이 있어야 질문할 수 있습니다.")
    thread = await repo.thread(session, run_id, persona_id, lock=True)
    if body.mode == "llm":
        # 같은 질문의 반복 전송(더블 클릭, 응답이 유실된 뒤의 재시도)은 유료 호출을 또 하지 않고
        # 직전 답을 돌려준다.
        # 스레드 행을 잠근 뒤에 확인하므로 동시에 들어온 같은 요청도 하나만 호출된다.
        last = (await repo.messages(session, thread.id))[-1:]
        if (
            last
            and last[0].mode == "llm"
            and last[0].question == body.question
            and datetime.now(UTC) - last[0].created_at < timedelta(seconds=INTERVIEW_DEDUPE_SECONDS)
        ):
            return message_out(last[0])
    try:
        if body.mode == "records":
            answer, evidence = service.records_answer(ctx, body.question)
        else:
            answer, evidence = await asyncio.to_thread(
                service.llm_answer, ctx, body.question, await repo.messages(session, thread.id)
            )
        message = await repo.add_message(
            session, thread.id, body.question, answer, body.mode, evidence
        )
    except (LLMError, ValueError) as error:
        await session.rollback()
        if isinstance(error, LLMError):
            raise HTTPException(
                503, "인터뷰 모델 응답을 받지 못했습니다. 서버 연결과 설정을 확인하세요."
            ) from None
        raise HTTPException(409, str(error)) from None
    return message_out(message)
