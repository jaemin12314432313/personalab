"""스터디와 입력값 저장. 스터디당 product·prototype·task 는 하나라 다시 넣으면 교체한다."""

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Persona, Product, Prototype, Question, Study, Task, User


async def get_or_create_user(session: AsyncSession, email: str) -> User:
    user = await session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(email=email)
        session.add(user)
        await session.commit()
    return user


async def create_study(session: AsyncSession, user_id: int, name: str) -> Study:
    study = Study(user_id=user_id, name=name)
    session.add(study)
    await session.commit()
    await session.refresh(study)
    return study


async def list_studies(session: AsyncSession, user_id: int) -> list[Study]:
    query = select(Study).where(Study.user_id == user_id).order_by(Study.id.desc())
    return list(await session.scalars(query))


async def get_study(session: AsyncSession, study_id: int, user_id: int) -> Study | None:
    query = select(Study).where(Study.id == study_id, Study.user_id == user_id)
    return await session.scalar(query)


async def _replace(session: AsyncSession, model, study_id: int, obj):
    await session.execute(delete(model).where(model.study_id == study_id))
    session.add(obj)
    await session.commit()
    return obj


async def set_product(
    session: AsyncSession, study_id: int, description: str, features: list[str], price: str
) -> Product:
    obj = Product(study_id=study_id, description=description, features_json=features, price=price)
    return await _replace(session, Product, study_id, obj)


async def get_product(session: AsyncSession, study_id: int) -> Product | None:
    return await session.scalar(select(Product).where(Product.study_id == study_id))


async def set_prototype(
    session: AsyncSession, study_id: int, figma_url: str | None, screens: list[dict]
) -> Prototype:
    links = [
        {"from": s["id"], "text": e["text"], "to": e["to"]}
        for s in screens
        for e in s["elements"]
        if e.get("to")
    ]
    obj = Prototype(study_id=study_id, figma_url=figma_url, screens_json=screens, links_json=links)
    return await _replace(session, Prototype, study_id, obj)


async def get_prototype(session: AsyncSession, study_id: int) -> Prototype | None:
    return await session.scalar(select(Prototype).where(Prototype.study_id == study_id))


async def set_task(
    session: AsyncSession, study_id: int, description: str, goal_screen_id: str
) -> Task:
    obj = Task(study_id=study_id, description=description, goal_screen_id=goal_screen_id)
    return await _replace(session, Task, study_id, obj)


async def get_task(session: AsyncSession, study_id: int) -> Task | None:
    return await session.scalar(select(Task).where(Task.study_id == study_id))


async def replace_questions(
    session: AsyncSession, study_id: int, questions: list[dict]
) -> list[Question]:
    await session.execute(delete(Question).where(Question.study_id == study_id))
    rows = [Question(study_id=study_id, **q) for q in questions]
    session.add_all(rows)
    await session.commit()
    return rows


async def list_questions(session: AsyncSession, study_id: int) -> list[Question]:
    query = select(Question).where(Question.study_id == study_id).order_by(Question.id)
    return list(await session.scalars(query))


async def replace_personas(
    session: AsyncSession, study_id: int, attributes: list[dict]
) -> list[Persona]:
    """패널을 다시 뽑으면 이전 패널을 지운다. 이전 Ask 응답도 함께 지워진다(FK CASCADE)."""
    await session.execute(delete(Persona).where(Persona.study_id == study_id))
    rows = [Persona(study_id=study_id, attributes_json=a) for a in attributes]
    session.add_all(rows)
    await session.commit()
    return rows


async def list_personas(session: AsyncSession, study_id: int) -> list[Persona]:
    query = select(Persona).where(Persona.study_id == study_id).order_by(Persona.id)
    return list(await session.scalars(query))
