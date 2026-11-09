"""로컬 HTTP·DB 전체 연결 검사. 만든 점검 계정만 정리하며 유료 모델을 호출하지 않는다."""
import asyncio,json,secrets,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import httpx
from sqlalchemy import delete,select,func
from app.core.db import SessionLocal,engine
from app.models import User,PersonaLibraryEntry

created=[]
nonce=secrets.token_hex(8)
password=secrets.token_urlsafe(20)
checks={}

def expect(client,method,path,body=None,code=200):
    response=client.request(method,path,json=body)
    if response.status_code!=code:raise RuntimeError(f'{method} {path}: expected {code}, got {response.status_code}')
    return response.json()

async def cleanup():
    async with SessionLocal() as session:
        for uid,email in created:
            row=await session.scalar(select(User).where(User.id==uid,User.email==email))
            if row is None:raise RuntimeError('Disposable account identity did not match; cleanup stopped')
            await session.execute(delete(User).where(User.id==uid,User.email==email))
        await session.commit()
        count=await session.scalar(select(func.count()).select_from(PersonaLibraryEntry))
    await engine.dispose()
    return count

try:
    with httpx.Client(base_url='http://127.0.0.1:5173/api',headers={'X-Requested-With':'PersonaLab','Origin':'http://127.0.0.1:5173'},timeout=30) as client:
        cap=expect(client,'GET','/capabilities');assert cap['local_tools_enabled'] and cap['library_count']==400
        assert cap['persona_transmission_allowed'] is False
        checks['capabilities_and_transmission_hold']=True
        email=f'local-check-{nonce}@example.com';user=expect(client,'POST','/auth/register',{'email':email,'password':password},201);created.append((user['id'],email))
        study=expect(client,'POST','/studies',{'name':'HTTP 연결 검사 · 임시'},201);sid=study['id']
        expect(client,'POST',f'/studies/{sid}/product',{'description':'HTTP 로컬 점검\n가입 흐름 연결 확인','features':['가입'],'price':''})
        screens=[{'id':'A','label':'시작','description':'가입 시작','elements':[{'text':'시작','to':'B'}]},{'id':'B','label':'홈','description':'완료','elements':[]}]
        expect(client,'POST',f'/studies/{sid}/prototype/manual',{'screens':screens})
        expect(client,'POST',f'/studies/{sid}/task',{'description':'홈으로 이동','goal_screen_id':'B'})
        panels=expect(client,'GET','/persona-library/panels')
        personas=expect(client,'POST',f'/studies/{sid}/panel/import',{'panel_id':panels[0]['id'],'n':3,'seed':42})
        assert len(personas)==3
        preview=expect(client,'GET',f'/studies/{sid}/personas/{personas[0]["id"]}/prompt');assert preview['preview_kind']=='first_screen_act_preview'
        expect(client,'POST',f'/studies/{sid}/runs',{'mode':'act'},409)
        checks['real_db_inputs_library_snapshot_and_prompt']=True
        local=expect(client,'POST','/local/demo',{},201);rid=local['run_id'];localid=local['study_id']
        report=expect(client,'GET',f'/runs/{rid}/report');assert report['source']=='local-demo' and len(report['results'])==4
        checks['all_four_exit_examples']=[r['act']['end']['drop_reason'] for r in report['results']]==[None,'PRIVACY','MAX_TURNS','NAVIGATION_LOST']
        person=report['results'][1]['id'];path=f'/runs/{rid}/personas/{person}/interview'
        message=expect(client,'POST',path,{'question':'왜 여기서 멈췄나요?'},201);assert message['mode']=='records' and message['evidence']
        expect(client,'POST',path,{'question':'왜?','mode':'llm'},409)
        expect(client,'POST',f'/studies/{localid}/product',{'description':'변경 시도','features':['변경'],'price':''},409)
        expect(client,'POST','/auth/logout',{})
        expect(client,'POST','/auth/login',{'email':email,'password':password})
        restored=expect(client,'GET',path);assert len(restored['messages'])==1 and restored['messages'][0]['id']==message['id']
        detail=expect(client,'GET',f'/studies/{localid}');assert detail['source']=='local-demo'
        checks['interview_persists_after_relogin']=True
        expect(client,'POST','/auth/logout',{})
        other=f'local-check-other-{nonce}@example.com';u=expect(client,'POST','/auth/register',{'email':other,'password':password},201);created.append((u['id'],other))
        expect(client,'GET',path,code=404);expect(client,'GET',f'/runs/{rid}/report',code=404)
        checks['owner_isolation_and_input_lock']=True
finally:
    checks['library_count_after_disposable_cleanup']=asyncio.run(cleanup())
output=Path(__file__).resolve().parents[1]/'scratch/local-backend/HTTP_CHECK.json';output.parent.mkdir(parents=True,exist_ok=True);output.write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(checks,ensure_ascii=False))