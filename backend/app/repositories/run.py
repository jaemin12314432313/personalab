"""실행과 결과 저장."""

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import RUN_STATUS_DONE
from app.models import ActLog, AskResponse, Run, RunReport, Study


async def create_run(session: AsyncSession, study_id: int, mode: str) -> Run:
    run = Run(study_id=study_id, mode=mode)
    session.add(run)
    await session.commit()
    await session.refresh(run)
    return run


async def get_run(session: AsyncSession, run_id: int, user_id: int | None = None) -> Run | None:
    query = select(Run).where(Run.id == run_id)
    if user_id is not None:
        query = query.join(Study, Study.id == Run.study_id).where(Study.user_id == user_id)
    result = await session.scalar(query)
    if result is not None and user_id is not None:
        from app.repositories.workspace import is_trashed

        if await is_trashed(session, result.study_id):
            return None
    return result


async def latest_done_run(session: AsyncSession, study_id: int, mode: str) -> Run | None:
    """리포트에 쓸 실행: 해당 모드에서 가장 최근에 끝난 것. 실패·진행 중인 실행은 건너뛴다."""
    query = (
        select(Run)
        .where(Run.study_id == study_id, Run.mode == mode, Run.status == RUN_STATUS_DONE)
        .order_by(Run.id.desc())
        .limit(1)
    )
    return await session.scalar(query)


async def latest_run(session: AsyncSession, study_id: int, mode: str) -> Run | None:
    query = (
        select(Run)
        .where(Run.study_id == study_id, Run.mode == mode)
        .order_by(Run.id.desc())
        .limit(1)
    )
    return await session.scalar(query)


async def set_run_state(
    session: AsyncSession, run: Run, status: str | None = None, progress: float | None = None
) -> None:
    if status is not None:
        run.status = status
    if progress is not None:
        run.progress = progress
    if status is not None:
        await session.execute(update(Study).where(Study.id == run.study_id).values(status=status))
    await session.commit()


async def add_ask_response(
    session: AsyncSession, run_id: int, persona_id: int, response: dict
) -> None:
    session.add(AskResponse(run_id=run_id, persona_id=persona_id, response_json=response))
    await session.commit()


async def add_ai_act_logs(
    session: AsyncSession, run_id: int, persona_id: int, rows: list[dict]
) -> None:
    """AI 페르소나의 로그. participant_id 는 personas.id 다 (models/run.py ActLog 주석)."""
    session.add_all(
        ActLog(run_id=run_id, participant_type="ai", participant_id=persona_id, **r) for r in rows
    )
    await session.commit()


async def list_ask_responses(session: AsyncSession, run_id: int) -> list[AskResponse]:
    return list(await session.scalars(select(AskResponse).where(AskResponse.run_id == run_id)))


async def list_act_logs(session: AsyncSession, run_id: int) -> list[ActLog]:
    query = select(ActLog).where(ActLog.run_id == run_id).order_by(ActLog.id)
    return list(await session.scalars(query))


async def active_run(session: AsyncSession, study_id: int):
    return await session.scalar(
        select(Run)
        .where(Run.study_id == study_id, Run.status.in_(["pending", "running"]))
        .order_by(Run.id.desc())
        .limit(1)
    )


async def claim_run(session: AsyncSession, run_id: int):
    run = await session.scalar(
        select(Run)
        .where(Run.id == run_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if run is None or run.status != "pending":
        return None
    await set_run_state(session, run, status="running")
    return run


async def recover_interrupted(session: AsyncSession) -> int:
    rows = list(
        await session.scalars(
            select(Run).where(Run.status.in_(["pending", "running"])).with_for_update()
        )
    )
    for run in rows:
        run.status = "failed"
        await session.execute(update(Study).where(Study.id == run.study_id).values(status="failed"))
    await session.commit()
    return len(rows)


async def save_run_report(
    session: AsyncSession, run_id: int, outcome: str, rules_version: int, results: list[dict]
) -> None:
    """종료 시점 스냅샷. 같은 실행에 두 번 저장하지 않는다(먼저 저장된 것을 유지)."""
    if await session.get(RunReport, run_id) is not None:
        return
    session.add(
        RunReport(run_id=run_id, outcome=outcome, rules_version=rules_version, results_json=results)
    )
    await session.commit()


async def get_run_report(session: AsyncSession, run_id: int) -> RunReport | None:
    return await session.get(RunReport, run_id)
