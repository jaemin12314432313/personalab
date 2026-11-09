from copy import deepcopy

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.regions import region_name, region_options, region_terms
from app.models import Persona
from app.models.persona_library import PersonaLibraryEntry, PersonaLibraryPanel
from app.repositories import workflow
from app.schemas.audience import AudienceFacetsOut


async def catalog(session):
    return list(await session.scalars(select(PersonaLibraryEntry).order_by(PersonaLibraryEntry.id)))


def identity_keys(entry):
    source = entry.attributes_json.get("source", {})
    keys = {("hash", entry.profile_hash)}
    for field in ("nvidia_uuid", "donor_pid"):
        if source.get(field) not in (None, ""):
            keys.add((field, str(source[field])))
    return keys


def unique(rows):
    used = set()
    result = []
    for row in rows:
        keys = identity_keys(row)
        if keys & used:
            continue
        used.update(keys)
        result.append(row)
    return result


def matches(row, filters):
    a = row.attributes_json
    p = a.get("profile", {})
    age = p.get("age")
    if filters.age_min is not None and (not isinstance(age, (int, float)) or age < filters.age_min):
        return False
    if filters.age_max is not None and (not isinstance(age, (int, float)) or age > filters.age_max):
        return False
    for field, values in [("job_group", filters.jobs), ("region", filters.regions)]:
        if values and (
            region_name(p.get(field)) not in {region_name(v) for v in values}
            if field == "region"
            else p.get(field) not in values
        ):
            return False
    if filters.digital and a.get("traits", {}).get("digital") not in filters.digital:
        return False
    text = (
        a.get("card_text", "")
        + " "
        + " ".join(str(v) for v in p.values())
        + " "
        + region_terms(p.get("region"))
    ).casefold()
    return all(word in text for word in filters.query.casefold().split())


def varied_order(rows):
    # 특정 원본 패널의 첫 카드만 계속 보이지 않도록 나이 구간을 번갈아 보여준다.
    # 표본 대표성/시장 분포를 보장하는 샘플링은 아니다.
    bands = {}
    for row in rows:
        age = row.attributes_json.get("profile", {}).get("age")
        band = int(age) // 10 if isinstance(age, (int, float)) else -1
        bands.setdefault(band, []).append(row)
    result = []
    while any(bands.values()):
        for band in sorted(bands):
            if bands[band]:
                result.append(bands[band].pop(0))
    return result


async def search(session, filters):
    matching = [r for r in await catalog(session) if matches(r, filters)]
    rows = unique(matching)
    return varied_order(rows), len(matching) - len(rows)


async def facets(session):
    rows = await catalog(session)
    profiles = [r.attributes_json.get("profile", {}) for r in rows]
    ages = [p["age"] for p in profiles if isinstance(p.get("age"), int)]
    return AudienceFacetsOut(
        total=len(rows),
        jobs=sorted({p["job_group"] for p in profiles if p.get("job_group")}),
        regions=region_options(p.get("region") for p in profiles),
        digital=sorted(
            {
                r.attributes_json.get("traits", {}).get("digital")
                for r in rows
                if r.attributes_json.get("traits", {}).get("digital")
            }
        ),
        age_min=min(ages) if ages else None,
        age_max=max(ages) if ages else None,
        max_selection=settings.panel_size,
    )


async def select_for_study(session, study, audience):
    rows = list(
        await session.scalars(
            select(PersonaLibraryEntry).where(PersonaLibraryEntry.id.in_(audience.entry_ids))
        )
    )
    by_id = {r.id: r for r in rows}
    if len(by_id) != len(audience.entry_ids):
        raise ValueError("선택한 페르소나가 보관함에 없습니다. 다시 검색하세요.")
    rows = [by_id[i] for i in audience.entry_ids]
    if len(unique(rows)) != len(rows):
        raise ValueError("동일한 원천 프로필이 중복되었습니다. 다른 페르소나를 선택하세요.")
    if not all(matches(r, audience.filters) for r in rows):
        raise ValueError("현재 조건과 맞지 않는 페르소나가 있습니다. 후보를 다시 확인하세요.")
    panels = {
        p.id: p
        for p in await session.scalars(
            select(PersonaLibraryPanel).where(
                PersonaLibraryPanel.id.in_({r.panel_id for r in rows})
            )
        )
    }
    await session.execute(delete(Persona).where(Persona.study_id == study.id))
    copies = []
    for row in rows:
        attributes = deepcopy(row.attributes_json)
        attributes.setdefault("source", {}).update(
            library_entry_id=row.id,
            library_panel_id=row.panel_id,
            library_version=panels[row.panel_id].version_hash,
        )
        copies.append(Persona(study_id=study.id, attributes_json=attributes))
    session.add_all(copies)
    meta = await workflow.ensure(session, study.id)
    meta.scope_json = {**meta.scope_json, "audience": audience.model_dump()}
    await session.commit()
    return copies
