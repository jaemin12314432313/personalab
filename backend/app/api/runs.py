from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user_id
from app.core.db import get_session
from app.repositories import run as run_repo
from app.schemas.run import RunOut

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
