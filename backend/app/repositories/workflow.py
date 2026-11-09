from copy import deepcopy
from uuid import uuid4
from sqlalchemy import select, func
from app.models import Study, Product, Prototype, Task, Persona, Run, LocalDemoStudy
from app.models.workflow import StudyWorkflow, BrowserEvidence, RunControl

def copied_source(value,needs_reconnect=False):
    source=deepcopy(value)
    # 수정 회차: 고친 화면을 다시 받아야 하므로 '다시 연결 필요' 표시를 달아 둔다(연결하면 사라진다)
    if needs_reconnect and source.get('kind') in ('web','html'):source['needs_reconnect']=True
    if source.get('exploration'):
        job=source['exploration'];job['id']=uuid4().hex;job.pop('worker_token',None)
        if job['status'] in ('queued','running','pausing'):job.update(status='paused',reason='copied')
    return source

async def get(session, study_id):
    return await session.get(StudyWorkflow,study_id)

async def run_meta(session, study_id, run_id):
    row=await get(session,study_id)
    return ((row.source_json or {}).get('run_meta') or {}).get(str(run_id)) if row else None

async def save_run_meta(session, study_id, run_id, meta):
    """실행 조건·사용량을 워크플로 source_json의 run_meta에 남긴다(DB 구조 변경 없이)."""
    row=await ensure(session,study_id)
    source=dict(row.source_json or {});metas=dict(source.get('run_meta') or {});metas[str(run_id)]=meta
    source['run_meta']=metas;row.source_json=source
    await session.commit()

async def ensure(session, study_id):
    row=await get(session,study_id)
    if row is None:
        row=StudyWorkflow(study_id=study_id,root_study_id=study_id,revision=1,source_json={},scope_json={})
        session.add(row)
        await session.flush()
    return row

async def save(session, study_id, source=None, scope=None):
    row=await ensure(session,study_id)
    if source is not None: row.source_json=deepcopy(source)
    if scope is not None: row.scope_json=deepcopy(scope)
    await session.commit()
    return row

async def revisions(session, study_id):
    current=await get(session,study_id)
    root=current.root_study_id if current else study_id
    rows=list((await session.execute(select(Study,StudyWorkflow).join(StudyWorkflow,StudyWorkflow.study_id==Study.id).where(StudyWorkflow.root_study_id==root).order_by(StudyWorkflow.revision.desc()))).all())
    if not rows:
        return [(await session.get(Study,study_id),None)]
    return rows

BLANK_KEEP=('product_kind','viewport','product_id','test_title')

def blank_scope(scope,note):
    """대상 사용자·참여 구성·탐색 범위는 비우고, 같은 앱·웹임을 나타내는 값만 남긴다."""
    from app.schemas.workflow import ScopeIn
    fresh=ScopeIn().model_dump(mode='json')
    fresh.update({k:scope[k] for k in BLANK_KEEP if k in scope})
    fresh['round_note']=note
    return fresh

async def create_revision(session, study, note='', carry=True):
    current=await get(session,study.id)
    root=current.root_study_id if current else study.id
    await session.scalar(select(Study).where(Study.id==root).with_for_update())
    current=await ensure(session,study.id)
    n=(await session.scalar(select(func.max(StudyWorkflow.revision)).where(StudyWorkflow.root_study_id==root)))+1
    new=Study(user_id=study.user_id,name=study.name,status='draft')
    session.add(new);await session.flush()
    browser=(current.source_json or {}).get('kind') in ('web','html')
    # 비우고 시작하는 웹·HTML 회차의 탐색 과제는 탐색 범위를 저장할 때 다시 만들어진다
    copied=[(Product,['description','features_json','price']),(Prototype,['figma_url','screens_json','links_json'])]
    if carry or not browser:copied.append((Task,['description','goal_screen_id']))
    for cls, fields in copied:
        old=await session.scalar(select(cls).where(cls.study_id==study.id))
        if old: session.add(cls(study_id=new.id,**{f:deepcopy(getattr(old,f)) for f in fields}))
    if carry:
        for old in await session.scalars(select(Persona).where(Persona.study_id==study.id)):
            session.add(Persona(study_id=new.id,attributes_json=deepcopy(old.attributes_json)))
    scope=({**deepcopy(current.scope_json),'round_note':note.strip()} if carry else blank_scope(current.scope_json or {},note.strip()))
    session.add(StudyWorkflow(study_id=new.id,root_study_id=root,revision=n,source_json=copied_source(current.source_json,True),scope_json=scope))
    if await session.get(LocalDemoStudy,study.id): session.add(LocalDemoStudy(study_id=new.id))
    await session.commit()
    return new

async def runs(session, study_id):
    return list(await session.scalars(select(Run).where(Run.study_id==study_id).order_by(Run.id.desc())))

async def evidence(session,run_id,persona_id=None):
    q=select(BrowserEvidence).where(BrowserEvidence.run_id==run_id)
    if persona_id is not None:q=q.where(BrowserEvidence.persona_id==persona_id)
    return list(await session.scalars(q.order_by(BrowserEvidence.id)))

async def add_evidence(session,run_id,persona_id,turn,screen,image,action):
    session.add(BrowserEvidence(run_id=run_id,persona_id=persona_id,turn=turn,screen_json=screen,image_data=image,action_json=action))
    await session.commit()

async def control(session,run_id):
    return await session.scalar(select(RunControl).where(RunControl.run_id==run_id).execution_options(populate_existing=True))

async def set_control(session,run_id,cancel=None,error=None):
    row=await control(session,run_id)
    if row is None: row=RunControl(run_id=run_id);session.add(row)
    if cancel is not None:row.cancel_requested=cancel
    if error is not None:row.error=error
    await session.commit()
    return row
