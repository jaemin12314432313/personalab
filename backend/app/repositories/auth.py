from datetime import UTC, datetime

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AuthSession, User, UserCredential


async def credentials_for_email(session: AsyncSession, email: str):
    row = (
        await session.execute(
            select(User, UserCredential)
            .join(UserCredential, User.id == UserCredential.user_id)
            .where(User.email == email)
        )
    ).first()
    return row if row else None


async def register_user(session: AsyncSession, email: str, password_hash: str) -> User:
    user = User(email=email)
    session.add(user)
    await session.flush()
    session.add(UserCredential(user_id=user.id, password_hash=password_hash))
    await session.commit()
    return user


async def create_session(
    session: AsyncSession, user_id: int, token_hash: str, expires_at: datetime
):
    await session.execute(
        delete(AuthSession).where(AuthSession.expires_at <= datetime.now(UTC))
    )
    session.add(AuthSession(user_id=user_id, token_hash=token_hash, expires_at=expires_at))
    await session.commit()


async def user_for_session(session: AsyncSession, token_hash: str):
    return await session.scalar(
        select(User)
        .join(AuthSession, User.id == AuthSession.user_id)
        .where(
            AuthSession.token_hash == token_hash,
            AuthSession.expires_at > datetime.now(UTC),
        )
    )


async def delete_session(session: AsyncSession, token_hash: str):
    await session.execute(delete(AuthSession).where(AuthSession.token_hash == token_hash))
    await session.commit()
