import json
import pytest
from httpx import ASGITransport,AsyncClient
from sqlalchemy import select,func,delete
from app.main import app
from app.core.db import get_session
from app.core.config import settings
from app.models import Study,Run,Persona,InterviewThread,InterviewMessage,LocalDemoStudy
from app.repositories import interview as repo,run as run_repo
from app.services import interview as service
from app.services.llm import LLMError
from app.services.report import build_act

@pytest.fixture
async def client(session,monkeypatch):
    monkeypatch.setattr(settings,'local_tools_enabled',True)
    monkeypatch.setattr(settings,'allow_persona_transmission',False)
    monkeypatch.setattr(service,'call_llm',lambda *a,**k:pytest.fail('No external model calls in local checks'))
    app.dependency_overrides[get_session]=lambda:session
    try:
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test',headers={'X-Requested-With':'PersonaLab'}) as c:
            assert (await c.post('/auth/register',json={'email':'local-flow@example.com','password':'1234'})).status_code==201
            yield c
    finally:app.dependency_overrides.clear()

async def demo(client):
    response=await client.post('/local/demo',json={});assert response.status_code==201,response.text
    created=response.json();report=(await client.get(f"/runs/{created['run_id']}/report")).json()
    return created,report

async def test_local_db_flow_has_all_exit_conditions_and_explicit_source(client,session):
    created,report=await demo(client)
    assert report['source']=='local-demo'
    assert len(report['results'])==4
    assert [r['act']['end']['drop_reason'] for r in report['results']]==[None,'PRIVACY','MAX_TURNS','NAVIGATION_LOST']
    assert report['results'][0]['act']['end']['result']=='complete'
    assert report['results'][2]['act']['events']==[]
    detail=(await client.get(f"/studies/{created['study_id']}" )).json()
    assert detail['source']=='local-demo' and detail['status']=='done'
    assert all(p['attributes']['source']['local_demo'] for p in detail['personas'])
    await __import__('app.services.runner',fromlist=['execute_run']).execute_run(session,created['run_id'])
    assert (await client.get(f"/runs/{created['run_id']}/status")).json()['status']=='done'

async def test_local_tools_disabled_creates_nothing(client,session,monkeypatch):
    monkeypatch.setattr(settings,'local_tools_enabled',False)
    before=await session.scalar(select(func.count()).select_from(Study))
    assert (await client.post('/local/demo',json={})).status_code==404
    assert await session.scalar(select(func.count()).select_from(Study))==before

async def test_record_interview_is_persisted_scoped_and_does_not_change_logs(client,session):
    created,report=await demo(client);rid=created['run_id'];pid=report['results'][1]['id'];path=f'/runs/{rid}/personas/{pid}/interview'
    assert (await client.get(path)).json()['messages']==[]
    answer=await client.post(path,json={'question':'왜 멈췄나요?'})
    assert answer.status_code==201,answer.text
    message=answer.json();assert message['mode']=='records';assert '휴대폰 인증' in message['answer'];assert message['evidence'][0]['screen_id']=='LC02'
    missing=(await client.post(path,json={'question':'홈은 어땠나요?'})).json();assert '방문하지 않은 화면' in missing['answer']
    assert len((await client.get(path)).json()['messages'])==2
    assert (await client.get(path)).json()['llm_allowed'] is False
    assert (await client.post(path,json={'question':'   '})).status_code==422
    assert (await client.post(path,json={'question':'a'*501})).status_code==422
    before=(await client.get(f'/runs/{rid}/report')).json()
    assert (await client.post(path,json={'question':'왜?','mode':'llm'})).status_code==409
    assert len((await client.get(path)).json()['messages'])==2
    assert (await client.get(f'/runs/{rid}/report')).json()==before
    await client.post('/auth/logout',json={})
    await client.post('/auth/login',json={'email':'local-flow@example.com','password':'1234'})
    assert len((await client.get(path)).json()['messages'])==2
    await client.post('/auth/logout',json={})
    assert (await client.post('/auth/register',json={'email':'other-local@example.com','password':'1234'})).status_code==201
    assert (await client.get(path)).status_code==404
    assert (await client.post(path,json={'question':'이유?'})).status_code==404
    other,other_report=await demo(client)
    assert (await client.get(f"/runs/{other['run_id']}/personas/{pid}/interview")).status_code==404

async def test_run_inputs_are_locked_at_every_write_endpoint(client,session,monkeypatch):
    created,_=await demo(client);sid=created['study_id']
    for suffix,body in [('product',{'description':'수정','features':['변경'],'price':''}),('prototype/manual',{'screens':[{'id':'x','label':'화면','elements':[]}]}),('task',{'description':'수정','goal_screen_id':'LC03'}),('questions',{'questions':[{'code':'Q1','type':'text','text':'수정'}]}),('panel/generate',{'n':1})]:
        res=await client.post(f'/studies/{sid}/{suffix}',json=body);assert res.status_code==409,(suffix,res.text)
    before=await session.scalar(select(func.count()).select_from(Run))
    assert (await client.post(f'/studies/{sid}/runs',json={'mode':'act'})).status_code==409
    monkeypatch.setattr(settings,'allow_persona_transmission',True)
    assert (await client.post(f'/studies/{sid}/runs',json={'mode':'act'})).status_code==409
    assert await session.scalar(select(func.count()).select_from(Run))==before

async def test_duplicate_runs_rejected_and_interrupted_runs_marked_failed(client,session,monkeypatch):
    created,_=await demo(client);sid=created['study_id']
    await session.execute(delete(LocalDemoStudy).where(LocalDemoStudy.study_id==sid));await session.commit()
    pending=await run_repo.create_run(session,sid,'act')
    monkeypatch.setattr(settings,'allow_persona_transmission',True)
    assert (await client.post(f'/studies/{sid}/runs',json={'mode':'act'})).status_code==409
    assert await run_repo.recover_interrupted(session)==1
    assert (await client.get(f'/runs/{pending.id}/status')).json()['status']=='failed'
    assert (await client.get(f'/runs/{created["run_id"]}/status')).json()['status']=='done'

async def test_llm_prompt_only_contains_this_persons_visited_screen_objects(client,session,monkeypatch):
    created,report=await demo(client);rid=created['run_id'];pid=report['results'][1]['id'];uid=(await client.get('/auth/me')).json()['id'];ctx=await repo.context(session,rid,pid,uid)
    prompt=service.build_interview_prompt(ctx,'왜 멈췄나요?',[]);data=json.loads(prompt['contents'][0]);assert [s['id'] for s in data['visited_screens']]==['LC01','LC02']
    assert {r['log_id'] for r in data['logs']}=={r.id for r in ctx['logs']}
    await session.execute(delete(LocalDemoStudy).where(LocalDemoStudy.study_id==created['study_id']));await session.commit()
    monkeypatch.setattr(settings,'allow_persona_transmission',True);monkeypatch.setattr(settings,'llm_api_key','unit-test-key')
    def model(system,contents,schema,check):
        output={'answer':'가입 확인 단계에서 인증 이유를 찾지 못했다는 기록이 있습니다.','evidence_log_ids':[ctx['logs'][-1].id],'unverified':False}
        assert check(output) is None
        assert check({**output,'evidence_log_ids':[-999]}) is not None
        return output
    monkeypatch.setattr(service,'call_llm',model)
    path=f'/runs/{rid}/personas/{pid}/interview';result=await client.post(path,json={'question':'왜 멈췄나요?','mode':'llm'});assert result.status_code==201,result.text
    assert result.json()['mode']=='llm';assert result.json()['evidence'][0]['log_id']==ctx['logs'][-1].id
    before=await session.scalar(select(func.count()).select_from(InterviewMessage))
    def failure(*a,**k):raise LLMError('provider secret must not be returned')
    monkeypatch.setattr(service,'call_llm',failure)
    failed=await client.post(path,json={'question':'왜?','mode':'llm'});assert failed.status_code==503;assert 'secret' not in failed.text
    assert await session.scalar(select(func.count()).select_from(InterviewMessage))==before

async def test_runner_failure_persists_failed_after_transaction_rollback(client,session):
    from app.services.runner import execute_run
    created,_=await demo(client)
    pending=await run_repo.create_run(session,created['study_id'],'act')
    # 외부 전송 보류에서 실패한다. API 호출은 하지 않으며 만료된 ORM 객체도 다시 읽어 상태를 남겨야 한다.
    await execute_run(session,pending.id)
    assert (await client.get(f'/runs/{pending.id}/status')).json()['status']=='failed'
    assert (await client.get(f"/studies/{created['study_id']}" )).json()['status']=='failed'


async def test_pending_or_running_execution_cannot_open_or_send_interview_even_with_a_saved_persona_end(client,session):
    created,report=await demo(client);rid=created['run_id'];pid=report['results'][0]['id'];path=f'/runs/{rid}/personas/{pid}/interview'
    run=await session.get(Run,rid)
    for status in ('pending','running'):
        run.status=status;await session.commit()
        assert (await client.get(path)).status_code==409
        assert (await client.post(path,json={'question':'어떤 화면이었나요?'})).status_code==409
    run.status='failed';await session.commit()
    assert (await client.get(path)).status_code==200
    assert (await client.post(path,json={'question':'어떤 화면이었나요?'})).status_code==201


async def test_interview_prompt_includes_product_intro_and_target_audience(client,session):
    created,report=await demo(client);rid=created['run_id'];pid=report['results'][1]['id'];uid=(await client.get('/auth/me')).json()['id']
    sid=created['study_id']
    await repo.workflow_repo.save(session,sid,scope={'audience':{'description':'독서 습관을 만들고 싶은 직장인','context':''}})
    ctx=await repo.context(session,rid,pid,uid)
    data=json.loads(service.build_interview_prompt(ctx,'왜 멈췄나요?',[])['contents'][0])
    assert data['product_intro']                       # 제품 이름·설명이 들어간다
    assert data['target_audience']=='독서 습관을 만들고 싶은 직장인'
