"""실행과 결과 저장."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ActLog, AskResponse, Run, Study


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
    return await session.scalar(query)


async def set_run_state(
    session: AsyncSession, run: Run, status: str | None = None, progress: float | None = None
) -> None:
    if status is not None:
        run.status = status
    if progress is not None:
        run.progress = progress
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
