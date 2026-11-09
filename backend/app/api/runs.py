from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user_id
from app.core.db import get_session
from app.repositories import run as run_repo
from app.repositories import study as study_repo
from app.schemas.report import PersonaResultOut, ReportOut
from app.schemas.run import RunOut
from app.services.report import build_results, detect_engine

router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("/{run_id}/status", response_model=RunOut)
async def run_status(
    run_id: int,
    session: AsyncSession = Depends(get_session),
    user_id: int = Depends(current_user_id),
):
    run = await run_repo.get_run(session, run_id, user_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "실행이 없습니다")
    return run


@router.get("/{run_id}/report", response_model=ReportOut)
async def run_report(
    run_id: int,
    session: AsyncSession = Depends(get_session),
    user_id: int = Depends(current_user_id),
):
    """실행 중 저장된 결과도 제공한다. 다른 사용자의 실행에는 접근할 수 없다."""
    run = await run_repo.get_run(session, run_id, user_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "실행이 없습니다")
    # Act 보고서에 다른 회차의 Ask(기획 응답)를 섞지 않는다. Ask 는 자기 실행의 보고서에만 나온다.
    ask = run if run.mode == "ask" else None
    act = run if run.mode == "act" else None
    snapshot = await run_repo.get_run_report(session, run.id) if act else None
    if snapshot is not None:
        return ReportOut(
            study_id=run.study_id,
            source=await study_repo.study_source(session, run.study_id),
            ask_run_id=None,
            act_run_id=run.id,
            results=(snap_results := [PersonaResultOut.model_validate(r) for r in snapshot.results_json]),
            engine=detect_engine(snap_results),
            outcome=snapshot.outcome,
            saved_at=snapshot.built_at,
        )
    personas = await study_repo.list_personas(session, run.study_id)
    asks = await run_repo.list_ask_responses(session, ask.id) if ask else []
    acts = await run_repo.list_act_logs(session, act.id) if act else []
    return ReportOut(
        study_id=run.study_id,
        source=await study_repo.study_source(session, run.study_id),
        ask_run_id=ask.id if ask else None,
        act_run_id=act.id if act else None,
        results=(live := build_results(personas, asks, acts)),
        engine=detect_engine(live),
    )
