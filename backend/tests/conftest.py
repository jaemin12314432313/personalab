"""DB 테스트는 `alembic upgrade head` 가 적용된 DB 를 전제로 한다.

각 테스트는 트랜잭션 안에서 돌고 끝나면 롤백되므로 데이터가 남지 않는다.
"""

from collections.abc import AsyncIterator

import pytest
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from app.core.config import settings


@pytest.fixture
async def session() -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(settings.database_url)
    async with engine.connect() as conn:
        trans = await conn.begin()
        # expire_on_commit=False 는 앱 세션(core/db.py SessionLocal)과 맞춘 것
        async with AsyncSession(
            bind=conn, join_transaction_mode="create_savepoint", expire_on_commit=False
        ) as s:
            yield s
        await trans.rollback()
    await engine.dispose()
