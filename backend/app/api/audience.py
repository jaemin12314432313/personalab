from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user_id
from app.api.persona_library import entry_out
from app.api.studies import editable_study
from app.core.db import get_session
from app.models import Study
from app.repositories import audience as repo
from app.schemas.audience import (
    AudienceFacetsOut,
    AudienceRecommendIn,
    AudienceRecommendOut,
    AudienceSearchIn,
    AudienceSearchOut,
    AudienceSelectIn,
)
from app.schemas.study import PersonaOut

router = APIRouter(tags=["audience"], dependencies=[Depends(current_user_id)])


@router.get("/persona-library/audience/facets", response_model=AudienceFacetsOut)
async def facets(session: AsyncSession = Depends(get_session)):
    return await repo.facets(session)


@router.post("/persona-library/audience/search", response_model=AudienceSearchOut)
async def search(body: AudienceSearchIn, session: AsyncSession = Depends(get_session)):
    rows, duplicates = await repo.search(session, body.filters)
    return AudienceSearchOut(
        total=len(rows),
        duplicates_excluded=duplicates,
        items=[entry_out(r) for r in rows[body.offset : body.offset + body.limit]],
    )


@router.post("/persona-library/audience/recommend", response_model=AudienceRecommendOut)
async def recommend(body: AudienceRecommendIn, session: AsyncSession = Depends(get_session)):
    from app.services.audience_recommendation import recommend as compose

    rows, _ = await repo.search(session, body.filters)
    return AudienceRecommendOut(
        total=len(rows),
        requested_count=body.count,
        items=[entry_out(r) for r in compose(rows, body.count)],
    )


@router.post("/studies/{study_id}/panel/select", response_model=list[PersonaOut])
async def select_panel(
    body: AudienceSelectIn,
    study: Study = Depends(editable_study),
    session: AsyncSession = Depends(get_session),
):
    try:
        rows = await repo.select_for_study(session, study, body.audience)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from None
    return [PersonaOut(id=r.id, attributes=r.attributes_json) for r in rows]
