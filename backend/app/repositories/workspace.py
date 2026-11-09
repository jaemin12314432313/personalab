"""실행 입력과 분리한 논리 테스트 관리. 호출자는 소유권을 먼저 확인한다."""

from copy import deepcopy

from sqlalchemy import delete, or_, select

from app.models import (
    LocalDemoStudy,
    Persona,
    Product,
    Prototype,
    Question,
    Run,
    Study,
    StudyWorkflow,
    Task,
)
from app.models.workspace import WorkspacePreference
from app.repositories.workflow import copied_source


async def root_id(session, study_id):
    meta = await session.get(StudyWorkflow, study_id)
    return meta.root_study_id if meta else study_id


async def state(session, study_id):
    root = await root_id(session, study_id)
    return await session.scalar(
        select(WorkspacePreference)
        .where(WorkspacePreference.root_study_id == root)
        .execution_options(populate_existing=True)
    )


async def is_trashed(session, study_id):
    value = await state(session, study_id)
    return bool(value and value.trashed)


async def lock_group(session, study):
    root = await root_id(session, study.id)
    parent = await session.scalar(
        select(Study).where(Study.id == root, Study.user_id == study.user_id).with_for_update()
    )
    if parent is None:
        raise LookupError("테스트가 없습니다.")
    ids = select(StudyWorkflow.study_id).where(StudyWorkflow.root_study_id == root)
    rows = list(
        await session.scalars(
            select(Study)
            .where(or_(Study.id == root, Study.id.in_(ids)), Study.user_id == study.user_id)
            .order_by(Study.id)
            .with_for_update()
        )
    )
    return root, rows


async def active(session, ids):
    return (
        await session.scalar(
            select(Run.id)
            .where(Run.study_id.in_(ids), Run.status.in_(["pending", "running"]))
            .limit(1)
        )
        is not None
    )


async def duplicate(session, study, name):
    new = Study(user_id=study.user_id, name=name, status="draft")
    session.add(new)
    await session.flush()
    for cls, fields in [
        (Product, ["description", "features_json", "price"]),
        (Prototype, ["figma_url", "screens_json", "links_json"]),
        (Task, ["description", "goal_screen_id"]),
    ]:
        old = await session.scalar(select(cls).where(cls.study_id == study.id))
        if old:
            session.add(cls(study_id=new.id, **{f: deepcopy(getattr(old, f)) for f in fields}))
    for cls, fields in [(Persona, ["attributes_json"]), (Question, ["code", "type", "text"])]:
        for old in await session.scalars(select(cls).where(cls.study_id == study.id)):
            session.add(cls(study_id=new.id, **{f: deepcopy(getattr(old, f)) for f in fields}))
    meta = await session.get(StudyWorkflow, study.id)
    session.add(
        StudyWorkflow(
            study_id=new.id,
            root_study_id=new.id,
            revision=1,
            source_json=copied_source(meta.source_json) if meta else {},
            scope_json=deepcopy(meta.scope_json) if meta else {},
        )
    )
    session.add(
        WorkspacePreference(root_study_id=new.id, display_name=name, archived=False, trashed=False)
    )
    if await session.get(LocalDemoStudy, study.id):
        session.add(LocalDemoStudy(study_id=new.id))
    await session.commit()
    return new.id


async def manage(session, study, body):
    root, rows = await lock_group(session, study)
    ids = [s.id for s in rows]
    pref = await state(session, root)
    if pref is None:
        pref = WorkspacePreference(root_study_id=root, archived=False, trashed=False)
        session.add(pref)
    if body.action != "rename" and await active(session, ids):
        raise RuntimeError(
            "실행 중인 회차가 있습니다. 실행 화면에서 취소하거나 완료된 뒤 다시 시도하세요."
        )
    if pref.trashed and body.action not in ("restore", "delete"):
        raise RuntimeError("휴지통에서 복원한 뒤 관리할 수 있습니다.")
    display = pref.display_name or rows[-1].name
    if body.action == "duplicate":
        new_id = await duplicate(session, study, (display[:195] + " 복사본"))
        return root, ids, pref, False, new_id
    if body.action == "rename":
        if not body.name:
            raise ValueError("이름을 입력하세요.")
        pref.display_name = body.name
    elif body.action == "delete":
        if not pref.trashed:
            raise RuntimeError("먼저 휴지통으로 이동하세요.")
        if body.confirmation != display:
            raise ValueError("삭제할 테스트 이름을 정확히 입력하세요.")
        await session.execute(
            delete(Study).where(Study.id.in_(ids), Study.user_id == study.user_id)
        )
        await session.commit()
        return root, ids, None, True, None
    elif body.action in ("archive", "unarchive"):
        pref.archived = body.action == "archive"
    elif body.action == "trash":
        pref.trashed = True
    elif body.action == "restore":
        pref.trashed = False
        pref.archived = False
    await session.commit()
    return root, ids, pref, False, None


async def empty_trash(session, user_id):
    """휴지통에 있는 테스트(회차 묶음)를 모두 영구 삭제한다. 실행 중인 묶음은 건너뛴다."""
    roots = list(
        await session.scalars(
            select(WorkspacePreference.root_study_id)
            .join(Study, Study.id == WorkspacePreference.root_study_id)
            .where(WorkspacePreference.trashed.is_(True), Study.user_id == user_id)
        )
    )
    deleted_ids = []
    deleted = skipped = 0
    for root in roots:
        parent = await session.get(Study, root)
        if parent is None or parent.user_id != user_id:
            continue
        _, rows = await lock_group(session, parent)
        ids = [r.id for r in rows]
        if await active(session, ids):
            skipped += 1
            await session.rollback()
            continue
        await session.execute(delete(Study).where(Study.id.in_(ids), Study.user_id == user_id))
        await session.commit()
        deleted += 1
        deleted_ids.extend(ids)
    return deleted, skipped, deleted_ids
