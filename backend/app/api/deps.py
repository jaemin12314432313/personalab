from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import AUTH_COOKIE, settings
from app.core.db import get_session
from app.repositories import auth as auth_repo
from app.services.auth import token_digest


async def current_user_id(request: Request, session: AsyncSession = Depends(get_session)) -> int:
    token = request.cookies.get(AUTH_COOKIE, "")
    user = (
        await auth_repo.user_for_session(session, token_digest(token))
        if token and len(token) <= 128
        else None
    )
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "로그인이 필요합니다.")
    return user.id


async def check_csrf(request: Request):
    if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
        return
    if request.headers.get("x-requested-with") != "PersonaLab":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "올바른 앱 요청이 아닙니다.")
    origin = request.headers.get("origin")
    if origin is not None and origin not in settings.auth_allowed_origins:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "허용되지 않은 요청 출처입니다.")
