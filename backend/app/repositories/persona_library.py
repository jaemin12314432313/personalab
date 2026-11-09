"""보관함은 추가만 하고, 테스트에는 독립된 스냅샷을 복사한다."""

import random
from copy import deepcopy

from sqlalchemy import delete, func, insert, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.persona_library import PersonaLibraryEntry, PersonaLibraryPanel
from app.models.run import Persona, Run
from app.models.study import Study


async def list_panels(session: AsyncSession):
    query = (
        select(PersonaLibraryPanel, func.count(PersonaLibraryEntry.id))
        .outerjoin(PersonaLibraryEntry, PersonaLibraryEntry.panel_id == PersonaLibraryPanel.id)
        .group_by(PersonaLibraryPanel.id)
        .order_by(PersonaLibraryPanel.id)
    )
    return list((await session.execute(query)).all())


async def get_panel(session: AsyncSession, panel_id: int):
    return await session.get(PersonaLibraryPanel, panel_id)


async def list_entries(session: AsyncSession, panel_id: int, limit: int = 50, offset: int = 0):
    query = (
        select(PersonaLibraryEntry)
        .where(PersonaLibraryEntry.panel_id == panel_id)
        .order_by(PersonaLibraryEntry.source_persona_id)
        .offset(offset)
        .limit(limit)
    )
    return list(await session.scalars(query))


async def entry_count(session: AsyncSession, panel_id: int) -> int:
    return await session.scalar(
        select(func.count())
        .select_from(PersonaLibraryEntry)
        .where(PersonaLibraryEntry.panel_id == panel_id)
    )


async def get_entry(session: AsyncSession, entry_id: int):
    return await session.get(PersonaLibraryEntry, entry_id)


async def store_panel(session: AsyncSession, panel: dict) -> tuple[int, bool]:
    statement = (
        pg_insert(PersonaLibraryPanel)
        .values(
            panel_key=panel["panel_key"],
            version_hash=panel["version_hash"],
            source_commit=panel["source_commit"],
            metadata_json=panel["metadata"],
        )
        .on_conflict_do_nothing(constraint="uq_library_panel_version")
        .returning(PersonaLibraryPanel.id)
    )
    panel_id = await session.scalar(statement)
    if panel_id is None:
        existing = await session.scalar(
            select(PersonaLibraryPanel).where(
                PersonaLibraryPanel.panel_key == panel["panel_key"],
                PersonaLibraryPanel.version_hash == panel["version_hash"],
            )
        )
        rows = await session.execute(
            select(PersonaLibraryEntry.source_persona_id, PersonaLibraryEntry.profile_hash).where(
                PersonaLibraryEntry.panel_id == existing.id
            )
        )
        saved = dict(rows.all())
        expected = {p["source_persona_id"]: p["profile_hash"] for p in panel["entries"]}
        if saved != expected:
            raise ValueError("이미 저장된 패널의 카드 수 또는 해시가 원본과 다릅니다.")
        return existing.id, False
    await session.execute(
        insert(PersonaLibraryEntry), [{"panel_id": panel_id, **entry} for entry in panel["entries"]]
    )
    return panel_id, True


async def copy_to_study(session: AsyncSession, study_id: int, panel_id: int, n: int, seed: int):
    # 실행 이력이 있는 테스트를 바꾸지 않는다. 카드 내용은 별도 스냅샷으로 복사한다.
    study = await session.scalar(select(Study).where(Study.id == study_id).with_for_update())
    if study is None:
        raise LookupError("테스트가 없습니다.")
    if await session.scalar(select(Run.id).where(Run.study_id == study_id).limit(1)):
        raise RuntimeError(
            "실행 기록이 있는 테스트의 페르소나는 바꿀 수 없습니다. 새 테스트를 만드세요."
        )
    panel = await get_panel(session, panel_id)
    if panel is None:
        raise LookupError("보관함 패널이 없습니다.")
    entries = list(
        await session.scalars(
            select(PersonaLibraryEntry)
            .where(PersonaLibraryEntry.panel_id == panel_id)
            .order_by(PersonaLibraryEntry.source_persona_id)
        )
    )
    if not 1 <= n <= len(entries):
        raise ValueError(f"선택한 패널에서 1~{len(entries)}명을 고를 수 있습니다.")
    selected = random.Random(seed).sample(entries, n)
    await session.execute(delete(Persona).where(Persona.study_id == study_id))
    copies = []
    for entry in selected:
        attributes = deepcopy(entry.attributes_json)
        attributes["source"].update(
            library_entry_id=entry.id, library_panel_id=panel.id, library_version=panel.version_hash
        )
        copies.append(Persona(study_id=study_id, attributes_json=attributes))
    session.add_all(copies)
    await session.flush()
    return copies
