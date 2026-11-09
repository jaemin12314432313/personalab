"""팀이 가져온 기준 패널. 카탈로그 조회에도 로그인 세션이 필요하다."""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user_id
from app.core.db import get_session
from app.repositories import persona_library as repo
from app.schemas.persona_library import LibraryPageOut, LibraryPanelOut, LibraryPersonaOut

router = APIRouter(prefix="/persona-library", tags=["persona-library"],
                   dependencies=[Depends(current_user_id)])


def entry_out(row):
    return LibraryPersonaOut(id=row.id, panel_id=row.panel_id,
        source_persona_id=row.source_persona_id, profile_hash=row.profile_hash,
        attributes=row.attributes_json)


@router.get("/panels", response_model=list[LibraryPanelOut])
async def panels(session: AsyncSession = Depends(get_session)):
    return [LibraryPanelOut(id=p.id, panel_key=p.panel_key, version_hash=p.version_hash,
        source_commit=p.source_commit, count=count, metadata=p.metadata_json)
        for p, count in await repo.list_panels(session)]


@router.get("/panels/{panel_id}/personas", response_model=LibraryPageOut)
async def personas(panel_id: int, limit: int = Query(50, ge=1, le=100),
                   offset: int = Query(0, ge=0), session: AsyncSession = Depends(get_session)):
    if await repo.get_panel(session, panel_id) is None:
        raise HTTPException(404, "보관함 패널이 없습니다.")
    rows = await repo.list_entries(session, panel_id, limit, offset)
    return LibraryPageOut(total=await repo.entry_count(session, panel_id),
                          limit=limit, offset=offset, items=[entry_out(row) for row in rows])


@router.get("/personas/{entry_id}", response_model=LibraryPersonaOut)
async def persona(entry_id: int, session: AsyncSession = Depends(get_session)):
    row = await repo.get_entry(session, entry_id)
    if row is None:
        raise HTTPException(404, "페르소나가 없습니다.")
    return entry_out(row)
