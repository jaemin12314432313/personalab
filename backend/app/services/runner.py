"""Ask·Act 실행기. 페르소나를 한 명씩 돌리며 결과와 진행률을 저장한다."""

import asyncio
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import RUN_STATUS_DONE, RUN_STATUS_FAILED, RUN_STATUS_RUNNING, settings
from app.core.db import SessionLocal
from app.repositories import run as run_repo
from app.repositories import study as study_repo
from app.services.act.loop import agent_loop
from app.services.ask.answer import ask_persona, check_ask

log = logging.getLogger(__name__)

Launcher = Callable[[int], Awaitable[None]]


def _ask_with_retries(persona: dict, product: dict, questions: list[dict]) -> dict | None:
    """검증을 통과할 때까지 최대 llm_max_retries 번.

    끝내 실패하면 None. 그 페르소나는 집계에서 빠진다.
    """
    for _ in range(settings.llm_max_retries):
        out = ask_persona(persona, product, questions)
        problem = check_ask(out, product["features"])
        if problem is None:
            return out
        log.warning("Ask 응답 무효: %s", problem)
    return None


async def execute_run(session: AsyncSession, run_id: int) -> None:
    run = await run_repo.get_run(session, run_id)
    await run_repo.set_run_state(session, run, status=RUN_STATUS_RUNNING)
    try:
        personas = await study_repo.list_personas(session, run.study_id)
        if run.mode == "ask":
            p = await study_repo.get_product(session, run.study_id)
            product = {"description": p.description, "features": p.features_json, "price": p.price}
            questions = [
                {"code": q.code, "type": q.type, "text": q.text}
                for q in await study_repo.list_questions(session, run.study_id)
            ]
        else:
            proto = await study_repo.get_prototype(session, run.study_id)
            task = await study_repo.get_task(session, run.study_id)
            screens = {s["id"]: s for s in proto.screens_json}
            start = proto.screens_json[0]["id"]

        for i, persona in enumerate(personas, 1):
            # LLM 호출은 동기라 스레드로 넘긴다. 이벤트 루프를 막지 않게
            attrs = persona.attributes_json
            if run.mode == "ask":
                out = await asyncio.to_thread(_ask_with_retries, attrs, product, questions)
                if out is not None:
                    await run_repo.add_ask_response(session, run.id, persona.id, out)
            else:
                rows = await asyncio.to_thread(
                    agent_loop,
                    attrs,
                    task.description,
                    screens,
                    start,
                    task.goal_screen_id,
                    settings.max_turns,
                )
                await run_repo.add_ai_act_logs(session, run.id, persona.id, rows)
            await run_repo.set_run_state(session, run, progress=i / len(personas))
        await run_repo.set_run_state(session, run, status=RUN_STATUS_DONE)
    except Exception:
        log.exception("실행 실패 run_id=%s", run_id)
        await session.rollback()
        await run_repo.set_run_state(session, run, status=RUN_STATUS_FAILED)


async def execute_in_background(run_id: int) -> None:
    """요청이 끝난 뒤 돌기 때문에 요청 세션과 별도로 연다."""
    async with SessionLocal() as session:
        await execute_run(session, run_id)
