"""Ask·Act 실행기. 페르소나를 한 명씩 돌리며 결과와 진행률을 저장한다."""

import asyncio
import logging
from collections.abc import Awaitable, Callable

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import (
    OPENAI_DEFAULT_MODEL,
    PROMPT_REVISION,
    REPORT_RULES_VERSION,
    RUN_STATUS_DONE,
    RUN_STATUS_FAILED,
    settings,
)
from app.core.db import SessionLocal
from app.repositories import run as run_repo
from app.repositories import study as study_repo
from app.repositories import workflow as workflow_repo
from app.services import browser, rule_agent, site_map
from app.services.act.decide import decide_step
from app.services.act.loop import agent_loop
from app.services.ask.answer import ask_persona, check_ask
from app.services.llm import FatalLLMError, LLMError, require_persona_transmission, start_usage
from app.services.report import build_results

log = logging.getLogger(__name__)

Launcher = Callable[[int], Awaitable[None]]


def task_with_context(task: str, product_description: str | None, scope: dict) -> str:
    """LLM 판단에 쓸 과제 문장에, 사용자가 적은 제품 소개와 대상 사용자 설명을 덧붙인다.

    제품 설명은 '이름\\n설명' 형태로 저장된다. 비어 있는 항목은 넣지 않는다.
    """
    parts = [task]
    name, _, desc = (product_description or "").partition("\n")
    name, desc = name.strip(), desc.strip()
    if name or desc:
        parts.append("제품 소개: " + name + (f" — {desc}" if desc else ""))
    audience = ((scope.get("audience") or {}).get("description") or "").strip()
    if audience:
        parts.append("이 테스트의 대상 사용자: " + audience)
    return "\n".join(parts)


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


async def save_report_snapshot(session: AsyncSession, run, outcome: str) -> None:
    """Act 실행이 끝나거나 중단된 순간의 결과를 한 번 저장한다. 실패해도 실행 상태는 바꾸지 않는다."""
    if run.mode != "act":
        return
    try:
        personas = await study_repo.list_personas(session, run.study_id)
        acts = await run_repo.list_act_logs(session, run.id)
        notes = await workflow_repo.annotations(session, run.id)
        results = [r.model_dump(mode="json") for r in build_results(personas, [], acts, notes)]
        await run_repo.save_run_report(session, run.id, outcome, REPORT_RULES_VERSION, results)
    except Exception:
        await session.rollback()
        log.exception("결과 스냅샷 저장 실패 run_id=%s", run.id)


async def persist_run_meta(session: AsyncSession, run, meta: dict, sink, failed: int) -> None:
    """실행 조건과 사용량을 남긴다. 실패해도 실행 결과에는 영향이 없다."""
    if run.mode != "act":
        return
    try:
        data = {
            **meta,
            "usage": sink.snapshot() if meta["engine"] == "llm" else None,
            "failed_personas": failed,
        }
        await workflow_repo.save_run_meta(session, run.study_id, run.id, data)
    except Exception:
        await session.rollback()
        log.exception("실행 조건 저장 실패 run_id=%s", run.id)


async def execute_run(session: AsyncSession, run_id: int) -> None:
    run = await run_repo.claim_run(session, run_id)
    if run is None:
        return
    sink = start_usage()
    run_meta: dict = {"engine": "rule", "model": None, "prompt_rev": PROMPT_REVISION}
    failures: list[tuple[int, str]] = []
    try:
        if await study_repo.study_source(session, run.study_id) == "local-demo":
            raise RuntimeError("로컬 점검 예시는 유료 실행에 사용하지 않습니다.")
        rule = rule_agent.use_rule_engine() and run.mode == "act"
        if not rule:
            require_persona_transmission()
            run_meta = {
                "engine": "llm",
                "model": settings.llm_model or OPENAI_DEFAULT_MODEL,
                "prompt_rev": PROMPT_REVISION,
            }
        personas = await study_repo.list_personas(session, run.study_id)
        workflow = await workflow_repo.get(session, run.study_id)
        browser_source = (
            workflow.source_json
            if workflow and workflow.source_json.get("kind") in ("web", "html")
            else None
        )
        max_turns = (
            workflow.scope_json.get("max_turns") if workflow else None
        ) or settings.max_turns

        async def cancelled():
            control = await workflow_repo.control(session, run_id)
            return bool(control and control.cancel_requested)

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

        seen_pages = set()
        assigned = set()

        async def cancelled_on(sess):
            control = await workflow_repo.control(sess, run_id)
            return bool(control and control.cancel_requested)

        async def process(sess, persona):
            """페르소나 한 명을 돌린다. 동시에 여러 명을 돌릴 때는 사람마다 따로 연 세션을 넘긴다."""
            # LLM 호출은 동기라 스레드로 넘긴다. 이벤트 루프를 막지 않게
            if await cancelled_on(sess):
                raise browser.BrowserCancelled("사용자가 실행을 취소했습니다.")
            attrs = persona.attributes_json
            if run.mode == "ask":
                out = await asyncio.to_thread(_ask_with_retries, attrs, product, questions)
                if out is not None:
                    await run_repo.add_ask_response(sess, run.id, persona.id, out)
            elif browser_source:
                scope = dict(workflow.scope_json)
                if site_map.site_mode(scope):
                    start_url = site_map.next_start(browser_source, seen_pages | assigned)
                    scope["_start_url"] = start_url
                    if start_url:
                        assigned.add(
                            site_map.page_key(start_url)
                        )  # 동시에 도는 사람과 같은 시작점을 받지 않게

                async def save(turn, screen, image, action, row):
                    seen_pages.add(site_map.page_key(screen.get("url", "")))
                    await workflow_repo.add_evidence(
                        sess, run.id, persona.id, turn, screen, image, action
                    )
                    if row is not None:
                        await run_repo.add_ai_act_logs(sess, run.id, persona.id, [row])

                async def cancelled_here():
                    return await cancelled_on(sess)

                product_row = None if rule else await study_repo.get_product(sess, run.study_id)
                task_text = (
                    task.description
                    if rule
                    else task_with_context(
                        task.description, product_row.description if product_row else None, scope
                    )
                )
                await browser.explore(
                    browser_source,
                    scope,
                    attrs,
                    task_text,
                    max_turns,
                    save,
                    cancelled_here,
                    **(
                        {"decide": rule_agent.decide_browser, "tolerate_blocked": True}
                        if rule
                        else {"allow_revisit": True}
                    ),
                )
            else:
                product_row = None if rule else await study_repo.get_product(sess, run.study_id)
                task_text = (
                    task.description
                    if rule
                    else task_with_context(
                        task.description,
                        product_row.description if product_row else None,
                        dict(workflow.scope_json) if workflow else {},
                    )
                )
                rows = await asyncio.to_thread(
                    agent_loop,
                    attrs,
                    task_text,
                    screens,
                    start,
                    task.goal_screen_id,
                    max_turns,
                    decide=rule_agent.decide_screens if rule else decide_step,
                )
                await run_repo.add_ai_act_logs(sess, run.id, persona.id, rows)

        total = len(personas)
        concurrency = settings.run_concurrency if (run.mode == "act" and browser_source) else 1

        async def guarded(sess, persona):
            """한 명의 일시적 실패가 나머지 사람의 실행까지 멈추지 않게 한다.
            취소·키/결제/권한 오류처럼 모두에게 해당하는 오류와 예상 못한 오류는 그대로 올려 실행 전체를 멈춘다."""
            try:
                await process(sess, persona)
            except FatalLLMError:
                raise
            except (LLMError, browser.BrowserError) as error:
                if isinstance(error, browser.BrowserCancelled):
                    raise
                if sess is not session:
                    await (
                        sess.rollback()
                    )  # 사람마다 따로 연 세션만 되돌린다. 공유 세션의 run 객체는 건드리지 않는다
                failures.append((persona.id, str(error)))
                log.warning(
                    "페르소나 실행 실패(다른 사람은 계속) run_id=%s persona_id=%s: %s",
                    run_id,
                    persona.id,
                    error,
                )

        # 웹·HTML 탐색은 실행 하나에 크로미움을 한 번만 띄워 모두가 나눠 쓴다(사람마다 새로 띄우지 않는다)
        async with browser.shared_browser():
            if concurrency <= 1:
                for i, persona in enumerate(personas, 1):
                    await guarded(session, persona)
                    await run_repo.set_run_state(session, run, progress=i / total)
            else:
                # 사람 수가 많을 때 한 명씩 돌면 너무 오래 걸려서, 정해 둔 인원만큼 동시에 돌린다
                gate = asyncio.Semaphore(concurrency)
                lock = asyncio.Lock()
                finished = 0

                async def worker(persona):
                    nonlocal finished
                    async with gate:
                        async with SessionLocal() as sess:
                            await guarded(sess, persona)
                        async with lock:
                            finished += 1
                            await run_repo.set_run_state(session, run, progress=finished / total)

                try:
                    async with asyncio.TaskGroup() as group:
                        for persona in personas:
                            group.create_task(worker(persona))
                except ExceptionGroup as group_error:
                    raise group_error.exceptions[0] from None
        if await cancelled():
            raise browser.BrowserCancelled("사용자가 실행을 취소했습니다.")
        if failures and len(failures) >= total:
            raise LLMError(f"모든 페르소나의 실행이 실패했습니다. 첫 오류: {failures[0][1]}")
        await run_repo.set_run_state(session, run, status=RUN_STATUS_DONE)
        await persist_run_meta(session, run, run_meta, sink, len(failures))
        if failures:
            await workflow_repo.set_control(
                session,
                run_id,
                error=f"{len(failures)}명은 실행 중 오류로 기록이 없습니다. 첫 오류: {failures[0][1]}",
            )
        await save_report_snapshot(session, run, "done")
    except Exception as error:
        log.exception("실행 실패 run_id=%s", run_id)
        await session.rollback()
        failed_run = await run_repo.get_run(session, run_id)
        if failed_run is not None:
            await run_repo.set_run_state(session, failed_run, status=RUN_STATUS_FAILED)
            await persist_run_meta(session, failed_run, run_meta, sink, len(failures))
            await save_report_snapshot(
                session,
                failed_run,
                "cancelled" if isinstance(error, browser.BrowserCancelled) else "failed",
            )
            await workflow_repo.set_control(
                session,
                run_id,
                error=str(error)
                if isinstance(error, (browser.BrowserError, LLMError))
                else "실행을 완료하지 못했습니다. 연결 상태와 입력을 확인하세요.",
            )


async def execute_in_background(run_id: int) -> None:
    """요청이 끝난 뒤 돌기 때문에 요청 세션과 별도로 연다."""
    async with SessionLocal() as session:
        await execute_run(session, run_id)
