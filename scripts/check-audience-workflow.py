"""실제 로컬 API의 사용자 구성·앱 시안 저장 검증. 유료 호출 없음."""
import asyncio,base64,json,secrets,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import httpx
from sqlalchemy import select,delete
from app.core.db import SessionLocal,engine
from app.models import User
root=Path(__file__).resolve().parents[1];created=[];checks={}
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
        cap=request(c,'GET','/capabilities');assert cap['audience_builder_ready'] and not cap['persona_transmission_allowed']
        before=cap['library_count'];email=f'audience-check-{secrets.token_hex(8)}@example.com';password=secrets.token_urlsafe(20)
        account=request(c,'POST','/auth/register',{'email':email,'password':password},201);created.append((account['id'],email))
        facets=request(c,'GET','/persona-library/audience/facets');assert facets['total']==before and facets['jobs'] and facets['digital']
        found=request(c,'POST','/persona-library/audience/search',{'filters':{},'limit':2});ids=[p['id'] for p in found['items']];assert len(ids)==2
        checks['catalog_conditions_from_stored_profiles']=True;checks['unique_candidates_available']=found['total']
        sid=request(c,'POST','/studies',{'name':'HTTP 앱 설정 점검'},201)['id']
        image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6B9sAAAAASUVORK5CYII='
        screens=[{'id':'A','label':'가상 앱 첫 화면','description':'다음 버튼','image':image,'elements':[{'text':'다음','to':'B'}]},{'id':'B','label':'완료','elements':[]}]
        request(c,'POST',f'/studies/{sid}/prototype/manual',{'screens':screens})
        audience={'description':'연결 검증을 위한 대상 사용자','context':'휴대폰에서 화면 이동','filters':{},'entry_ids':ids}
        people=request(c,'POST',f'/studies/{sid}/panel/select',{'audience':audience})
        assert [p['attributes']['source']['library_entry_id'] for p in people]==ids
        w=request(c,'GET',f'/studies/{sid}/workflow');w['scope']['product_kind']='android'
        request(c,'POST',f'/studies/{sid}/workflow',{'scope':w['scope']})
        request(c,'POST','/auth/logout',{});request(c,'POST','/auth/login',{'email':email,'password':password})
        stored=request(c,'GET',f'/studies/{sid}/workflow')['scope'];assert stored['product_kind']=='android' and stored['viewport']=='mobile' and stored['audience']['entry_ids']==ids
        assert request(c,'GET',f'/studies/{sid}')['prototype']['screens'][0]['image']==image
        child=request(c,'POST',f'/studies/{sid}/revisions',{},201)['id']
        assert request(c,'GET',f'/studies/{child}/workflow')['scope']==stored
        checks['explicit_selection_saved']=True;checks['relogin_and_revision_preserve_app_audience_and_image']=True
        assert request(c,'GET','/capabilities')['library_count']==before
        checks['original_personas_unchanged']=before;checks['paid_model_calls']=0
finally:
    asyncio.run(cleanup());checks['temporary_account_removed']=True
    (root/'scratch/audience-workflow/HTTP_CHECK.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(checks,ensure_ascii=False,indent=2))
