"""로컬 프록시/API의 워크플로우 점검. 임시 계정과 자체 작성 화면만 사용한다."""
import asyncio,base64,json,secrets,sys,threading
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'backend'))
import httpx
from sqlalchemy import delete,select,func
from app.core.db import SessionLocal,engine
from app.models import User,PersonaLibraryEntry

root=Path(__file__).resolve().parents[1]
nonce=secrets.token_hex(8);created=[];checks={};fixture=None
pages={'/index.html':'<meta charset="utf-8"><title>가상 연결 점검</title><h1>시작 화면</h1><a href="done.html">완료 화면 열기</a>', '/done.html':'<meta charset="utf-8"><title>완료 화면</title><h1>점검 완료</h1>'}
class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        body=pages.get(self.path)
        if body is None:self.send_error(404);return
        self.send_response(200);self.send_header('Content-Type','text/html; charset=utf-8');self.end_headers();self.wfile.write(body.encode())
    def log_message(self,*args):pass

def expect(c,method,path,body=None,status=200):
    r=c.request(method,path,json=body)
    if r.status_code!=status:raise RuntimeError(f'{method} {path}: expected {status}, got {r.status_code}')
    return r.json()

async def cleanup():
    async with SessionLocal() as s:
        for uid,email in created:
            found=await s.scalar(select(User.id).where(User.id==uid,User.email==email))
            if found!=uid:raise RuntimeError('Temporary account identity mismatch')
            await s.execute(delete(User).where(User.id==uid,User.email==email))
        await s.commit()
        count=await s.scalar(select(func.count()).select_from(PersonaLibraryEntry))
    await engine.dispose()
    return count

try:
    for port in (8080,4173,3000):
        try:fixture=ThreadingHTTPServer(('127.0.0.1',port),Handler);break
        except OSError:continue
    if fixture is None:raise RuntimeError('No allowed fixture port available')
    worker=threading.Thread(target=fixture.serve_forever,daemon=True);worker.start()
    with httpx.Client(base_url='http://127.0.0.1:5173/api',headers={'X-Requested-With':'PersonaLab','Origin':'http://127.0.0.1:5173'},timeout=90) as c:
        cap=expect(c,'GET','/capabilities')
        assert cap['workflow_ready'] and cap['browser_ready'] and not cap['persona_transmission_allowed']
        checks['capabilities_and_card_hold']=True
        email=f'workflow-http-{nonce}@example.com';password=secrets.token_urlsafe(20)
        user=expect(c,'POST','/auth/register',{'email':email,'password':password},201);created.append((user['id'],email))
        sid=expect(c,'POST','/studies',{'name':'임시 워크플로우 점검'},201)['id']
        expect(c,'POST',f'/studies/{sid}/name',{'name':'화면 연결 점검'})
        files=[{'path':path.lstrip('/'),'data':base64.b64encode(content.encode()).decode()} for path,content in pages.items()]
        source=expect(c,'POST',f'/studies/{sid}/sources/html',{'files':files,'entry':'index.html','viewport':'mobile'})
        assert source['source']['title']=='가상 연결 점검' and source['source']['preview'].startswith('data:image/jpeg;base64,')
        assert source['scope']['goal_url']=='/done.html' and 'files' not in source['source']
        scope={**source['scope'],'focus':'안내 문구 확인'}
        expect(c,'POST',f'/studies/{sid}/workflow',{'scope':scope})
        checks['real_uvicorn_html_capture_scope']=True
        web=expect(c,'POST','/studies',{'name':'웹 주소 연결 점검'},201)['id']
        url=f'http://127.0.0.1:{fixture.server_port}/index.html'
        page=expect(c,'POST',f'/studies/{web}/sources/web',{'url':url,'viewport':'desktop'})
        assert page['source']['title']=='가상 연결 점검' and page['source']['suggestions']
        invalid={**page['scope'],'goal_url':'http://127.0.0.1:invalid/done.html'}
        expect(c,'POST',f'/studies/{web}/workflow',{'scope':invalid},422)
        checks['real_uvicorn_web_capture_and_invalid_goal']=True
        child=expect(c,'POST',f'/studies/{sid}/revisions',{},201)['id']
        meta=expect(c,'GET',f'/studies/{child}/workflow')
        assert meta['root_study_id']==sid and meta['revision']==2 and meta['scope']['focus']=='안내 문구 확인'
        assert expect(c,'GET',f'/studies/{child}')['runs']==[]
        checks['persistent_revision_with_empty_results']=True
        expect(c,'POST',f'/studies/{child}/runs',{'mode':'act'},409)
        checks['no_paid_run_or_card_transmission']=True
        expect(c,'POST','/auth/logout',{})
        expect(c,'POST','/auth/login',{'email':email,'password':password})
        assert expect(c,'GET',f'/studies/{child}/workflow')['revision']==2
        checks['session_and_round_restore']=True
        expect(c,'POST','/auth/logout',{})
        other=f'workflow-other-{nonce}@example.com';new=expect(c,'POST','/auth/register',{'email':other,'password':password},201);created.append((new['id'],other))
        expect(c,'GET',f'/studies/{sid}/workflow',status=404)
        expect(c,'POST',f'/studies/{sid}/revisions',{},404)
        checks['account_isolation']=True
finally:
    if fixture:fixture.shutdown();fixture.server_close()
    checks['temporary_accounts_removed']=True
    checks['library_count_after_cleanup']=asyncio.run(cleanup())
    out=root/'scratch/workflow-rebuild/HTTP_CHECK.json';out.parent.mkdir(parents=True,exist_ok=True);out.write_text(json.dumps(checks,ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps(checks,ensure_ascii=False,indent=2))
