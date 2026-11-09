from fastapi import APIRouter,Depends,HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import current_user_id
from app.core.db import get_session
from app.core.config import settings
from app.repositories.local_demo import create_demo
from app.schemas.interview import LocalDemoOut
from app.services.local_demo import make_local_records

router=APIRouter(prefix='/local',tags=['local development'])

@router.post('/demo',response_model=LocalDemoOut,status_code=201)
async def local_demo(user_id:int=Depends(current_user_id),session:AsyncSession=Depends(get_session)):
    if not settings.local_tools_enabled:raise HTTPException(404,'로컬 점검 기능이 꺼져 있습니다.')
    screens,records=make_local_records()
    sid,rid=await create_demo(session,user_id,screens,records)
    return LocalDemoOut(study_id=sid,run_id=rid)