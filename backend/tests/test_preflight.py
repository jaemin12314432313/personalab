import base64
import pytest
from app.services import preflight, browser

HTML="""<meta charset='utf-8'><title>사전 탐색 fixture</title><main id='app'></main><script>
function root(){document.querySelector('#app').innerHTML='<h1>첫 화면</h1><button onclick="setup()">게임 시작</button><button onclick="about()">도움말</button><button onclick="localStorage.setItem(\\'BAD\\',\\'1\\')">삭제</button>';}
function setup(){document.querySelector('#app').innerHTML='<h2>캐릭터 만들기</h2><input aria-label="이름"><button onclick="finish()">다음</button>';}
function finish(){if(!document.querySelector('input').value)return;localStorage.setItem('progress','done');document.querySelector('#app').innerHTML='<h2>게임 진행</h2><button onclick="root()">처음으로</button>';}
function about(){document.querySelector('#app').innerHTML='<h2>도움말 화면</h2><button onclick="root()">닫기</button>';}
root();</script>"""
def source(html=HTML):return {'kind':'html','entry':'index.html','files':[{'path':'index.html','data':base64.b64encode(html.encode()).decode()}]}

async def test_preflight_replays_spa_branches_and_discovers_same_url_states_without_model(monkeypatch):
 monkeypatch.setattr(browser,'call_llm',lambda *a,**k:pytest.fail('No LLM during preflight'))
 result=await preflight.inspect_interactions(source())
 labels=[s['label'] for s in result['states']]
 assert '사전 탐색 fixture' in labels and '캐릭터 만들기' in labels and '게임 진행' in labels and '도움말 화면' in labels,result
 assert len({s['url'] for s in result['states']})==1
 assert any(t['path']==['게임 시작','다음'] and t['status']=='changed' for t in result['transitions'])
 assert result['input_fills']>0
 assert any(s['path']==['게임 시작','다음'] and s['image'].startswith('data:image/jpeg') for s in result['states'])
 assert any(s['label']=='삭제' for s in result['skipped'])
 assert not any(t['action']=='삭제' for t in result['transitions'])
 assert all('127.0.0.1' not in s['url'] for s in result['states'])

async def test_preflight_reports_budget_and_never_claims_whole_site_coverage(monkeypatch):
 monkeypatch.setattr(preflight,'PREFLIGHT_MAX_ATTEMPTS',1)
 result=await preflight.inspect_interactions(source())
 assert result['attempts']==1 and result['limited'] and result['status']=='partial'
 assert len(result['transitions'])==1

async def test_no_change_does_not_become_a_fabricated_new_screen():
 result=await preflight.inspect_interactions(source('<title>Fixture</title><h1>화면</h1><button>보기</button>'))
 assert len(result['states'])==1
 assert result['transitions'][0]['status']=='unchanged'
 assert not result['limited']


async def test_foreground_dialog_is_followed_before_covered_background_buttons(monkeypatch):
 monkeypatch.setattr(preflight,"PREFLIGHT_MAX_ATTEMPTS",2)
 html="""<meta charset='utf-8'><title>Dialog fixture</title><h1>선택</h1><div id='choices'></div><script>
 for(let i=0;i<20;i++)choices.insertAdjacentHTML('beforeend',`<button onclick="openDialog()">선택 ${i}</button>`);
 function openDialog(){if(document.querySelector('[role=dialog]'))return;const d=document.createElement('div');d.role='dialog';d.style='position:fixed;inset:0;z-index:1000;background:white';d.innerHTML='<h2>현재 팝업</h2><button>다음</button>';d.querySelector('button').onclick=()=>{document.body.innerHTML='<h1>도착 화면</h1>';};document.body.append(d);}
 </script>"""
 result=await preflight.inspect_interactions(source(html))
 assert any(s['label']=='도착 화면' for s in result['states'])
 assert any(t['path']==['선택 0','다음'] and t['status']=='changed' for t in result['transitions'])


async def test_primary_navigation_is_swept_after_setup_even_when_base_state_budget_is_exhausted(monkeypatch):
 monkeypatch.setattr(preflight,'PREFLIGHT_MAX_STATES',4)
 monkeypatch.setattr(preflight,'PREFLIGHT_NAV_STATE_RESERVE',6)
 monkeypatch.setattr(preflight,'PREFLIGHT_MAX_ATTEMPTS',12)
 html="""<meta charset='utf-8'><title>Navigation fixture</title><main id='app'></main><script>
 let step=0,active='진행';
 function render(){if(step<3){app.innerHTML='<h1>준비 '+step+'</h1><button onclick="step++;render()">다음</button>';return;}
 const tabs=['진행','내 정보','정계','브리핑','설정'];
 app.innerHTML='<h1>'+active+'</h1><button onclick="document.querySelector(\\'h1\\').textContent+=\\'세부 내용\\'">세부 내용 보기</button><nav aria-label="주 메뉴">'+tabs.map(t=>'<div role="tab" tabindex="0" aria-selected="'+(active===t)+'" onclick="active=this.textContent;render()">'+t+'</div>').join('')+'</nav>';}
 render();</script>"""
 result=await preflight.inspect_interactions(source(html))
 covered={n['label']:n for n in result['navigation']}
 assert set(covered)=={'진행','내 정보','정계','브리핑','설정'},result
 assert all(n['status']=='visited' and n['state_id'] for n in covered.values()),result
 assert any(s['label'].startswith('설정') and s['image'] for s in result['states'])
 assert len(result['states'])>4 and len(result['states'])<=10
 actions=[t['action'] for t in result['transitions']]
 assert actions.index('설정')<actions.index('세부 내용 보기') if '세부 내용 보기' in actions else True

async def test_observation_keeps_custom_navigation_when_content_exceeds_element_limit():
 html="""<title>Many controls</title><h1>Content</h1>"""+''.join('<button>본문 '+str(i)+'</button>' for i in range(90))+"""<nav><div role='tab' tabindex='0' onclick='void 0'>Overview</div><div role='tab' tabindex='0' onclick='void 0'>Settings</div></nav>"""
 async with browser.open_page(source(html)) as (page,base,blocked):
  screen,image=await browser.observe(page)
  assert len(screen['elements'])==60
  assert {e['text'] for e in screen['elements'] if e.get('navigation')}=={'Overview','Settings'}


async def test_selected_action_buttons_without_global_navigation_are_not_misclassified_as_tabs():
 html="""<title>Actions</title><h1>Start</h1><div style='display:grid'><button class='on'>Start</button><button>Ranking</button></div>"""
 async with browser.open_page(source(html)) as (page,base,blocked):
  screen=await preflight.observe(page,source(html))
  assert not any(e.get('navigation') for e in screen['elements'])

async def test_secondary_tabs_keep_their_parent_context():
 html="""<title>Tabs</title><h1>View</h1><div style='display:grid'><button class='on'>One</button><button>Two</button></div><nav><button class='on'>World</button><button>News</button></nav>"""
 async with browser.open_page(source(html)) as (page,base,blocked):
  screen=await preflight.observe(page,source(html))
  children=[e for e in screen['elements'] if e.get('nav_kind')=='section']
  assert {e['text'] for e in children}=={'One','Two'}
  assert all(e['nav_parent']=='World' for e in children)


async def test_closed_fixed_sidebar_is_not_clickable_but_main_menu_and_scrolled_content_remain():
 html="""<meta charset='utf-8'><title>Closed panel</title><h1>Start</h1><nav id='main'><button onclick="document.querySelector('h1').textContent='Main view'">Main menu</button></nav><button onclick="document.querySelector('#drawer').style.left='0'">Open drawer</button><aside id='drawer' style='position:fixed;left:100%;top:0;width:260px;height:100vh;z-index:1002'><nav><button onclick="void 0">Hidden sidebar item</button></nav></aside><div style='opacity:0'><button>Transparent item</button></div><div aria-hidden='true'><button>Aria hidden item</button></div><div style='margin-top:1500px'><button>Below fold</button></div>"""
 src=source(html)
 async with browser.open_page(src) as (page,base,blocked):
  screen=await preflight.observe(page,src);labels={e['text'] for e in screen['elements']}
  assert 'Main menu' in labels and 'Below fold' in labels
  assert not {'Hidden sidebar item','Transparent item','Aria hidden item'}&labels
  count=await page.evaluate(browser.INSPECT_STRUCTURE,{'limit':120})
  assert count['element_count']==len(screen['elements'])
  await page.get_by_text('Open drawer',exact=True).click()
  screen=await preflight.observe(page,src)
  assert any(e['text']=='Hidden sidebar item' for e in screen['elements'])

async def test_exact_safe_link_can_be_followed_when_live_content_changes_before_action():
 html="""<meta charset='utf-8'><title>Live page</title><h1 id='clock'>0</h1><a href='done.html'>Open result</a><script>let n=0;setInterval(()=>clock.textContent=++n,5)</script>"""
 src=source(html);src['files'].append({'path':'done.html','data':base64.b64encode(b'<title>Result</title><h1>Arrived</h1>').decode()})
 result=await preflight.inspect_interactions(src,limits={'states':5,'attempts':2,'seconds':15,'clicks':10})
 assert any(s['url']=='/done.html' for s in result['states']),result
 assert any(t['action']=='Open result' and t['status']=='changed' for t in result['transitions'])


async def test_scrolling_observation_replaces_old_locator_tokens_instead_of_duplicating_them():
 html='<title>Tokens</title>'+''.join('<div style="height:34px"><button onclick="document.documentElement.dataset.picked=this.textContent">Item '+str(i)+'</button></div>' for i in range(190))
 src=source(html)
 async with browser.open_page(src) as (page,base,blocked):
  await preflight.observe(page,src)
  await page.evaluate('scrollTo(0,5000)')
  screen=await preflight.observe(page,src)
  tokens=await page.locator('[data-personalab-element]').evaluate_all('(nodes)=>nodes.map(e=>e.getAttribute("data-personalab-element"))')
  assert len(tokens)==len(set(tokens))==len(screen['elements'])
  target=screen['elements'][0]
  await page.locator('[data-personalab-element="'+target['id']+'"]').click(timeout=1000)
  assert await page.evaluate('document.documentElement.dataset.picked')==target['text']


async def test_covered_submenu_is_revealed_by_its_safe_observed_parent_before_clicking():
 html="""<meta charset='utf-8'><title>Hover menu</title><style>nav{height:45px;position:relative;z-index:1}nav:hover{z-index:3}nav li{list-style:none}nav .submenu{position:absolute;top:50px;left:0}main{position:relative;z-index:2;height:100px;background:white;display:flow-root}</style><nav><li><button>서비스</button><div class='submenu'><a href='done.html'>시작하기</a></div></li></nav><main><h1>Start</h1></main>"""
 src=source(html);src['files'].append({'path':'done.html','data':base64.b64encode(b'<title>Done</title><h1>Arrived</h1>').decode()})
 result=await preflight.inspect_interactions(src,limits={'states':5,'attempts':6,'seconds':15,'clicks':20,'images':0})
 assert any(s['url']=='/done.html' for s in result['states']),result
 assert result['performance']['menu_hovers']>=1
 assert any(t['action']=='시작하기' and t['status']=='changed' for t in result['transitions'])


async def test_repeated_unconfirmed_paths_are_preserved_for_explicit_resume():
 html="""<title>Covered</title><nav><button onclick="document.querySelector('h1').textContent='Reached';this.remove()">Open view</button></nav><h1>Start</h1><div id='cover' style='position:fixed;inset:0;z-index:10;background:white'></div>"""
 src=source(html);checkpoints=[]
 async def progress(result,state):checkpoints.append(state)
 result=await preflight.inspect_interactions(src,limits={'states':10,'attempts':50,'seconds':15,'clicks':50,'images':0},on_progress=progress)
 assert result['limited'] and result['failure_limited'] and result['pending_actions']==1
 assert result['attempts']==preflight.PREFLIGHT_FAILURE_RETRIES and result['clicks']==0
 assert all(t['reason']=='covered' for t in result['transitions'])
 assert checkpoints[-1]['queue']
 resumed=await preflight.inspect_interactions(source(html.replace("<div id='cover' style='position:fixed;inset:0;z-index:10;background:white'></div>",'')),checkpoint=checkpoints[-1],limits={'states':10,'attempts':50,'seconds':15,'clicks':50,'images':0})
 assert any('Reached' in s['excerpt'] for s in resumed['states']),resumed
 assert resumed['pending_actions']==0 and not resumed['limited']


async def test_unchanged_sibling_actions_reuse_the_replayed_origin_without_replaying_setup_each_time():
 html="""<meta charset='utf-8'><title>Reuse origin</title><main id='app'></main><script>
 let step=0;function child(){app.innerHTML='<h1>Child</h1>';}function render(){if(step<4){app.innerHTML='<h1>Setup '+step+'</h1><button onclick="step++;render()">다음</button>';return;}
 app.innerHTML='<h1>Workspace</h1><button onclick="child()">계속 보기</button>'+Array.from({length:6},(_,i)=>'<button>Inspect '+i+'</button>').join('');}render();</script>"""
 result=await preflight.inspect_interactions(source(html),limits={'states':20,'attempts':40,'seconds':30,'clicks':100,'images':0})
 assert any('Child' in s['excerpt'] for s in result['states']),result
 assert sum(t['status']=='unchanged' for t in result['transitions'])==6
 assert result['pending_actions']==0 and not result['limited']
 assert result['performance']['restores']==1
 assert result['performance']['replay_clicks']==4
 assert result['clicks']==15
