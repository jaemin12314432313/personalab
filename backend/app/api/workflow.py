import base64
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import current_user_id
from app.api.studies import owned_study, editable_study
from app.core.db import get_session
from app.core.config import SITE_DEFAULT_MAX_TURNS
from app.models import Study
from app.repositories import workflow as repo, study as study_repo, run as run_repo
from app.schemas.workflow import (WorkflowIn, WorkflowOut, SourceOut, WebSourceIn, HtmlSourceIn, RevisionIn, RevisionOut, EvidenceOut, ControlOut, ExplorationIn, ExplorationOut, CaptureRefreshIn, ExplorationReviewIn)
from app.schemas.study import StudyOut
from app.services import browser, site_map, exploration
from app.repositories import exploration as exploration_repo
from app.repositories import workspace as workspace_repo

router=APIRouter(tags=['workflow'])

def output(row,study_id):
    source=exploration_repo.public_source(row.source_json) if row else {}
    return WorkflowOut(study_id=study_id,root_study_id=row.root_study_id if row else study_id,revision=row.revision if row else 1,source=source,scope=row.scope_json if row else {})

@router.get('/studies/{study_id}/workflow',response_model=WorkflowOut)
async def get_workflow(study:Study=Depends(owned_study),session:AsyncSession=Depends(get_session)):
    return output(await repo.get(session,study.id),study.id)

@router.post('/studies/{study_id}/workflow',response_model=WorkflowOut)
async def save_workflow(body:WorkflowIn,study:Study=Depends(editable_study),session:AsyncSession=Depends(get_session)):
    current=await repo.get(session,study.id)
    source=current.source_json if current else {}
    scope=body.scope.model_dump()
    scope['exploration']='site' if site_map.site_mode(scope) else 'journey'
    if scope['product_kind']!='web':
        scope['viewport']='mobile'
    if scope['exploration']=='journey' and source.get('kind')=='web' and scope['goal_url']:
        try:same_origin=browser.origin(scope['goal_url'])==browser.origin(source['url'])
        except ValueError:raise HTTPException(422,'완료 지점의 웹 주소 형식을 확인하세요.') from None
        if not same_origin:raise HTTPException(422,'완료 지점은 연결한 사이트 안에 있어야 합니다.')
        if browser.normalized(scope['goal_url'])==browser.normalized(source['url']) and not scope['goal_text']:raise HTTPException(422,'시작 화면과 다른 완료 지점을 선택하세요.')
    if scope['exploration']=='journey' and source.get('kind')=='html' and scope['goal_url'] and (not scope['goal_url'].startswith('/') or scope['goal_url'].startswith('//')):raise HTTPException(422,'HTML 완료 지점은 같은 묶음 안의 경로여야 합니다.')
    row=await repo.save(session,study.id,scope=scope)
    if source.get('kind') in ('web','html'):
        task=scope['scenario'] or '화면의 목적과 주요 이동 경로를 살펴보세요.'
        if site_map.site_mode(scope):task='사이트 전반의 화면 이해, 메뉴와 이동, 정보 탐색, 입력 안내와 오류 상태를 자신의 관점에서 살펴보세요. 한 경로의 성공으로 전체 점검을 끝내지 마세요.'
        if scope['priorities']:task+=' 우선 확인할 항목: '+'; '.join(scope['priorities'])
        if scope['focus']: task+=' 특히 확인할 부분: '+scope['focus']
        if scope.get('audience',{}).get('context'):task+=' 사용 상황: '+scope['audience']['context']
        await study_repo.set_task(session,study.id,task,'__browser_goal__')
    return output(row,study.id)

async def connect(source,viewport,study,session,background,launcher,product_kind='web'):
    if product_kind!='web':viewport='mobile'
    try:observed=await browser.inspect(source,viewport)
    except browser.BrowserError as e:raise HTTPException(422,str(e)) from None
    observed['exploration']=exploration.new_job()
    # 관찰 중 실행이 시작되었다면 입력을 덮어쓰지 않는다.
    await study_repo.lock_study(session,study.id)
    if await repo.runs(session,study.id):raise HTTPException(409,'실행이 시작된 회차에는 화면을 다시 연결할 수 없습니다.')
    screens=[observed['observed_screen']]
    await study_repo.set_prototype(session,study.id,None,screens)
    suggestion=(observed.get('suggestions') or [{}])[0]
    current=await repo.get(session,study.id)
    previous_scope=current.scope_json if current else {}
    scope={**previous_scope,'max_turns':previous_scope.get('max_turns') or SITE_DEFAULT_MAX_TURNS,'product_kind':product_kind,'mode':'general','exploration':'site','priorities':[],'focus':'','viewport':viewport,'goal_url':'','goal_text':'','scenario':'','reviewed_exploration_id':''}
    if current and (current.source_json or {}).get('needs_reconnect'):
        # 수정 회차에서 화면만 다시 받는 경우: 이전 회차에 적어 둔 탐색 범위·핵심 확인 항목은 그대로 이어받는다
        for key in ('mode','exploration','priorities','focus','goal_url','goal_text','scenario','max_turns'):
            if key in previous_scope:scope[key]=previous_scope[key]
    row=await repo.save(session,study.id,source=observed,scope=scope)
    await study_repo.set_task(session,study.id,scope['scenario'] or '주요 화면을 살펴보세요.','__browser_goal__')
    background.add_task(launcher,study.id,observed['exploration']['id'])
    return SourceOut(**output(row,study.id).model_dump(),screens=screens)

def exploration_launcher():return exploration.launch

@router.post('/studies/{study_id}/sources/recapture',response_model=SourceOut)
async def recapture_source(background:BackgroundTasks,launcher=Depends(exploration_launcher),study:Study=Depends(editable_study),session:AsyncSession=Depends(get_session)):
    """수정 회차에서 이전과 같은 주소·파일로 화면을 다시 캡처한다. 고친 사이트라면 바로 반영된다."""
    saved=await exploration_repo.snapshot(session,study.id)
    if saved.get('kind') not in ('web','html'):raise HTTPException(409,'다시 캡처할 웹 또는 HTML 화면이 없습니다.')
    source={k:saved[k] for k in ('kind','url','entry','files') if k in saved}
    current=await repo.get(session,study.id)
    scope=(current.scope_json if current else {}) or {}
    return await connect(source,scope.get('viewport') or saved.get('viewport') or 'desktop',study,session,background,launcher,scope.get('product_kind') or 'web')

@router.post('/studies/{study_id}/sources/web',response_model=SourceOut)
async def web_source(body:WebSourceIn,background:BackgroundTasks,launcher=Depends(exploration_launcher),study:Study=Depends(editable_study),session:AsyncSession=Depends(get_session)):
    return await connect({'kind':'web','url':body.url},body.viewport,study,session,background,launcher,body.product_kind)

@router.post('/studies/{study_id}/sources/html',response_model=SourceOut)
async def html_source(body:HtmlSourceIn,background:BackgroundTasks,launcher=Depends(exploration_launcher),study:Study=Depends(editable_study),session:AsyncSession=Depends(get_session)):
    source={'kind':'html','entry':body.entry,'files':[f.model_dump() for f in body.files]}
    try:browser.decode_files(source['files'],source['entry'])
    except browser.BrowserError as e:raise HTTPException(422,str(e)) from None
    return await connect(source,body.viewport,study,session,background,launcher,body.product_kind)



@router.post('/studies/{study_id}/sources/preview',response_model=SourceOut)
async def refresh_preview(body:CaptureRefreshIn,study:Study=Depends(editable_study),session:AsyncSession=Depends(get_session)):
    source=await exploration_repo.snapshot(session,study.id)
    if source.get('kind') not in ('web','html'):raise HTTPException(409,'웹 또는 HTML 화면을 먼저 연결하세요.')
    if body.job_id and source.get('exploration',{}).get('id')!=body.job_id:raise HTTPException(409,'연결 정보가 바뀌었어요. 최신 화면을 다시 연결하세요.')
    try:observed=await browser.inspect(source,source.get('viewport','desktop'))
    except browser.BrowserError as exc:raise HTTPException(422,str(exc)) from None
    current=await exploration_repo.snapshot(session,study.id)
    if current.get('exploration',{}).get('id')!=source.get('exploration',{}).get('id'):raise HTTPException(409,'연결 정보가 바뀌었어요. 최신 화면을 다시 연결하세요.')
    for key in ('preview','inspection','observed_screen','title','suggestions'):current[key]=observed[key]
    screens=[observed['observed_screen']]
    await study_repo.set_prototype(session,study.id,None,screens)
    row=await repo.save(session,study.id,source=current)
    return SourceOut(**output(row,study.id).model_dump(),screens=screens)

@router.post('/studies/{study_id}/exploration/review',response_model=WorkflowOut)
async def review_exploration(body:ExplorationReviewIn,study:Study=Depends(editable_study),session:AsyncSession=Depends(get_session)):
    source=await exploration_repo.snapshot(session,study.id);job=source.get('exploration',{})
    if job.get('id')!=body.job_id:raise HTTPException(409,'연결 정보가 바뀌었어요. 최신 탐색을 확인하세요.')
    if job.get('status') not in ('paused','limited','failed','done'):raise HTTPException(409,'구조 탐색이 진행 중입니다. 완료하거나 일시정지한 뒤 확인하세요.')
    current=await repo.get(session,study.id)
    row=await repo.save(session,study.id,scope={**current.scope_json,'reviewed_exploration_id':body.job_id})
    return output(row,study.id)

@router.get('/studies/{study_id}/exploration',response_model=ExplorationOut)
async def get_exploration(after_version:int=-1,study:Study=Depends(owned_study),session:AsyncSession=Depends(get_session)):
    job,source=await exploration_repo.progress(session,study.id,after_version)
    return ExplorationOut(job=job,source=source)

@router.post('/studies/{study_id}/exploration',response_model=ExplorationOut)
async def control_exploration(body:ExplorationIn,background:BackgroundTasks,launcher=Depends(exploration_launcher),study:Study=Depends(editable_study),session:AsyncSession=Depends(get_session)):
    try:source=await exploration_repo.request(session,study.id,body.action,exploration.new_job,exploration.extend,body.job_id)
    except ValueError as exc:raise HTTPException(409,str(exc)) from None
    job=source.get('exploration')
    if job:
        if body.action=='pause':exploration.request_pause(job['id'])
        elif job['status']=='queued':background.add_task(launcher,study.id,job['id'])
    return ExplorationOut(job=exploration_repo.public_job(job) if job else None,source={k:source[k] for k in ('site_map','preflight') if k in source})

@router.get('/studies/{study_id}/revisions',response_model=list[RevisionOut])
async def revisions(study:Study=Depends(owned_study),session:AsyncSession=Depends(get_session)):
    result=[]
    for item,meta in await repo.revisions(session,study.id):
        runs=await repo.runs(session,item.id)
        result.append(RevisionOut(note=(meta.scope_json or {}).get('round_note','') if meta else '',study_id=item.id,revision=meta.revision if meta else 1,name=item.name,status=item.status,created_at=meta.created_at.isoformat() if meta else None,runs=[{'id':r.id,'mode':r.mode,'status':r.status,'progress':r.progress} for r in runs]))
    return result

@router.post('/studies/{study_id}/revisions',response_model=StudyOut,status_code=201)
async def revision(body:RevisionIn|None=None,study:Study=Depends(owned_study),session:AsyncSession=Depends(get_session)):
    await workspace_repo.lock_group(session,study)
    if await workspace_repo.is_trashed(session,study.id):raise HTTPException(404,'테스트가 없습니다.')
    if await run_repo.active_run(session,study.id):raise HTTPException(409,'현재 실행을 마치거나 취소한 뒤 수정 회차를 만드세요.')
    return await repo.create_revision(session,study,body.note if body else '',body.carry if body else True)

async def own_run(run_id,session,user_id):
    run=await run_repo.get_run(session,run_id,user_id)
    if run is None:raise HTTPException(404,'실행이 없습니다.')
    return run

@router.get('/runs/{run_id}/evidence',response_model=list[EvidenceOut])
async def evidence(run_id:int,after:int=0,session:AsyncSession=Depends(get_session),user_id:int=Depends(current_user_id)):
    await own_run(run_id,session,user_id)
    rows=await repo.evidence(session,run_id)
    return [EvidenceOut(id=r.id,persona_id=r.persona_id,turn=r.turn,screen=r.screen_json,image=f'/api/runs/{run_id}/evidence/{r.id}/image',action=r.action_json) for r in rows if r.id>after]

@router.get('/runs/{run_id}/evidence/{evidence_id}/image')
async def image(run_id:int,evidence_id:int,session:AsyncSession=Depends(get_session),user_id:int=Depends(current_user_id)):
    await own_run(run_id,session,user_id)
    row=next((r for r in await repo.evidence(session,run_id) if r.id==evidence_id),None)
    if row is None:raise HTTPException(404,'화면 근거가 없습니다.')
    return Response(base64.b64decode(row.image_data.partition(',')[2]),media_type='image/jpeg',headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'})

@router.get('/runs/{run_id}/control',response_model=ControlOut)
async def control(run_id:int,session:AsyncSession=Depends(get_session),user_id:int=Depends(current_user_id)):
    await own_run(run_id,session,user_id);row=await repo.control(session,run_id)
    return ControlOut(cancel_requested=row.cancel_requested,error=row.error) if row else ControlOut()

@router.post('/runs/{run_id}/cancel',response_model=ControlOut)
async def cancel(run_id:int,session:AsyncSession=Depends(get_session),user_id:int=Depends(current_user_id)):
    run=await own_run(run_id,session,user_id)
    if run.status not in ('pending','running'):raise HTTPException(409,'이미 종료된 실행입니다.')
    row=await repo.set_control(session,run_id,cancel=True)
    return ControlOut(cancel_requested=row.cancel_requested,error=row.error)
