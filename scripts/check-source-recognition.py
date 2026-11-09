"""Local HTTP check: source inspection metadata and persistence. No model or real persona transmission."""
import asyncio,base64,json,secrets,sys
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'backend'))
import httpx
from sqlalchemy import select,delete
from app.core.db import SessionLocal,engine
from app.models import User
created=[];checks={}
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
    with httpx.Client(base_url='http://127.0.0.1:5173/api',headers={'X-Requested-With':'PersonaLab','Origin':'http://127.0.0.1:5173'},timeout=40) as c:
        cap=request(c,'GET','/capabilities');assert not cap['persona_transmission_allowed']
        count=cap['library_count'];email=f'source-recognition-check-{secrets.token_hex(8)}@example.com';password=secrets.token_urlsafe(20)
        user=request(c,'POST','/auth/register',{'email':email,'password':password},201);created.append((user['id'],email))
        files=[{'path':name,'data':base64.b64encode(content.encode()).decode()} for name,content in [('index.html','<html><meta name="viewport" content="width=device-width,initial-scale=1"><title>App prototype check</title><body><header><nav><a href="done.html">Continue</a></nav></header><main><h1>Start</h1><input aria-label="Name"><button>Next</button></main></body></html>'),('done.html','<html><title>Finished</title><body><h1>Finished</h1></body></html>')]]
        saved=[]
        for kind in ['ios','android']:
            sid=request(c,'POST','/studies',{'name':f'{kind} HTML verification'},201)['id']
            w=request(c,'POST',f'/studies/{sid}/sources/html',{'product_kind':kind,'viewport':'desktop','entry':'index.html','files':files})
            assert w['scope']['product_kind']==kind and w['scope']['viewport']=='mobile' and w['source']['kind']=='html'
            assert w['source']['preview'].startswith('data:image/jpeg;base64,') and w['screens']
            inspection=w['source']['inspection'];assert inspection['viewport']=={'width':390,'height':844} and inspection['element_count']==3
            assert inspection['headings']==[{'level':1,'text':'Start'}] and inspection['html_documents']==['index.html','done.html']
            assert {x['role'] for x in inspection['landmarks']}=={'banner','navigation','main'}
            assert w['source']['observed_screen']['elements'][0]['href']=='/done.html'
            failed=c.post(f'/studies/{sid}/sources/html',json={'product_kind':kind,'entry':'missing.html','files':files});assert failed.status_code==422
            assert request(c,'GET',f'/studies/{sid}/workflow')['source']['inspection']==inspection
            checks[f'{kind}_recognized_structure_and_failed_reconnect_preserves_source']=True
            scope={**w['scope'],'goal_url':'/done.html','viewport':'desktop'}
            w=request(c,'POST',f'/studies/{sid}/workflow',{'scope':scope});assert w['scope']['viewport']=='mobile'
            child=request(c,'POST',f'/studies/{sid}/revisions',{},201)['id']
            copied=request(c,'GET',f'/studies/{child}/workflow');assert copied['scope']==w['scope'] and copied['source']['inspection']==inspection
            saved.append((sid,kind,inspection));checks[f'{kind}_html_mobile_and_revision']=True
        request(c,'POST','/auth/logout',{});request(c,'POST','/auth/login',{'email':email,'password':password})
        for sid,kind,inspection in saved:
            w=request(c,'GET',f'/studies/{sid}/workflow');assert w['scope']['product_kind']==kind and w['scope']['viewport']=='mobile' and w['source']['kind']=='html' and w['source']['inspection']==inspection
        checks['relogin_preserves_platform_and_source']=True
        assert request(c,'GET','/capabilities')['library_count']==count
        checks['original_personas_unchanged']=count;checks['persona_transmission_allowed']=False;checks['paid_model_calls']=0
finally:
    asyncio.run(cleanup());checks['temporary_account_removed']=True
    (root/'scratch/source-recognition/HTTP_CHECK.json').write_text(json.dumps(checks,indent=2),encoding='utf-8')
print(json.dumps(checks,indent=2))
