from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import DEV_USER_EMAIL
from app.core.db import get_session
from app.repositories import study as study_repo


async def current_user_id(session: AsyncSession = Depends(get_session)) -> int:
    # ponytail: 인증 미정. 로그인 방식(소셜·이메일)이 정해지면 토큰에서 사용자를 꺼내도록 교체
    return (await study_repo.get_or_create_user(session, DEV_USER_EMAIL)).id
