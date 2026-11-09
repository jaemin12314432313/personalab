import base64
from contextlib import asynccontextmanager
import asyncio
import pytest
from app.services import browser,snapshots


def source(count=6):
 index='<meta charset="utf-8"><title>Home</title><h1>Home</h1><nav>'+''.join(f'<a href="p{i}.html">Page {i}</a>' for i in range(count))+'</nav><button onclick="document.title=\'Clicked\'">Do not click</button>'
 files={'index.html':index,**{f'p{i}.html':f'<title>Page {i}</title><h1>Page {i}</h1>' for i in range(count)}}
 return {'kind':'html','entry':'index.html','viewport':'desktop','files':[{'path':k,'data':base64.b64encode(v.encode()).decode()} for k,v in files.items()]}

async def test_collects_real_images_and_links_without_clicking_or_models(monkeypatch):
 monkeypatch.setattr(browser,'call_llm',lambda *a,**k:pytest.fail('No model in connection stage'))
 result=await snapshots.collect(source(3))
 assert result['mode']=='snapshot' and result['clicks']==0
 assert len(result['pages'])==4 and all(p['state']=='loaded' and p['image'].startswith('data:image/jpeg;base64,') for p in result['pages'])
 assert next(p for p in result['pages'] if p['url']=='/index.html')['label']=='Home'
 assert any(e['from']=='/index.html' and e['to']=='/p2.html' for e in result['edges'])
 assert not result['limit_reached']
 assert all('127.0.0.1' not in p['url'] for p in result['pages'])

async def test_parallel_pages_stay_bounded_and_do_not_duplicate_completed_captures(monkeypatch):
 original=browser.open_page;active=0;peak=0
 @asynccontextmanager
 async def delayed(*args,**kwargs):
  nonlocal active,peak
  async with original(*args,**kwargs) as value:
   async def route(request):
    nonlocal active,peak
    active+=1;peak=max(peak,active)
    try:await asyncio.sleep(.2);await request.fallback()
    finally:active-=1
   await value[0].context.route('**/p*.html',route)
   yield value
 monkeypatch.setattr(browser,'open_page',delayed)
 first=await snapshots.collect(source(),max_pages=5)
 assert 2<=peak<=snapshots.c.SNAPSHOT_CONCURRENCY
 assert sum(p['state']=='loaded' for p in first['pages'])==5 and first['limit_reached']
 original_image=first['pages'][0]['image']
 second=await snapshots.collect(source(),checkpoint=first,max_pages=10)
 assert len(second['pages'])==7 and not second['limit_reached']
 assert second['pages'][0]['image']==original_image

async def test_deadline_keeps_uncollected_urls_pending_instead_of_marking_them_done(monkeypatch):
 original=browser.open_page
 @asynccontextmanager
 async def delayed(*args,**kwargs):
  async with original(*args,**kwargs) as value:
   async def route(request):await asyncio.sleep(10);await request.fallback()
   await value[0].context.route('**/p*.html',route)
   yield value
 monkeypatch.setattr(browser,'open_page',delayed)
 saved=[]
 async def progress(result):saved.append(result)
 result=await snapshots.collect(source(),timeout=2.5,on_progress=progress)
 assert result['time_limited'] and result['limit_reached']
 assert result['pages'][0]['image'] and any(p['state']=='pending' for p in result['pages'])
 assert saved[-1]['pages']==result['pages']

async def test_pause_keeps_finished_images_and_remaining_addresses():
 saved=[]
 async def progress(result):saved.append(result)
 async def pause():return bool(saved and saved[-1]['pages'][0].get('image'))
 first=await snapshots.collect(source(),on_progress=progress,should_pause=pause)
 assert first['paused'] and first['pages'][0]['image'] and first['limit_reached']
 second=await snapshots.collect(source(),checkpoint=first)
 assert not second['paused'] and not second['limit_reached']
 assert second['pages'][0]['image']==first['pages'][0]['image']

async def test_capture_failure_does_not_invent_a_screenshot(monkeypatch):
 original=browser.open_page
 @asynccontextmanager
 async def no_image(*args,**kwargs):
  async with original(*args,**kwargs) as value:
   async def failed(**kwargs):raise RuntimeError('fixture capture failure')
   value[0].screenshot=failed
   yield value
 monkeypatch.setattr(browser,'open_page',no_image)
 result=await snapshots.collect(source(0))
 assert result['pages'][0]['state']=='loaded' and result['pages'][0]['capture_error']
 assert not result['pages'][0].get('image')


async def test_short_entry_fade_finishes_before_capture():
 src={'kind':'html','entry':'index.html','files':[{'path':'index.html','data':base64.b64encode(b"<title>Fade fixture</title><body style='opacity:.4'><h1>Ready view</h1><script>setTimeout(()=>document.body.style.opacity=1,650)</script>").decode()}]}
 result=await snapshots.collect(src)
 assert result['pages'][0]['capture_ready'] is True
 assert result['pages'][0]['image']
