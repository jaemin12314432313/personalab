"""연결 단계의 빠른 문서·화면 수집. 조작·모델 호출·사용성 평가는 수행하지 않는다."""
import asyncio
import base64
from copy import deepcopy
from datetime import datetime, timezone
from time import monotonic
from urllib.parse import urljoin, urlsplit, unquote
from app.core import config as c
from app.services import browser, site_map

# 메뉴에 직접 연결된 주소를 먼저 수집하고 하단의 반복 링크는 뒤로 둔다.
READ_SNAPSHOT = """(limit) => {
 const data=("""+site_map.READ_PAGE+""")(limit);
 const anchors=[...document.querySelectorAll('a[href]')].slice(0,limit);
 data.links=data.links.map((link,i)=>({...link,menu:Boolean(anchors[i]?.closest('nav,[role=navigation],header,aside'))})).sort((a,b)=>Number(b.menu)-Number(a.menu));
 return data;
}"""
READY = """() => {
 const body=document.body;if(!body||Number(getComputedStyle(body).opacity)<.98)return false;
 return [...document.images].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight;}).every(e=>e.complete);
}"""

async def collect(source,viewport='desktop',*,checkpoint=None,on_progress=None,should_pause=None,max_pages=None,timeout=None):
 previous=deepcopy(checkpoint or {}) if (checkpoint or {}).get('mode')=='snapshot' else {}
 pages={p['url']:p for p in previous.get('pages',[])};edges=previous.get('edges',[])
 excluded=set();blocked=[];overflow=previous.get('discovery_limited',False)
 page_limit=max_pages or c.SNAPSHOT_PAGE_STEP;time_limit=timeout or c.SNAPSHOT_TIME_STEP
 started=monotonic();timed_out=False;paused=False;error=None;save_lock=asyncio.Lock()
 def result():
  return {'mode':'snapshot','pages':list(pages.values()),'edges':edges,'excluded_count':previous.get('excluded_count',0)+len(excluded),
   'limit_reached':overflow or any(p['state']=='pending' for p in pages.values()),'discovery_limited':overflow,'max_pages':page_limit,
   'max_discovered':c.EXPLORATION_MAX_DISCOVERED,'scanned_at':datetime.now(timezone.utc).isoformat(),
   'blocked_request_count':len(blocked),'time_limited':timed_out,'paused':paused,'error':error,
   'collection_seconds':round(monotonic()-started,2),'concurrency':c.SNAPSHOT_CONCURRENCY,'clicks':0}
 async def publish():
  if on_progress:
   async with save_lock:await on_progress(deepcopy(result()))
 try:
  async with asyncio.timeout(time_limit):
   async with browser.open_page(source,viewport,navigation_timeout_ms=c.SNAPSHOT_NAVIGATION_MS) as (initial_page,base,restricted):
    blocked=restricted;initial=initial_page.url
    def add(url,label='',parent=None):
     nonlocal overflow
     try:
      u=urlsplit(url)
      if u.scheme not in ('http','https') or u.username or u.password or browser.origin(url)!=base or site_map.UNSAFE_PATH.search(unquote(u.path+'?'+u.query)) or site_map.ASSET_PATH.search(u.path):
       excluded.add(url);return
      key=site_map.public_url(site_map.page_key(url),source)
     except ValueError:return
     if parent is not None and len(edges)<c.EXPLORATION_MAX_DISCOVERED*4:
      edge={'from':site_map.public_url(parent,source),'to':key,'label':label[:160]}
      if edge not in edges:edges.append(edge)
     if key in pages:return
     if len(pages)>=c.EXPLORATION_MAX_DISCOVERED:overflow=True;return
     pages[key]={'url':key,'label':label or key,'state':'pending','issues':[]}
    add(initial,source.get('title',''))
    if source['kind']=='html':
     for file in source.get('files',[]):
      if file['path'].lower().endswith(('.html','.htm')):add(urljoin(initial,'/'+file['path']),file['path'])
    initial_key=site_map.public_url(initial,source)
    async def capture(page,key,row,already_open=False):
     target=urljoin(initial,key) if source['kind']=='html' else key
     try:
      if not already_open:
       response=await page.goto(target,wait_until='domcontentloaded',timeout=c.SNAPSHOT_NAVIGATION_MS)
       if response and response.status>=400:
        row.update(state='error',error=f'HTTP {response.status}');return
      # 기다림은 짧게 제한한다. 전체 네트워크 완료나 클릭 결과는 기다리지 않는다.
      await page.wait_for_timeout(100)
      try:await page.wait_for_function(READY,timeout=c.SNAPSHOT_READY_MS);ready=True
      except Exception:ready=False
      data=await page.evaluate(READ_SNAPSHOT,c.EXPLORATION_MAX_DISCOVERED)
      row.update(state='loaded',capture_ready=ready,label=data['title'] or row['label'],issues=data['issues'],controls=data['controls'],final_url=site_map.public_url(page.url,source))
      if data['links_truncated']:
       nonlocal overflow
       overflow=True
      for link in data['links']:
       if browser.SENSITIVE.search(link['label']):excluded.add(link['url']);continue
       add(link['url'],link['label'],page.url)
      try:
       image=source.get('preview') if already_open and source.get('inspection',{}).get('capture_ready') is True and source.get('viewport',viewport)==viewport else None
       row['image']=image or 'data:image/jpeg;base64,'+base64.b64encode(await page.screenshot(type='jpeg',quality=45,animations='disabled',timeout=c.SNAPSHOT_CAPTURE_MS)).decode()
       row['captured_at']=datetime.now(timezone.utc).isoformat();row.pop('capture_error',None)
      except Exception:row['capture_error']='화면 이미지를 저장하지 못했어요.'
     except asyncio.CancelledError:
      # 남은 주소는 pending으로 유지하고, 읽은 문서/캡처는 그대로 보존한다.
      raise
     except Exception:row.update(state='error',error='페이지 응답 지연 또는 접근 제한')
     finally:
      if not asyncio.current_task().cancelling():await publish()
    await publish()
    attempted=sum(p['state']!='pending' for p in pages.values())
    if pages[initial_key]['state']=='pending' and attempted<page_limit:
     await capture(initial_page,initial_key,pages[initial_key],True);attempted+=1
    tabs=[initial_page]
    for _ in range(c.SNAPSHOT_CONCURRENCY-1):
     tab=await initial_page.context.new_page()
     tab.on('dialog',lambda dialog:dialog.dismiss());tab.on('popup',lambda popup:popup.close());tabs.append(tab)
    while attempted<page_limit:
     if should_pause and await should_pause():paused=True;break
     pending=[(key,row) for key,row in pages.items() if row['state']=='pending'][:min(len(tabs),page_limit-attempted)]
     if not pending:break
     attempted+=len(pending)
     await asyncio.gather(*(capture(tabs[i],key,row) for i,(key,row) in enumerate(pending)))
 except TimeoutError:timed_out=True
 except asyncio.CancelledError:raise
 except Exception:error='일부 화면을 불러오지 못했어요. 저장된 이미지와 주소를 확인하세요.'
 await publish()
 return result()
