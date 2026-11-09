import base64
import pytest
from app.services import browser, exploration
from app.repositories import exploration as repo, study as study_repo
from app.models import Persona
from app.schemas.study import PersonaOut
from app.schemas.persona_library import LibraryPersonaOut,LibraryPanelOut
from tests.test_exploration_jobs import client,connected

async def test_preview_recapture_keeps_working_checkpoint_and_job(client,session):
 sid,value=await connected(client);jid=value['source']['exploration']['id']
 await repo.claim(session,sid,jid,'worker')
 await repo.update(session,sid,jid,'worker',checkpoint={'queue':['PRIVATE_WORKING_PATH']})
 before=await repo.snapshot(session,sid)
 response=await client.post(f'/studies/{sid}/sources/preview',json={'job_id':jid})
 assert response.status_code==200,response.text
 source=response.json()['source'];assert source['preview'].startswith('data:image/jpeg') and source['inspection']['capture_ready']
 assert source['exploration']['id']==jid and source['exploration']['version']==before['exploration']['version']
 after=await repo.snapshot(session,sid);assert after['_exploration_checkpoint']==before['_exploration_checkpoint']
 assert 'PRIVATE_WORKING_PATH' not in response.text
 assert (await client.post(f'/studies/{sid}/sources/preview',json={'job_id':'old'})).status_code==409

async def test_scope_review_requires_stopped_work_and_only_applies_to_that_job(client,session):
 sid,value=await connected(client);jid=value['source']['exploration']['id']
 assert (await client.post(f'/studies/{sid}/exploration/review',json={'job_id':jid})).status_code==409
 await client.post(f'/studies/{sid}/exploration',json={'action':'pause'})
 before=await repo.snapshot(session,sid);assert exploration.blocking_reason(before,{})
 response=await client.post(f'/studies/{sid}/exploration/review',json={'job_id':jid})
 assert response.status_code==200
 assert exploration.blocking_reason(before,response.json()['scope']) is None
 newer=(await client.post(f'/studies/{sid}/exploration',json={'action':'start'})).json()
 assert newer['job']['id']!=jid and exploration.blocking_reason(await repo.snapshot(session,sid),response.json()['scope'])

async def test_capture_waits_for_page_entrance_fade():
 html="<meta charset='utf-8'><body style='opacity:0'><h1>Ready screen</h1><button>Open</button><script>setTimeout(()=>document.body.style.opacity=1,700)</script>"
 source={'kind':'html','entry':'index.html','files':[{'path':'index.html','data':base64.b64encode(html.encode()).decode()}]}
 value=await browser.inspect(source,'desktop')
 assert value['inspection']['capture_ready'] and value['preview'].startswith('data:image/jpeg')

RAW={'profile':{'age':35,'sex':'여','region':'서울','job_group':'사무·관리','income':987654,'address':'PRIVATE_ADDRESS'},'card_text':'PRIVATE_ORIGINAL_CARD','traits':{'digital':'높음','privacy':4,'raw_score':987654},'source':{'donor_pid':'PRIVATE_DONOR','nvidia_uuid':'PRIVATE_UUID','match_level':2,'persona_id':'PRIVATE_PROVIDER_ID','library_entry_id':123,'library_panel_id':1}}

def test_projection_hides_raw_values_across_response_models_and_preserves_selection_keys():
 outputs=[PersonaOut(id=8,attributes=RAW).model_dump_json(),LibraryPersonaOut(id=123,panel_id=1,source_persona_id='PRIVATE_PROVIDER_ID',profile_hash='PRIVATE_HASH',attributes=RAW).model_dump_json(),LibraryPanelOut(id=1,panel_key='demo',version_hash='PRIVATE_HASH',source_commit='PRIVATE_COMMIT',metadata={'donor_pid':'PRIVATE_DONOR'},count=1).model_dump_json()]
 for output in outputs:
  for private in ['PRIVATE_','987654','raw_score','match_level','income']:assert private not in output
 assert PersonaOut(id=8,attributes=RAW).model_dump()['attributes']['source']['library_entry_id']==123
 assert RAW['card_text']=='PRIVATE_ORIGINAL_CARD'

async def test_customer_apis_hide_raw_card_but_engine_database_keeps_it(client,session):
 sid,value=await connected(client)
 rows=await study_repo.replace_personas(session,sid,[RAW]);pid=rows[0].id
 response=await client.get(f'/studies/{sid}')
 assert response.status_code==200 and 'PRIVATE_' not in response.text
 response=await client.get(f'/studies/{sid}/personas/{pid}/prompt')
 assert response.status_code==200 and 'PRIVATE_' not in response.text and response.json()['system']==''
 raw=(await session.get(Persona,pid)).attributes_json
 assert raw['card_text']=='PRIVATE_ORIGINAL_CARD' and raw['source']['donor_pid']=='PRIVATE_DONOR'
