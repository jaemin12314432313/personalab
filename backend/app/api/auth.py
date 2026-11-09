import asyncio
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user_id
from app.core.config import AUTH_COOKIE, AUTH_RATE_WINDOW_SECONDS, AUTH_SESSION_SECONDS, AUTH_TOKEN_BYTES, settings
from app.core.db import get_session
from app.models import User
from app.repositories import auth as auth_repo
from app.schemas.auth import AuthInput, AuthMessageOut, AuthUserOut
from app.services.auth import allow_attempt, hash_password, token_digest, verify_password

router = APIRouter(prefix="/auth", tags=["auth"])


def rate_limit(request: Request, email: str):
    if not allow_attempt(request.client.host if request.client else "unknown", email):
        raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.", headers={"Retry-After": str(AUTH_RATE_WINDOW_SECONDS)})


async def issue_session(session: AsyncSession, user: User, request: Request, response: Response):
    previous = request.cookies.get(AUTH_COOKIE)
    if previous:
        await auth_repo.delete_session(session, token_digest(previous))
    token = secrets.token_urlsafe(AUTH_TOKEN_BYTES)
    await auth_repo.create_session(session, user.id, token_digest(token), datetime.now(timezone.utc) + timedelta(seconds=AUTH_SESSION_SECONDS))
    response.set_cookie(AUTH_COOKIE, token, max_age=AUTH_SESSION_SECONDS, httponly=True, secure=settings.auth_cookie_secure or request.url.scheme == "https", samesite="lax", path="/")
    response.headers["Cache-Control"] = "no-store"


@router.post("/register", response_model=AuthUserOut, status_code=status.HTTP_201_CREATED)
async def register(body: AuthInput, request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    rate_limit(request, str(body.email))
    encoded = await asyncio.to_thread(hash_password, body.password.get_secret_value())
    try:
        user = await auth_repo.register_user(session, str(body.email), encoded)
    except IntegrityError:
        await session.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "이 이메일로 가입할 수 없습니다. 기존 계정이라면 로그인해 주세요.") from None
    await issue_session(session, user, request, response)
    return AuthUserOut.model_validate(user)


@router.post("/login", response_model=AuthUserOut)
async def login(body: AuthInput, request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    rate_limit(request, str(body.email))
    row = await auth_repo.credentials_for_email(session, str(body.email))
    valid = await asyncio.to_thread(verify_password, row[1].password_hash if row else None, body.password.get_secret_value())
    if not valid:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다.")
    await issue_session(session, row[0], request, response)
    return AuthUserOut.model_validate(row[0])


@router.get("/me", response_model=AuthUserOut)
async def me(response: Response, user_id: int = Depends(current_user_id), session: AsyncSession = Depends(get_session)):
    user = await session.get(User, user_id)
    response.headers["Cache-Control"] = "no-store"
    return AuthUserOut.model_validate(user)


@router.post("/logout", response_model=AuthMessageOut)
async def logout(request: Request, response: Response, session: AsyncSession = Depends(get_session)):
    token = request.cookies.get(AUTH_COOKIE)
    if token:
        await auth_repo.delete_session(session, token_digest(token))
    response.delete_cookie(AUTH_COOKIE, path="/", httponly=True, samesite="lax", secure=settings.auth_cookie_secure or request.url.scheme == "https")
    response.headers["Cache-Control"] = "no-store"
    return AuthMessageOut(message="로그아웃했습니다.")
