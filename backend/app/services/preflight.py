"""연결 단계의 익명 화면 전환 조사. 모델·페르소나 없이 실제 조작한 근거만 보관한다."""
import asyncio
import base64
import hashlib
import json
import re
from copy import deepcopy
from datetime import datetime, timezone
from time import monotonic
from urllib.parse import urljoin, urlsplit, unquote
from app.core.config import (PREFLIGHT_MAX_STATES, PREFLIGHT_MAX_ATTEMPTS, PREFLIGHT_MAX_DEPTH,
    PREFLIGHT_TIMEOUT_SECONDS, PREFLIGHT_ACTION_TIMEOUT_MS, PREFLIGHT_MAX_ELEMENTS,
    PREFLIGHT_MAX_IMAGES, PREFLIGHT_MAX_INPUTS, PREFLIGHT_MAX_CLICKS, PREFLIGHT_NAV_STATE_RESERVE, PREFLIGHT_NAV_IMAGE_RESERVE, EXPLORATION_MAX_PENDING, PREFLIGHT_FAILURE_RETRIES, PREFLIGHT_HOVER_SETTLE_MS)
from app.services import browser, site_map

AUTH_OR_CONSENT=re.compile(r'로그인|로그아웃|회원.?가입|본인.?인증|약관|동의|비밀번호|sign.?in|sign.?up|log.?in|log.?out|register|consent|agree|accept',re.I)
FORWARD=re.compile(r'다음|계속|시작|확인|완료|확정|진행|입문|돌리기|만들기|적용|next|continue|start|finish',re.I)
BACK=re.compile(r'뒤로|이전|닫기|취소|back|close|cancel',re.I)
READ_LABEL=r"""() => {
 const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';
 const headings=[...document.querySelectorAll('[role=dialog] h1,[role=dialog] h2,h1,h2,h3')].filter(visible).map(e=>e.innerText.trim()).filter(Boolean);
 return {heading:headings[0]||'',title:document.title};
}"""

READ_LABEL=READ_LABEL.replace("const visible=e=>e.getClientRects().length&&getComputedStyle(e).visibility!=='hidden';",browser.DOM_VISIBILITY)

async def observe(page,source):
    screen=await page.evaluate(browser.OBSERVE,{'max':PREFLIGHT_MAX_ELEMENTS,'textLimit':3000})
    layers=await page.evaluate(r'''() => Object.fromEntries([...document.querySelectorAll('[data-personalab-element]')].map(e=>{
      let layer=0,p=e;for(let i=0;p&&i<12;i++,p=p.parentElement){const s=getComputedStyle(p),z=parseInt(s.zIndex)||0;if(s.position==='fixed'||s.position==='absolute')layer=Math.max(layer,z);if(p.matches('dialog[open],[role=dialog],[aria-modal=true],[class*=modal],[class*=Modal],[id*=modal],[id*=Modal],[class*=dialog],[id*=dialog]'))layer=Math.max(layer,1000);}
      const r=e.getBoundingClientRect(),inside=r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth;
      const hit=inside?document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,r.x+r.width/2)),Math.max(0,Math.min(innerHeight-1,r.y+r.height/2))):null;
      const covered=inside&&hit!==e&&!e.contains(hit),reveals=[];
      if(covered){for(let p=e.parentElement;p&&p!==document.body;p=p.parentElement){const a=[...p.children].find(n=>n!==e&&!n.contains(e)&&n.matches('a,button,[role=button],[role=menuitem]')&&n.hasAttribute('data-personalab-element'));if(a)reveals.unshift(a.getAttribute('data-personalab-element'));}}
      return [e.getAttribute('data-personalab-element'),{layer,role:e.getAttribute('role'),covered,reveals}];
    }))''')
    for e in screen['elements']:
        details=layers.get(e['id'],{});e['_layer']=details.get('layer',0);e['role']=details.get('role')
        e['_covered']=details.get('covered',False);e['_reveals']=details.get('reveals',[])
    url=site_map.public_url(screen['url'],source)
    semantic=[{k:v for k,v in e.items() if k not in ('id','rect','filled','_layer','_covered','_reveals','in_view','dialog')} for e in screen['elements']]
    for e in semantic:
        if e.get('href'):e['href']=site_map.public_url(e['href'],source)
    semantic.sort(key=lambda e:e.get('order',0))
    key=json.dumps({'url':url,'text':screen['description'],'elements':semantic},sort_keys=True,ensure_ascii=False)
    screen['state_id']='PF'+hashlib.sha256(key.encode()).hexdigest()[:14]
    screen['url']=url
    return screen

def descriptor(element,elements,source):
    key={k:element.get(k) for k in ('text','kind','type')}
    key['href']=site_map.public_url(element['href'],source) if element.get('href') else None
    key.update(navigation=bool(element.get('navigation')),nav_group=element.get('nav_group'),nav_kind=element.get('nav_kind'),nav_parent=element.get('nav_parent'))
    same=[e for e in elements if all(e.get(k)==element.get(k) for k in ('text','kind','type','href')) and (not key['navigation'] or e.get('nav_group')==key['nav_group'])]
    same.sort(key=lambda e:e.get('order',0))
    key['ordinal']=next(i for i,e in enumerate(same) if e['id']==element['id'])
    return key

def find_target(screen,action,source):
    matches=[e for e in screen['elements'] if all(e.get(k)==action.get(k) for k in ('kind','type')) and (e['text'].splitlines()[0]==action['text'].splitlines()[0] if action.get('navigation') else e['text']==action['text']) and (site_map.public_url(e['href'],source) if e.get('href') else None)==action.get('href') and (not action.get('navigation') or e.get('nav_group')==action.get('nav_group'))]
    matches.sort(key=lambda e:e.get('order',0))
    return matches[action['ordinal']] if len(matches)>action['ordinal'] else None

def allowed(element,base):
    text=element['text']
    if browser.SENSITIVE.search(text) or AUTH_OR_CONSENT.search(text):return False
    if element.get('href'):
        try:
            u=urlsplit(element['href'])
            return u.scheme in ('http','https') and browser.origin(element['href'])==base and not site_map.UNSAFE_PATH.search(unquote(u.path+'?'+u.query)) and not site_map.ASSET_PATH.search(u.path)
        except ValueError:return False
    return element['kind'] in ('button','summary') or element.get('role') in ('button','tab','menuitem','link') or element.get('clickable') or element.get('kind')=='input' and element.get('type') in ('button','submit','radio')

async def prepare_inputs(page,source,observer=None):
    filled=0
    for _ in range(PREFLIGHT_MAX_INPUTS):
        screen=await (observer or observe)(page,source)
        target=next((e for e in screen['elements'] if e['kind'] in ('input','textarea','select') and not e.get('filled') and e.get('type') not in ('password','file','hidden','checkbox','radio','submit','button','reset') and not browser.SENSITIVE.search(e['text']) and not AUTH_OR_CONSENT.search(e['text'])),None)
        if not target:break
        node=page.locator('[data-personalab-element="'+target['id']+'"]')
        try:
            if await node.get_attribute('readonly') is not None:break
            if target['kind']=='select':
                option=next((o['value'] for o in target.get('options',[]) if o['value']),None)
                if option is None:break
                await node.select_option(option,timeout=PREFLIGHT_ACTION_TIMEOUT_MS)
            else:
                kind=target.get('type')
                if kind=='number':
                    minimum=await node.get_attribute('min');maximum=await node.get_attribute('max')
                    value=max(float(minimum or 1),min(20,float(maximum or 20)));value=str(int(value))
                else:value={'email':'persona-test@example.com','tel':'01000000000','date':'2000-01-01','url':'https://example.com'}.get(kind,'테스트')
                await node.fill(value,timeout=PREFLIGHT_ACTION_TIMEOUT_MS)
            filled+=1
        except Exception:break
    return filled

def navigation_key(action):
    return (action.get('nav_group') or '',action['text'].splitlines()[0])

def path_depth(path):
    return sum(not a.get('navigation') for a in path)


def menu_path(path,action):
    # 메뉴 순회 이력을 매번 누적하지 않고 재현에 필요한 상위 경로만 남긴다.
    kind=action.get('nav_kind')
    cut=next((i for i,a in enumerate(path) if a.get('nav_kind')==('global' if kind=='global' else 'section')),len(path))
    return path[:cut]+[action]

def compact_checkpoint(state):
    # 공개 결과는 preflight에 한 번만 저장하고, 남은 경로의 공통 접두사는 공유한다.
    nodes={};lookup={};queue=[]
    for origin,path in state.get('queue',[]):
        parent=None
        for action in path:
            key=(parent,json.dumps(action,sort_keys=True,ensure_ascii=False))
            if key not in lookup:
                node=str(len(nodes));lookup[key]=node;nodes[node]={'parent':parent,'action':action}
            parent=lookup[key]
        queue.append([origin,parent])
    return {'format':1,'queue':queue,'path_nodes':nodes,**{k:state[k] for k in ('cookies','storage','image_count','nav_image_count') if k in state}}

def expanded_checkpoint(result,working):
    if not working:return None
    state={**deepcopy(result or {}),**deepcopy(working)}
    if state.get('format')==1:
        nodes=state.pop('path_nodes',{});queue=[]
        for origin,ref in state['queue']:
            path=[];seen=set()
            while ref is not None:
                if ref in seen or ref not in nodes:raise ValueError('저장한 탐색 경로를 읽지 못했습니다.')
                seen.add(ref);node=nodes[ref];path.append(node['action']);ref=node['parent']
            queue.append([origin,list(reversed(path))])
        state['queue']=queue
    return state

async def inspect_interactions(source,viewport='desktop',*,checkpoint=None,on_progress=None,should_pause=None,limits=None):
    limits=limits or {};saved=deepcopy(checkpoint or {})
    states=saved.get('states',[]);transitions=saved.get('transitions',[]);skipped=saved.get('skipped',[])
    queue=saved.get('queue',[]);known={s['id']:s for s in states}
    navigation={}
    for n in saved.get('navigation',[]):navigation[(n['group'],n['label'])]=n
    attempts=saved.get('attempts',0);physical_clicks=saved.get('clicks',0);input_fills=saved.get('input_fills',0)
    limited=False;deferred=0;image_count=saved.get('image_count',0);nav_image_count=saved.get('nav_image_count',0);started=monotonic()
    total_states=limits.get('states',PREFLIGHT_MAX_STATES+PREFLIGHT_NAV_STATE_RESERVE)
    max_attempts=limits.get('attempts',PREFLIGHT_MAX_ATTEMPTS);max_clicks=limits.get('clicks',PREFLIGHT_MAX_CLICKS)
    max_depth=limits.get('depth',PREFLIGHT_MAX_DEPTH);timeout=limits.get('seconds',PREFLIGHT_TIMEOUT_SECONDS)
    max_images=limits.get('images',PREFLIGHT_MAX_IMAGES);max_pending=limits.get('pending',EXPLORATION_MAX_PENDING)
    pending_task=None;cookies=[];storage={'local':[],'session':[]}
    failed_prefixes={}
    performance=deepcopy(saved.get('performance') or {})
    for field in ('restores','replay_clicks','menu_hovers','reused_origins','failures','observe_calls'):performance.setdefault(field,0)
    timing=performance.setdefault('seconds',{})
    def add_time(field,started_at):timing[field]=round(timing.get(field,0)+monotonic()-started_at,3)
    def path_key(path):return tuple(json.dumps({k:v for k,v in a.items() if not k.startswith('_')},sort_keys=True,ensure_ascii=False) for a in path)
    def eligible(path):
        value=path_key(path)
        return not any(count>=PREFLIGHT_FAILURE_RETRIES and value[:len(prefix)]==prefix for prefix,count in failed_prefixes.items())
    async def measured_observe(page_arg,source_arg):
        tick=monotonic()
        try:return await observe(page_arg,source_arg)
        finally:performance['observe_calls']+=1;add_time('observe',tick)
    async def click_target(page,target,*,replay=False):
        nonlocal physical_clicks
        if physical_clicks>=max_clicks:result['click_limited']=True;raise TimeoutError()
        tick=monotonic()
        try:
            await page.locator('[data-personalab-element="'+target['id']+'"]').click(timeout=PREFLIGHT_ACTION_TIMEOUT_MS)
            physical_clicks+=1
            if replay:performance['replay_clicks']+=1
            await page.wait_for_timeout(200)
        finally:add_time('action',tick)
    async def ready_target(page,current,step):
        target=find_target(current,step,source)
        if target and target.get('_covered') and target.get('navigation'):
            parents=[e for token in target.get('_reveals',[]) for e in current['elements'] if e['id']==token and allowed(e,base)]
            for parent in parents:
                tick=monotonic()
                try:
                    await page.locator('[data-personalab-element="'+parent['id']+'"]').hover(timeout=PREFLIGHT_ACTION_TIMEOUT_MS)
                    performance['menu_hovers']+=1
                    await page.wait_for_timeout(PREFLIGHT_HOVER_SETTLE_MS)
                finally:add_time('action',tick)
            if parents:current=await measured_observe(page,source);target=find_target(current,step,source)
        return current,target

    async def publish():
        result.update(attempts=attempts,clicks=physical_clicks,input_fills=input_fills,navigation=list(navigation.values()),pending_actions=len(queue),performance=deepcopy(performance),elapsed_seconds=round(saved.get('elapsed_seconds',0)+monotonic()-started,2))
        if on_progress:
            state={**result,'queue':deepcopy(queue),'cookies':cookies,'storage':storage,'image_count':image_count,'nav_image_count':nav_image_count}
            tick=monotonic()
            try:await on_progress(deepcopy(result),state)
            finally:add_time('save',tick)
    async def pausing():return bool(should_pause and await should_pause())
    result={'states':states,'transitions':transitions,'navigation':[], 'skipped':skipped,'attempts':0,'clicks':0,'input_fills':0,'limited':False,'status':'done','max_states':total_states,'base_state_limit':PREFLIGHT_MAX_STATES,'navigation_reserve':PREFLIGHT_NAV_STATE_RESERVE,'max_attempts':max_attempts,'max_depth':max_depth,'timeout_seconds':timeout,'scanned_at':datetime.now(timezone.utc).isoformat()}
    try:
        async with browser.open_page(source,viewport) as (page,base,blocked):
            root=page.url;page.set_default_timeout(PREFLIGHT_ACTION_TIMEOUT_MS)
            cookies=saved.get('cookies',await page.context.cookies())
            storage=saved.get('storage',await page.evaluate("() => ({local:Object.entries(localStorage),session:Object.entries(sessionStorage)})"))
            async def restore():
                tick=monotonic();performance['restores']+=1
                await page.context.clear_cookies()
                if cookies:await page.context.add_cookies(cookies)
                await page.goto(root,wait_until='domcontentloaded',timeout=PREFLIGHT_ACTION_TIMEOUT_MS)
                await page.evaluate("saved => {localStorage.clear();sessionStorage.clear();for(const [k,v] of saved.local)localStorage.setItem(k,v);for(const [k,v] of saved.session)sessionStorage.setItem(k,v);}",storage)
                await page.reload(wait_until='domcontentloaded',timeout=PREFLIGHT_ACTION_TIMEOUT_MS)
                await page.wait_for_timeout(150)
                add_time('restore',tick)

            def register_navigation(screen,state_id):
                newly_visited=False
                for e in screen['elements']:
                    if not e.get('navigation') or not allowed(e,base):continue
                    key=navigation_key(e)
                    if key not in navigation:
                        navigation[key]={'id':'N'+hashlib.sha256(repr(key).encode()).hexdigest()[:12],'label':key[1][:100],'group':key[0],'kind':e.get('nav_kind') or 'section','parent':e.get('nav_parent'),'status':'pending','state_id':None,'attempts':0}
                    row=navigation[key]
                    if e.get('selected') and row['status']!='visited':
                        row.update(status='visited',state_id=state_id)
                        if row['kind']=='global':newly_visited=True
                return newly_visited

            async def remember(screen,path):
                nonlocal image_count,nav_image_count
                state_id=screen['state_id']
                if state_id not in known and len(states)>=total_states:result['state_limited']=True;raise TimeoutError()
                new_nav=register_navigation(screen,state_id)
                if state_id in known:return known[state_id]
                info=await page.evaluate(READ_LABEL)
                nav_action=path[-1] if path and path[-1].get('navigation') else None
                label=(info['title'] or info['heading'] or '시작 화면') if not path else info['heading'] or path[-1]['text'].splitlines()[0]+' 이후'
                if nav_action:label=nav_action['text'].splitlines()[0]+(' · '+label if label!=nav_action['text'].splitlines()[0] else '')
                elif path and any(s['label']==label for s in states):label=label+' · '+path[-1]['text'].splitlines()[0]
                node={'id':state_id,'label':label[:160],'url':screen['url'],'excerpt':screen['description'][:500],'path':[a['text'].splitlines()[0][:80] for a in path],'element_count':len(screen['elements']),'image':None,'navigation':nav_action['text'].splitlines()[0] if nav_action else None}
                is_nav_image=new_nav or bool(nav_action and nav_action.get('nav_kind')=='global')
                pool='nav' if is_nav_image and nav_image_count<PREFLIGHT_NAV_IMAGE_RESERVE else 'normal' if image_count<max_images else None
                if pool:
                    try:
                        tick=monotonic()
                        node['image']='data:image/jpeg;base64,'+base64.b64encode(await page.screenshot(type='jpeg',quality=35,animations='disabled',timeout=PREFLIGHT_ACTION_TIMEOUT_MS)).decode()
                        add_time('capture',tick)
                        if pool=='nav':nav_image_count+=1
                        else:image_count+=1
                    except Exception:pass
                states.append(node);known[state_id]=node
                candidates=[]
                for e in screen['elements']:
                    if e['kind'] not in ('a','button','input','summary') and e.get('role') not in ('button','tab','menuitem','link') and not e.get('clickable'):continue
                    if e['kind']=='input' and e.get('type') not in ('button','submit','radio'):continue
                    if not allowed(e,base):
                        if len(skipped)<PREFLIGHT_MAX_ATTEMPTS:skipped.append({'label':e['text'],'reason':'인증·동의·데이터 변경 또는 외부 이동 범위'})
                        continue
                    if e.get('navigation') and navigation[navigation_key(e)]['status']=='visited':continue
                    action=descriptor(e,screen['elements'],source);action['_layer']=e.get('_layer',0);candidates.append(action)
                candidates.sort(key=lambda a:(-a.get('_layer',0),0 if a.get('nav_kind')=='global' else 1 if a.get('navigation') else 2,not bool(FORWARD.search(a['text'].splitlines()[0])),bool(BACK.search(a['text'].splitlines()[0])),len(a['text'])>60))
                # 같은 상위 메뉴는 최신 화면에서 바로 눌러 초기 설정을 반복하지 않는다.
                fresh_nav={navigation_key(a) for a in candidates if a.get('navigation')}
                queue[:]=[q for q in queue if not(q[1][-1].get('navigation') and navigation_key(q[1][-1]) in fresh_nav)]
                pending_keys={(origin,path_key(p[-1:])) for origin,p in queue}
                for action in reversed(candidates):
                    task_key=(state_id,path_key([action]))
                    if task_key in pending_keys:continue
                    pending_keys.add(task_key)
                    if not action.get('navigation') and path_depth(path)>=max_depth:
                        result['depth_limited']=True;continue
                    if len(queue)>=max_pending:
                        result['queue_limited']=True;continue
                    queue.insert(0,(state_id,path+[action]))
                return node

            async with asyncio.timeout(max(.1,timeout-(monotonic()-started))):
                if saved:await restore()
                input_fills+=await prepare_inputs(page,source,measured_observe)
                initial=await measured_observe(page,source)
                if not saved:await remember(initial,[])
                active_state=initial['state_id'];active_path=[]
                await publish()
                while queue and attempts<max_attempts and len(states)<total_states:
                    if await pausing():result['paused']=True;break
                    queue[:]=[task for task in queue if not(task[1][-1].get('navigation') and navigation.get(navigation_key(task[1][-1]),{}).get('status')=='visited')]
                    if not queue:break
                    next_index=next((i for i,task in enumerate(queue) if eligible(task[1])),None)
                    if next_index is None:result['failure_limited']=True;break
                    pending_task=queue.pop(next_index);origin_state,path=pending_task;path=deepcopy(path);action=path[-1];is_nav=bool(action.get('navigation'))
                    if is_nav and navigation.get(navigation_key(action),{}).get('status')=='visited':continue
                    if not limits and not is_nav and len(states)>=PREFLIGHT_MAX_STATES:deferred+=1;pending_task=None;continue
                    attempts+=1;before_blocked=len(blocked);failed_path=path;origin_path=path[:-1];current=None
                    nav_row=navigation.get(navigation_key(action)) if is_nav else None
                    if nav_row:nav_row['attempts']+=1
                    try:
                        direct_nav=False
                        if is_nav and active_state:
                            current=await measured_observe(page,source);target=find_target(current,action,source)
                            if target is None and action.get('nav_parent'):
                                parent=next((e for e in current['elements'] if e.get('nav_kind')=='global' and e['text'].splitlines()[0]==action['nav_parent'] and allowed(e,base)),None)
                                if parent:
                                    old_state=current['state_id'];parent_action=descriptor(parent,current['elements'],source)
                                    await click_target(page,parent)
                                    current=await measured_observe(page,source);active_path=menu_path(active_path,parent_action)
                                    parent_node=await remember(current,active_path);active_state=parent_node['id']
                                    transitions.append({'from':old_state,'to':parent_node['id'],'action':parent_action['text'],'path':[a['text'].splitlines()[0][:80] for a in active_path],'status':'changed' if old_state!=parent_node['id'] else 'unchanged','navigation':True})
                                    target=find_target(current,action,source)
                            if target and target.get('navigation') and allowed(target,base):
                                if current['state_id'] not in known:await remember(current,active_path)
                                origin_state=current['state_id'];path=menu_path(active_path,descriptor(target,current['elements'],source));direct_nav=True
                        continuing=direct_nav or active_state==origin_state
                        if continuing:
                            origin_path=deepcopy(active_path);performance['reused_origins']+=1
                            if not direct_nav:path=origin_path+[action]
                        else:
                            active_state=None;active_path=[];await restore();origin_path=path[:-1]
                        valid=True;failure_kind=None
                        for index in ([len(path)-1] if continuing else range(len(path))):
                            step=path[index];failed_path=path[:index+1]
                            if not step.get('navigation'):input_fills+=await prepare_inputs(page,source,measured_observe)
                            current=await measured_observe(page,source);current,target=await ready_target(page,current,step)
                            if target is None or not allowed(target,base):valid=False;failure_kind='target_missing';break
                            if target.get('_covered'):valid=False;failure_kind='covered';break
                            if index==len(path)-1 and current['state_id']!=origin_state and not (step.get('navigation') or step.get('href')):valid=False;failure_kind='state_changed';break
                            await click_target(page,target,replay=index<len(path)-1)
                        if not valid:
                            performance['failures']+=1
                            failed_prefixes[path_key(failed_path)]=failed_prefixes.get(path_key(failed_path),0)+1
                            if pending_task not in queue:queue.append(pending_task)
                            active_state=None;active_path=[]
                            if current and current['state_id']==origin_state:active_state=origin_state;active_path=deepcopy(origin_path)
                            if nav_row:nav_row['status']='unconfirmed'
                            transitions.append({'from':origin_state,'to':None,'action':action['text'],'path':[a['text'].splitlines()[0][:80] for a in path],'status':'unreplayed','reason':failure_kind});continue
                        if not is_nav:input_fills+=await prepare_inputs(page,source,measured_observe)
                        if browser.origin(page.url)!=base:
                            active_state=None;active_path=[]
                            if nav_row:nav_row['status']='unconfirmed'
                            transitions.append({'from':origin_state,'to':None,'action':action['text'],'path':[a['text'].splitlines()[0][:80] for a in path],'status':'blocked'});continue
                        screen=await measured_observe(page,source);node=await remember(screen,path)
                        changed=node['id']!=origin_state
                        active_state=node['id'];active_path=path if changed else deepcopy(origin_path)
                        if nav_row:
                            if changed:nav_row.update(status='visited',state_id=node['id'])
                            elif nav_row['status']!='visited':nav_row['status']='unconfirmed'
                        transitions.append({'from':origin_state,'to':node['id'],'action':action['text'],'path':[a['text'].splitlines()[0][:80] for a in path],'status':'changed' if changed else 'unchanged','restricted_requests':len(blocked)-before_blocked,'navigation':is_nav})
                    except (asyncio.CancelledError,TimeoutError):
                        queue.insert(0,pending_task);pending_task=None;raise
                    except Exception as exc:
                        performance['failures']+=1
                        failed_prefixes[path_key(failed_path)]=failed_prefixes.get(path_key(failed_path),0)+1
                        if pending_task not in queue:queue.append(pending_task)
                        active_state=None;active_path=[]
                        if nav_row:nav_row['status']='unconfirmed'
                        transitions.append({'from':origin_state,'to':None,'action':action['text'],'path':[a['text'].splitlines()[0][:80] for a in path],'status':'blocked' if len(blocked)>before_blocked else 'unconfirmed','reason':'action_timeout' if type(exc).__name__=='TimeoutError' else 'browser_error'})
                    finally:
                        if not asyncio.current_task().cancelling():
                            pending_task=None
                            await publish()
                limited=bool(queue) or bool(result.get('depth_limited')) or bool(result.get('queue_limited')) or deferred>0
                result['blocked_request_count']=len(blocked)
    except TimeoutError:limited=True;result['status']='partial'
    except Exception:
        limited=bool(states) or monotonic()-started>=timeout
        result['status']='partial' if limited else 'unavailable';result['error']='사전 화면 탐색을 모두 마치지 못했어요. 확인한 장면과 남은 범위를 함께 보세요.'
    result.update(attempts=attempts,clicks=physical_clicks,input_fills=input_fills,limited=limited,navigation=list(navigation.values()),deferred_actions=deferred)
    if limited and result['status']=='done':result['status']='partial'
    await publish()
    return result
