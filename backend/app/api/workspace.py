from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.study import Study
from app.api.deps import current_user_id
from app.core.db import get_session
from app.repositories import study as study_repo, workspace as repo
from app.schemas.workspace import DiscardOut, EmptyTrashIn, EmptyTrashOut, ManagementIn, ManagementOut, WorkspaceState

router=APIRouter(tags=['workspace'])

@router.post('/studies/trash/empty',response_model=EmptyTrashOut)
async def empty_trash(body:EmptyTrashIn,session:AsyncSession=Depends(get_session),user_id:int=Depends(current_user_id)):
    if body.confirmation!='휴지통 비우기':raise HTTPException(422,'확인 문구를 정확히 입력하세요.')
    deleted,skipped,ids=await repo.empty_trash(session,user_id)
    return EmptyTrashOut(deleted=deleted,skipped=skipped,study_ids=ids)

@router.post('/studies/{study_id}/manage',response_model=ManagementOut)
async def manage(study_id:int,body:ManagementIn,session:AsyncSession=Depends(get_session),user_id:int=Depends(current_user_id)):
    study=await study_repo.get_study(session,study_id,user_id)
    if study is None:raise HTTPException(404,'테스트가 없습니다.')
    try:root,ids,state,deleted,duplicate=await repo.manage(session,study,body)
    except LookupError as e:raise HTTPException(404,str(e)) from None
    except RuntimeError as e:raise HTTPException(409,str(e)) from None
    except ValueError as e:raise HTTPException(422,str(e)) from None
    return ManagementOut(root_study_id=root,affected_study_ids=ids,workspace=WorkspaceState.model_validate(state) if state else WorkspaceState(),deleted=deleted,duplicate_id=duplicate)


@router.post('/studies/{study_id}/discard',response_model=DiscardOut)
async def discard_revision(study_id:int,session:AsyncSession=Depends(get_session),user_id:int=Depends(current_user_id)):
    """수정 회차 하나를 지운다. 1회차는 테스트 전체의 기준이라 지울 수 없고, 실행 중이거나 휴지통에 있으면 거절한다."""
    study=await study_repo.get_study(session,study_id,user_id)
    if study is None:raise HTTPException(404,'테스트가 없습니다.')
    try:root,rows=await repo.lock_group(session,study)
    except LookupError as e:raise HTTPException(404,str(e)) from None
    if root==study.id:raise HTTPException(409,'1회차는 테스트의 기준이라 따로 지울 수 없어요. 테스트 전체를 지우려면 휴지통으로 옮기세요.')
    pref=await repo.state(session,root)
    if pref is not None and pref.trashed:raise HTTPException(409,'휴지통에 있는 테스트는 먼저 복원하세요.')
    if await repo.active(session,[study.id]):raise HTTPException(409,'실행 중인 회차는 지울 수 없어요. 실행을 마치거나 취소한 뒤 다시 시도하세요.')
    await session.execute(delete(Study).where(Study.id==study.id,Study.user_id==user_id))
    await session.commit()
    return DiscardOut(deleted=study.id,root_study_id=root)
