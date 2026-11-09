import base64
import json
from contextlib import asynccontextmanager
from copy import deepcopy
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.core.db import get_session
from app.core.config import settings
from app.api.workflow import exploration_launcher
from app.services import browser, preflight, site_map, exploration, snapshots
from app.repositories import exploration as repo, workflow, run as run_repo

HTML="""<meta charset='utf-8'><title>Resume fixture</title><main id='app'></main><script>
function home(){app.innerHTML='<h1>Home</h1><button onclick="one()">Open one</button><button onclick="two()">Open two</button>';}
function one(){app.innerHTML='<h2>One</h2><button onclick="home()">Back</button>';}
function two(){app.innerHTML='<h2>Two</h2>';}
home();</script>"""

def source():return {'kind':'html','entry':'index.html','viewport':'desktop','files':[{'path':'index.html','data':base64.b64encode(HTML.encode()).decode()}]}

async def test_serialized_checkpoint_continues_unvisited_branches_without_losing_records(monkeypatch):
    monkeypatch.setattr(browser,'call_llm',lambda *a,**k:pytest.fail('No paid model'))
    saved=[]
    async def progress(result,checkpoint):saved.append(json.loads(json.dumps(checkpoint)))
    first=await preflight.inspect_interactions(source(),limits={'states':2,'attempts':1,'clicks':20,'seconds':20},on_progress=progress)
    assert first['limited'] and saved[-1]['queue']
    second=await preflight.inspect_interactions(source(),checkpoint=saved[-1],limits={'states':10,'attempts':20,'clicks':60,'seconds':20},on_progress=progress)
    assert {s['id'] for s in first['states']}<={s['id'] for s in second['states']}
    assert any(s['label']=='Two' for s in second['states']),second
    assert len({s['id'] for s in second['states']})==len(second['states'])
    assert not second['limited'] and second['pending_actions']==0
    assert second['attempts']>first['attempts']

async def test_pause_keeps_queue_and_resume_does_not_restart_completed_actions():
    checkpoints=[]
    async def progress(result,checkpoint):checkpoints.append(deepcopy(checkpoint))
    async def pause():return bool(checkpoints and checkpoints[-1]['attempts']>=1)
    first=await preflight.inspect_interactions(source(),limits={'states':20,'attempts':30,'seconds':20},on_progress=progress,should_pause=pause)
    assert first['paused'] and first['pending_actions']>0
    assert checkpoints[-1]['queue']
    second=await preflight.inspect_interactions(source(),checkpoint=checkpoints[-1],limits={'states':20,'attempts':30,'seconds':20})
    assert any(s['label']=='Two' for s in second['states']) and not second['limited']

async def test_page_inventory_resumes_across_new_html_origin():
    src=source();src['files'].append({'path':'other.html','data':base64.b64encode(b'<title>Other</title><h1>Other</h1>').decode()})
    first=await site_map.discover(src,max_pages=1)
    assert first['limit_reached']
    second=await site_map.discover(src,checkpoint=first,max_pages=10)
    assert len(second['pages'])==2 and all(p['state']=='loaded' for p in second['pages'])
    assert not second['limit_reached']

@pytest.fixture
async def client(session,monkeypatch):
    monkeypatch.setattr(settings,'allow_persona_transmission',False)
    async def queued(*args):pass
    app.dependency_overrides[get_session]=lambda:session
    app.dependency_overrides[exploration_launcher]=lambda:queued
    try:
        async with AsyncClient(transport=ASGITransport(app=app),base_url='http://test',headers={'X-Requested-With':'PersonaLab'}) as client:
            assert (await client.post('/auth/register',json={'email':'exploration-jobs@example.com','password':'1234'})).status_code==201
            yield client
    finally:app.dependency_overrides.clear()

async def connected(client):
    sid=(await client.post('/studies',json={'name':'Background fixture'})).json()['id']
    src=source();response=await client.post(f'/studies/{sid}/sources/html',json={'files':src['files'],'entry':src['entry']})
    assert response.status_code==200,response.text
    return sid,response.json()

async def test_fast_connect_only_inspects_start_and_registers_job(client,monkeypatch):
    async def forbidden(*a,**k):pytest.fail('The connection request must not await a full scan')
    monkeypatch.setattr(site_map,'discover',forbidden);monkeypatch.setattr(preflight,'inspect_interactions',forbidden)
    sid,value=await connected(client)
    assert value['source']['exploration']['status']=='queued'
    assert 'preflight' not in value['source']
    assert (await client.get(f'/studies/{sid}/exploration')).json()['job']['status']=='queued'

async def test_api_pause_resume_version_and_private_checkpoint_boundary(client,session):
    sid,value=await connected(client);job=value['source']['exploration']
    assert (await client.get(f'/studies/{sid}/exploration?after_version={job["version"]}')).json()['source'] is None
    same=(await client.post(f'/studies/{sid}/exploration',json={'action':'start'})).json()
    assert same['job']['id']==job['id']
    paused=(await client.post(f'/studies/{sid}/exploration',json={'action':'pause'})).json()
    assert paused['job']['status']=='paused'
    resumed=(await client.post(f'/studies/{sid}/exploration',json={'action':'resume'})).json()
    assert resumed['job']['status']=='queued' and resumed['job']['id']==job['id']
    assert await repo.claim(session,sid,job['id'],'private-worker')
    assert await repo.claim(session,sid,job['id'],'other-worker') is None
    assert await repo.update(session,sid,job['id'],'private-worker',checkpoint={'cookies':[{'value':'PRIVATE_CHECKPOINT'}]},preflight={'states':[],'attempts':0,'clicks':0})
    for path in ('workflow','exploration'):
        response=await client.get(f'/studies/{sid}/{path}')
        assert 'PRIVATE_CHECKPOINT' not in response.text and 'private-worker' not in response.text and '_exploration_checkpoint' not in response.text
    assert (await client.post('/auth/register',json={'email':'other-exploration@example.com','password':'1234'})).status_code==201
    assert (await client.get(f'/studies/{sid}/exploration')).status_code==404
    assert (await client.post(f'/studies/{sid}/exploration',json={'action':'resume'})).status_code==404

async def test_old_worker_cannot_overwrite_reconnected_source(client,session):
    sid,value=await connected(client);old=value['source']['exploration']['id']
    assert await repo.claim(session,sid,old,'worker')
    src=source();new=(await client.post(f'/studies/{sid}/sources/html',json={'files':src['files'],'entry':src['entry']})).json()
    assert new['source']['exploration']['id']!=old
    stale=await client.post(f'/studies/{sid}/exploration',json={'action':'pause','job_id':old})
    assert stale.status_code==409 and '연결이 바뀌었어요' in stale.text
    assert not await repo.update(session,sid,old,'worker',preflight={'states':[{'id':'STALE'}]})
    current=await repo.snapshot(session,sid)
    assert current['exploration']['id']==new['source']['exploration']['id'] and 'preflight' not in current

async def test_server_restart_recovers_job_without_discarding_checkpoint(client,session):
    sid,value=await connected(client);jid=value['source']['exploration']['id']
    await repo.claim(session,sid,jid,'worker')
    await repo.update(session,sid,jid,'worker',checkpoint={'queue':['remaining']})
    await repo.interrupted(session)
    source=await repo.snapshot(session,sid)
    assert source['exploration']['status']=='paused' and source['exploration']['reason']=='server_restart'
    assert source['_exploration_checkpoint']['queue']==['remaining']
    assert 'worker_token' not in source['exploration']

async def test_worker_persists_actual_scenes_without_personas_or_model(client,session,monkeypatch):
    monkeypatch.setattr(browser,'call_llm',lambda *a,**k:pytest.fail('No model in job'))
    sid,value=await connected(client)
    @asynccontextmanager
    async def sessions():yield session
    await exploration.run_job(sid,value['source']['exploration']['id'],sessions)
    saved=await repo.snapshot(session,sid)
    assert saved['exploration']['status']=='done',saved['exploration']
    assert saved['site_map']['mode']=='snapshot' and saved['site_map']['pages'][0]['image']
    assert saved['exploration']['pending_actions']==0 and saved['exploration']['states']==1
    assert saved['exploration']['clicks']==0 and 'preflight' not in saved
    assert '_exploration_checkpoint' not in saved
    public=(await client.get(f'/studies/{sid}/workflow')).json()
    assert '_exploration_checkpoint' not in public['source']

async def test_paid_run_freezes_structure_and_refuses_resume(client,session):
    sid,value=await connected(client);jid=value['source']['exploration']['id']
    await repo.claim(session,sid,jid,'worker')
    await run_repo.create_run(session,sid,'act')
    assert not await repo.update(session,sid,jid,'worker',preflight={'states':[{'id':'LATE'}]})
    source=await repo.snapshot(session,sid)
    assert source['exploration']['status']=='paused' and 'preflight' not in source
    assert (await client.post(f'/studies/{sid}/exploration',json={'action':'resume'})).status_code==409


def test_budget_extension_is_bounded_and_copy_never_inherits_a_running_worker():
    b=exploration.budget()
    for _ in range(100):
        try:b=exploration.extend(b)
        except ValueError:break
    assert b['states']<=1000 and b['clicks']<=6000
    with pytest.raises(ValueError):exploration.extend(b)
    src={'exploration':{**exploration.new_job(),'status':'running','worker_token':'private'}}
    copied=workflow.copied_source(src)
    assert copied['exploration']['id']!=src['exploration']['id']
    assert copied['exploration']['status']=='paused' and 'worker_token' not in copied['exploration']


def test_checkpoint_shares_path_prefixes_and_does_not_duplicate_public_images():
    prefix=[{'text':'Start','kind':'button'},{'text':'Next','kind':'button'}]
    checkpoint={'states':[{'id':'s1','image':'PUBLIC_IMAGE'}],'queue':[['s1',prefix+[{'text':'A'}]],['s1',prefix+[{'text':'B'}]]],'storage':{},'cookies':[]}
    packed=preflight.compact_checkpoint(checkpoint)
    assert 'PUBLIC_IMAGE' not in json.dumps(packed)
    assert len(packed['path_nodes'])==4
    restored=preflight.expanded_checkpoint({'states':checkpoint['states']},packed)
    assert restored['queue']==checkpoint['queue'] and restored['states']==checkpoint['states']


async def test_failed_page_is_not_counted_as_successful_structure_recognition(client,session):
    sid,value=await connected(client);jid=value['source']['exploration']['id']
    await repo.claim(session,sid,jid,'worker')
    await repo.update(session,sid,jid,'worker',site_map={'pages':[{'state':'loaded'},{'state':'error'},{'state':'pending'}]})
    job=(await repo.snapshot(session,sid))['exploration']
    assert job['pages_found']==3 and job['pages_checked']==1 and job['pages_failed']==1


async def test_resume_refuses_exhausted_hard_cap_instead_of_starting_an_empty_job(client,session):
    sid,value=await connected(client);jid=value['source']['exploration']['id']
    await repo.claim(session,sid,jid,'worker')
    await repo.update(session,sid,jid,'worker',site_map={'mode':'snapshot','pages':[{'url':str(i),'state':'loaded','image':'fixture'} for i in range(1000)]},fields={'status':'limited','budget':{**exploration.budget(),'states':1000}})
    response=await client.post(f'/studies/{sid}/exploration',json={'action':'resume'})
    assert response.status_code==409 and '다른 시작 주소' in response.text
    assert (await repo.snapshot(session,sid))['exploration']['status']=='limited'


async def test_removed_queued_job_does_not_leave_a_pause_event_in_memory(session):
    @asynccontextmanager
    async def sessions():yield session
    await exploration.run_job(2147483647,'removed-job',sessions)
    assert 'removed-job' not in exploration._stops and 'removed-job' not in exploration._stop_reasons


async def test_unconfirmed_path_resume_preserves_queue_without_inflating_unused_budget(client,session):
    sid,value=await connected(client);jid=value['source']['exploration']['id'];bounds=value['source']['exploration']['budget']
    await repo.claim(session,sid,jid,'worker')
    await repo.update(session,sid,jid,'worker',checkpoint={'queue':['remaining-unconfirmed']},preflight={'states':[{'id':'one'}],'attempts':2,'clicks':0,'pending_actions':1},fields={'status':'limited','reason':'unconfirmed_paths','elapsed_seconds':4})
    response=await client.post(f'/studies/{sid}/exploration',json={'action':'resume','job_id':jid})
    assert response.status_code==200 and response.json()['job']['status']=='queued'
    assert response.json()['job']['budget']==bounds
    saved=await repo.snapshot(session,sid)
    assert saved['_exploration_checkpoint']['queue']==['remaining-unconfirmed']


async def test_worker_finishes_snapshot_batch_without_waiting_for_all_discovered_urls(client,session,monkeypatch):
    sid,value=await connected(client)
    async def collect(*args,**kwargs):return {'mode':'snapshot','pages':[{'url':'/index.html','state':'loaded','image':'fixture'},{'url':'/later','state':'pending'}],'limit_reached':True}
    async def forbidden(*args,**kwargs):pytest.fail('No click preflight or sequential crawl')
    monkeypatch.setattr(snapshots,'collect',collect);monkeypatch.setattr(preflight,'inspect_interactions',forbidden);monkeypatch.setattr(site_map,'discover',forbidden)
    @asynccontextmanager
    async def sessions():yield session
    await exploration.run_job(sid,value['source']['exploration']['id'],sessions)
    saved=await repo.snapshot(session,sid)
    assert saved['exploration']['status']=='done' and saved['exploration']['reason']=='snapshot_ready'
    assert saved['exploration']['states']==1 and saved['exploration']['pending_actions']==0
    old_budget=saved['exploration']['budget']
    response=await client.post(f'/studies/{sid}/exploration',json={'action':'resume'})
    assert response.status_code==200 and response.json()['job']['budget']['pages']>old_budget['pages']
    assert (await repo.snapshot(session,sid))['site_map']['pages'][0]['image']=='fixture'

async def test_explicit_legacy_resume_starts_fast_collection_with_a_new_job_id(client,session):
    sid,value=await connected(client);jid=value['source']['exploration']['id']
    await repo.claim(session,sid,jid,'worker')
    await repo.update(session,sid,jid,'worker',preflight={'states':[{'id':'legacy'}]},checkpoint={'queue':['old']},fields={'mode':'legacy','status':'limited'})
    response=await client.post(f'/studies/{sid}/exploration',json={'action':'resume','job_id':jid})
    assert response.status_code==200 and response.json()['job']['id']!=jid
    assert response.json()['job']['mode']=='snapshot'
    saved=await repo.snapshot(session,sid)
    assert 'preflight' not in saved and '_exploration_checkpoint' not in saved


async def test_paused_snapshot_at_time_budget_gets_a_fresh_bounded_slice_on_resume(client,session):
    sid,value=await connected(client);jid=value['source']['exploration']['id']
    await repo.claim(session,sid,jid,'worker')
    await repo.update(session,sid,jid,'worker',fields={'status':'paused','elapsed_seconds':value['source']['exploration']['budget']['seconds']})
    response=await client.post(f'/studies/{sid}/exploration',json={'action':'resume'})
    assert response.status_code==200
    assert response.json()['job']['budget']['seconds']>value['source']['exploration']['budget']['seconds']

async def test_structure_without_any_image_is_not_reported_as_successful_collection(client,session,monkeypatch):
    sid,value=await connected(client)
    async def collect(*args,**kwargs):return {'mode':'snapshot','pages':[{'url':'/index.html','state':'loaded','capture_error':'failed'}],'limit_reached':False}
    monkeypatch.setattr(snapshots,'collect',collect)
    @asynccontextmanager
    async def sessions():yield session
    await exploration.run_job(sid,value['source']['exploration']['id'],sessions)
    saved=await repo.snapshot(session,sid)
    assert saved['exploration']['status']=='failed' and saved['exploration']['reason']=='capture_unavailable'
