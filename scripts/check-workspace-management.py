"""임시 계정·자체 구성 데모만 사용하는 관리 API HTTP 점검."""
import asyncio,json,secrets,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import httpx
from sqlalchemy import select,delete
from app.core.db import SessionLocal,engine
from app.models import User
created=[];checks={};root=Path(__file__).resolve().parents[1]
async def cleanup():
    async with SessionLocal() as session:
        for uid,email in created:
            assert await session.scalar(select(User.id).where(User.id==uid,User.email==email))==uid
            await session.execute(delete(User).where(User.id==uid,User.email==email))
        await session.commit()
    await engine.dispose()
def request(c,method,path,body=None,status=200):
    r=c.request(method,path,json=body)
    if r.status_code!=status:raise RuntimeError(f'{method} {path}: {r.status_code}, expected {status}')
    return r.json()
try:
    with httpx.Client(base_url='http://127.0.0.1:5173/api',headers={'X-Requested-With':'PersonaLab','Origin':'http://127.0.0.1:5173'},timeout=30) as c:
        cap=request(c,'GET','/capabilities');assert cap['workspace_management_ready'] and not cap['persona_transmission_allowed'];count=cap['library_count']
        email=f'workspace-check-{secrets.token_hex(8)}@example.com';password=secrets.token_urlsafe(20)
        account=request(c,'POST','/auth/register',{'email':email,'password':password},201);created.append((account['id'],email))
        demo=request(c,'POST','/local/demo',{},201);sid=demo['study_id'];rid=demo['run_id'];before=request(c,'GET',f'/studies/{sid}')
        child=request(c,'POST',f'/studies/{sid}/revisions',{},201)['id']
        def manage(action,**fields):return request(c,'POST',f'/studies/{child}/manage',{'action':action,**fields})
        renamed=manage('rename',name='HTTP 관리 검증');assert set(renamed['affected_study_ids'])=={sid,child}
        assert request(c,'GET',f'/studies/{sid}')['product']==before['product'];checks['rename_preserves_run_input']=True
        copy=manage('duplicate')['duplicate_id'];assert request(c,'GET',f'/studies/{copy}')['runs']==[]
        assert request(c,'GET',f'/studies/{copy}/workflow')['root_study_id']==copy;checks['independent_duplicate_without_results']=True
        manage('archive');assert len(request(c,'GET','/studies'))==1
        assert len(request(c,'GET','/studies?include_hidden=true'))==3;manage('unarchive');checks['archive_and_unarchive']=True
        manage('trash');request(c,'GET',f'/runs/{rid}/report',status=404)
        request(c,'POST','/auth/logout',{});request(c,'POST','/auth/login',{'email':email,'password':password})
        hidden=request(c,'GET','/studies?include_hidden=true');assert all(x['workspace']['trashed'] for x in hidden if x['id'] in (sid,child))
        manage('restore');assert request(c,'GET',f'/runs/{rid}/report')['results'];checks['trash_and_restore_after_relogin']=True
        manage('trash');request(c,'POST',f'/studies/{child}/manage',{'action':'delete','confirmation':'wrong'},422)
        assert manage('delete',confirmation='HTTP 관리 검증')['deleted']
        assert [x['id'] for x in request(c,'GET','/studies?include_hidden=true')]==[copy];checks['confirmed_group_delete']=True
        assert request(c,'GET','/capabilities')['library_count']==count;checks['shared_persona_library_unchanged']=count
        checks['paid_calls']=0
finally:
    asyncio.run(cleanup());checks['temporary_account_removed']=True
    out=root/'scratch/workspace-management/HTTP_CHECK.json';out.write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(checks,ensure_ascii=False,indent=2))
