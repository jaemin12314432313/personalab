import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer } from 'vite';

async function until(predicate) {
  for (let i=0; i<200; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
  throw new Error('Timed out waiting for connected UI');
}

// Legacy graph tests explicitly register their fixture. New tests start empty.
function registerFixtureScreens(dom) {
  const d=dom.window.document;
  const screens=Array.from({length:5},(_,i)=>({id:`S0${i+1}`,label:['온보딩','회원가입','학교·학년','관심분야','홈'][i],description:'명시적으로 등록한 테스트 화면',elements:i<4?[{text:i===0?'시작하기':'다음',to:`S0${i+2}`}]:[]}));
  d.getElementById('screenJson').value=JSON.stringify(screens);d.getElementById('applyScreens').click();
  d.getElementById('task').value='회원가입을 완료하세요';d.getElementById('task').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
}

async function environment(callback, authenticated = true) {
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
  const dom = new JSDOM('<div id="root"></div>', { url:'http://localhost/#panel', pretendToBeVisual:true });
  const originals = new Map();
  for (const [name,value] of Object.entries({ window:dom.window, document:dom.window.document, location:dom.window.location, localStorage:dom.window.localStorage, matchMedia:()=>({matches:true,addEventListener(){}}), CSS:{escape:s=>s}, ResizeObserver:class { observe(){} disconnect(){} }, requestAnimationFrame:fn=>dom.window.requestAnimationFrame(fn), cancelAnimationFrame:id=>dom.window.cancelAnimationFrame(id) })) {
    originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name)); Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});
  }
  dom.window.scrollTo=()=>{}; dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
  const oldFetch=globalThis.fetch;
  let cleanup;
  try { const {mountMockup}=await server.ssrLoadModule('/src/mockup/MockupApp.ts'); await callback({dom,mount:()=>{ if(authenticated){const handler=globalThis.fetch;globalThis.fetch=(url,options)=>url==='/api/auth/me'?Promise.resolve(new Response(JSON.stringify({id:7,email:'test@example.com'}),{status:200})):handler(url,options);} cleanup=mountMockup(dom.window.document.getElementById('root'));}}); }
  finally { cleanup?.(); globalThis.fetch=oldFetch; dom.window.close(); await server.close(); for(const[name,descriptor]of originals) { if(descriptor) Object.defineProperty(globalThis,name,descriptor); else delete globalThis[name]; } }
}

/* 새 테스트는 이름 입력 창을 거친다. 이름을 채워 만들기까지 누른다. */
function startNew(d,selector='[data-create-study]',name='새 점검'){
  const w=d.defaultView,proto=w.HTMLDialogElement.prototype;
  proto.showModal=function(){this.open=true;};proto.close=function(){this.open=false;};
  d.querySelector(selector).click();
  const select=d.getElementById('newTestProduct');
  if(!d.getElementById('newTestProductField').hidden){select.value='__new';select.dispatchEvent(new w.Event('change',{bubbles:true}));}
  d.getElementById('newTestName').value=name;
  d.getElementById('newTestForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
}

test('missing engine data leaves an empty panel and sends no generation request', async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];
    globalThis.fetch=async(url)=>{calls.push(url); return new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:false,llm_ready:false,provider:'gemini',missing:['원본 데이터 필요']}:[]),{status:200});};
    mount(); const d=dom.window.document;
    await until(()=>d.getElementById('engineStatus').textContent.includes('준비 필요'));
    d.getElementById('panelSource').value='engine';
    d.getElementById('samplePanel').click();
    await until(()=>d.getElementById('liveNotice').textContent.includes('원본 데이터'));
    assert.ok(!calls.some(url=>url.includes('/panel/generate')));
    assert.equal(d.querySelectorAll('#tickets .ticket').length,0);
    assert.ok(!d.getElementById('roster').textContent.includes('P023'));
  });
});

test('protected workspace requires a real authenticated session',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify({detail:'로그인이 필요합니다.'}),{status:401});};
    dom.window.localStorage.setItem('personalab-connected-mockup-v1',JSON.stringify({product:{name:'이전 공용 초안'}}));
    mount();const d=dom.window.document;
    await until(()=>d.getElementById('v-login').classList.contains('on'));
    assert.ok(!d.getElementById('v-panel').classList.contains('on'));
    assert.ok(!calls.includes('/api/studies'));
    assert.equal(d.getElementById('pname').value,'');
  },false);
});

test('public landing preview tabs and section links work without login',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify({detail:'로그인이 필요합니다.'}),{status:401});};
    dom.window.location.hash='#landing';mount();const d=dom.window.document;
    await until(()=>d.getElementById('v-landing').classList.contains('on'));
    assert.equal(d.querySelectorAll('#v-landing .people-card').length,5);
    assert.ok(d.getElementById('v-landing').classList.contains('people-variant'));
    assert.equal(d.querySelectorAll('#faq.people-wide-faq').length,1);
    d.querySelector('[data-concept-person="P938"]').click();
    assert.equal(d.querySelector('[data-concept-person="P938"]').getAttribute('aria-pressed'),'true');
    assert.ok(d.getElementById('landingRecord').textContent.includes('인증 절차가 너무 복잡'));
    const prompt=d.getElementById('landingPersonaPrompt');
    assert.equal(prompt.hidden,false);
    assert.ok(prompt.classList.contains('people-prompt-popover'));
    assert.ok(prompt.parentElement.classList.contains('people-strip'));
    assert.equal(prompt.getAttribute('role'),'dialog');
    assert.equal(prompt.querySelector('.persona-prompt-face').style.getPropertyValue('--position'),'0%');
    assert.ok(prompt.textContent.includes('P938'));
    assert.ok(prompt.querySelector('.people-profile-prompt').textContent.includes('32세'));
    assert.equal(prompt.querySelector('textarea'),null);
    assert.equal(prompt.querySelector('[data-prompt-copy]'),null);
    assert.equal(prompt.querySelector('[data-prompt-download]'),null);
    assert.equal(d.querySelector('[data-concept-person="P938"]').getAttribute('aria-expanded'),'true');
    prompt.querySelector('[data-prompt-close]').click();
    assert.equal(prompt.hidden,true);
    assert.equal(d.querySelector('[data-concept-person="P938"]').getAttribute('aria-expanded'),'false');
    d.querySelector('[data-concept-person="P069"]').click();
    assert.equal(prompt.hidden,false);
    d.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
    assert.equal(prompt.hidden,true);

    d.getElementById('people-motion').click();
    assert.ok(d.querySelector('.people-strip').classList.contains('is-paused'));
    d.querySelector('[data-landing-tab="results"]').click();
    assert.equal(d.getElementById('lp-pane-results').hidden,false);
    assert.equal(d.getElementById('lp-pane-intro').hidden,true);
    assert.equal(d.querySelectorAll('#lp-pane-results tbody tr').length,5);
    d.getElementById('lp-tab-results').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}));
    assert.equal(d.getElementById('lp-tab-panel').getAttribute('aria-selected'),'true');
    dom.window.location.hash='#sources';await new Promise(resolve=>setTimeout(resolve,15));
    assert.ok(d.getElementById('v-landing').classList.contains('on'));
    assert.ok(!calls.some(url=>url.startsWith('/api/studies')));
    d.querySelector('[data-landing-tab="interview"]').click();assert.equal(d.getElementById('lp-pane-interview').hidden,false);
    d.querySelector('[data-sample-interview]').click();await until(()=>dom.window.location.hash==='#sample');
    assert.equal(d.querySelector('#sampleReport [data-rv-tab="interview"]').getAttribute('aria-selected'),'true');
    assert.ok(d.querySelector('#sampleReport .rv-interview-context').textContent.includes('P938'));
  },false);
});

test('public sample uses stored AI records and leaves private drafts untouched',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify({detail:'로그인이 필요합니다.'}),{status:401});};
    const key='personalab-connected-mockup-v1:user:55';dom.window.localStorage.setItem(key,'PRIVATE-DRAFT-UNCHANGED');
    dom.window.location.hash='#sample';mount();const d=dom.window.document;
    await until(()=>d.getElementById('v-sample').classList.contains('on'));
    const report=d.getElementById('sampleReport');
    assert.equal(report.querySelectorAll('[data-rv-finding]').length,2);
    report.querySelector('[data-rv-finding="1"]').click();
    assert.ok(report.querySelector('.rv-quote-panel').textContent.includes('P938'));
    assert.ok(report.querySelector('.rv-quote-panel').textContent.includes('인증 절차가 너무 복잡'));
    report.querySelector('[data-rv-tab="records"]').click();
    assert.equal(report.querySelectorAll('tbody tr').length,5);
    d.querySelector('[data-report-dataset="mock"]').click();
    assert.ok(report.querySelector('.rv-source').textContent.includes('UI 목데이터'));
    assert.ok(report.querySelector('.rv-partial').textContent.includes('결과 없음'));
    d.querySelector('[data-report-dataset="recorded"]').click();
    assert.ok(report.querySelector('.rv-source').textContent.includes('저장된 AI 데모'));
    assert.equal(dom.window.localStorage.getItem(key),'PRIVATE-DRAFT-UNCHANGED');
    assert.ok(!calls.some(url=>url.startsWith('/api/studies')));
  },false);
});

test('signup and logout isolate drafts by authenticated account',async()=>{
  await environment(async({dom,mount})=>{
    let account=null;const calls=[];const password='a!2?';
    globalThis.fetch=async(url,options={})=>{
      const body=options.body?JSON.parse(options.body):undefined;calls.push({url,options,body});let data={},status=200;
      if(url==='/api/auth/me'){data=account||{detail:'로그인이 필요합니다.'};status=account?200:401;}
      else if(url==='/api/auth/register'||url==='/api/auth/login'){account={id:body.email.startsWith('first')?10:20,email:body.email};data=account;}
      else if(url==='/api/auth/logout'){account=null;data={message:'로그아웃했습니다.'};}
      else if(url.endsWith('/capabilities'))data={persona_ready:false,llm_ready:false,provider:'gemini',missing:[]};
      else if(url==='/api/studies')data=[];
      return new Response(JSON.stringify(data),{status});
    };
    mount();const d=dom.window.document;
    await until(()=>d.getElementById('v-login').classList.contains('on'));
    async function authenticate(email,register=true){dom.window.location.hash=register?'#register':'#login';await until(()=>d.getElementById('authSubmit').textContent===(register?'가입하고 시작하기':'로그인'));d.getElementById('authEmail').value=email;d.getElementById('authPassword').value=password;d.getElementById('authConfirm').value=password;d.getElementById('authForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await until(()=>dom.window.location.hash==='#workspace'&&d.getElementById('v-workspace').classList.contains('on'));}
    await authenticate('first@example.com');
    assert.equal(d.querySelector('[data-landing-entry]').getAttribute('href'),'#workspace');
    assert.equal(d.querySelector('[data-landing-entry]').textContent,'내 워크스페이스 →');
    assert.equal(d.querySelector('[data-landing-login]').hidden,true);
    const signup=calls.find(c=>c.url==='/api/auth/register');assert.equal(signup.options.credentials,'same-origin');assert.equal(signup.options.headers['X-Requested-With'],'PersonaLab');
    startNew(d);await until(()=>dom.window.location.hash==='#product'&&d.getElementById('v-product').classList.contains('on'));d.getElementById('pname').value='첫 계정의 초안';d.getElementById('pname').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    dom.window.location.hash='#workspace';await until(()=>d.getElementById('workspaceStudies').textContent.includes('첫 계정의 초안'));
    d.querySelector('[data-auth-logout]').click();await until(()=>dom.window.location.hash==='#login');assert.equal(d.getElementById('pname').value,'');
    assert.equal(d.querySelector('[data-landing-entry]').getAttribute('href'),'#register');
    assert.equal(d.querySelector('[data-landing-entry]').textContent,'회원가입 →');
    assert.equal(d.querySelector('[data-landing-login]').hidden,false);
    await authenticate('second@example.com');assert.ok(!d.getElementById('workspaceStudies').textContent.includes('첫 계정의 초안'));
    d.querySelector('[data-auth-logout]').click();await until(()=>dom.window.location.hash==='#login');await authenticate('first@example.com',false);
    assert.ok(d.getElementById('workspaceStudies').textContent.includes('첫 계정의 초안'));
    const stored=Array.from({length:dom.window.localStorage.length},(_,i)=>dom.window.localStorage.getItem(dom.window.localStorage.key(i))).join('');assert.ok(!stored.includes(password));
  },false);
});

test('expired API session closes workspace and hides private inputs',async()=>{
  await environment(async({dom,mount})=>{
    let expired=false;globalThis.fetch=async(url)=>new Response(JSON.stringify(url==='/api/auth/me'?{id:9,email:'session@example.com'}:url.endsWith('/capabilities')?{persona_ready:false,llm_ready:false,provider:'gemini',missing:[]}:expired?{detail:'로그인이 필요합니다.'}:[]),{status:url==='/api/studies'&&expired?401:200});
    mount();const d=dom.window.document;await until(()=>d.getElementById('engineStatus').textContent.includes('준비 필요'));
    d.getElementById('pname').value='비공개 초안';d.getElementById('pname').dispatchEvent(new dom.window.Event('input',{bubbles:true}));expired=true;dom.window.location.hash='#workspace';
    await until(()=>dom.window.location.hash==='#login');assert.equal(d.getElementById('pname').value,'');assert.ok(d.getElementById('v-login').classList.contains('on'));
  },false);
});

test('late panel response after logout cannot enter another account',async()=>{
  await environment(async({dom,mount})=>{
    let account={id:30,email:'first@example.com'},finishPanel;
    globalThis.fetch=async(url,options={})=>{
      let data={};
      if(url==='/api/auth/me')data=account;
      else if(url==='/api/auth/logout'){account=null;data={message:'로그아웃'};}
      else if(url==='/api/auth/login'){account={id:40,email:'second@example.com'};data=account;}
      else if(url.endsWith('/capabilities'))data={persona_ready:true,llm_ready:true,provider:'gemini',missing:[]};
      else if(url==='/api/studies')data=options.body?{id:42}:[];
      else if(url.endsWith('/panel/generate'))return new Promise(resolve=>{finishPanel=resolve;});
      return new Response(JSON.stringify(data),{status:200});
    };
    mount();const d=dom.window.document;await until(()=>d.getElementById('engineStatus').textContent==='엔진 연결됨');
    for(const[id,value]of Object.entries({pname:'첫 계정의 제품',pdesc:'설명',pfeat:'기능'})){d.getElementById(id).value=value;d.getElementById(id).dispatchEvent(new dom.window.Event('input',{bubbles:true}));}
    registerFixtureScreens(dom);
    d.getElementById('panelSource').value='engine';
    d.getElementById('samplePanel').click();await until(()=>finishPanel);
    d.querySelector('[data-auth-logout]').click();await until(()=>dom.window.location.hash==='#login');
    d.getElementById('authEmail').value='second@example.com';d.getElementById('authPassword').value='long-test-password-2026';d.getElementById('authForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
    await until(()=>dom.window.location.hash==='#workspace');
    finishPanel(new Response(JSON.stringify([{id:7,attributes:{profile:{age:28,job_group:'학생'},card_text:'FIRST-ACCOUNT-PRIVATE-CARD',traits:{},source:{}}}]),{status:200}));
    await new Promise(resolve=>setTimeout(resolve,30));
    assert.ok(!d.getElementById('tickets').textContent.includes('FIRST-ACCOUNT-PRIVATE-CARD'));
    assert.ok(!(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:40')||'').includes('FIRST-ACCOUNT-PRIVATE-CARD'));
  },false);
});

test('entry goes through workspace and new study keeps the previous draft',async()=>{
  await environment(async({dom,mount})=>{
    globalThis.fetch=async(url)=>new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:false,llm_ready:false,provider:'gemini',missing:[]}:[]),{status:200});
    mount(); const d=dom.window.document;
    assert.ok(d.getElementById('authForm'));
    dom.window.location.hash='#workspace';
    await until(()=>d.getElementById('v-workspace').classList.contains('on'));
    assert.ok(d.getElementById('workspaceStudies').textContent.includes('아직 시작한 테스트가 없습니다'));
    startNew(d);
    await until(()=>dom.window.location.hash==='#product');
    d.getElementById('pname').value='보관할 초안';
    d.getElementById('pname').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    dom.window.location.hash='#workspace';
    await until(()=>d.getElementById('workspaceStudies').textContent.includes('보관할 초안'));
    startNew(d);
    await until(()=>dom.window.location.hash==='#product');
    assert.equal(d.getElementById('pname').value,'새 점검');
    dom.window.location.hash='#workspace';
    await until(()=>d.querySelector('.workspace-study-row[data-open-local]'));
    d.querySelector('.workspace-study-row[data-open-local]').click();
    await until(()=>dom.window.location.hash==='#product');
    assert.equal(d.getElementById('pname').value,'보관할 초안');
  });
});

test('workspace opens stored server inputs and results',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];
    globalThis.fetch=async(url)=>{
      calls.push(url); let data={};
      if(url.endsWith('/capabilities')) data={persona_ready:false,llm_ready:false,provider:'gemini',missing:[]};
      else if(url==='/api/studies')data=[{id:12,name:'서버에서 복원한 테스트',status:'draft'}];
      else if(url==='/api/studies/12')data={id:12,name:'서버에서 복원한 테스트',status:'draft',product:{description:'복원 제품\n서버의 제품 설명',features:['캘린더'],price:'무료'},prototype:{screens:[{id:'S1',label:'시작',description:'처음',elements:[{text:'다음',to:'S2'}]},{id:'S2',label:'홈',description:'도착',elements:[]}]},task:{description:'홈으로 이동하세요',goal_screen_id:'S2'},personas:[],runs:[]};
      else if(url.endsWith('/report'))data={study_id:12,results:[],ask_run_id:null,act_run_id:null};
      return new Response(JSON.stringify(data),{status:200});
    };
    mount(); const d=dom.window.document; dom.window.location.hash='#workspace';
    await until(()=>d.querySelector('[data-open-server="12"]'));
    d.querySelector('[data-open-server="12"]').click();
    await until(()=>dom.window.location.hash==='#proto');
    assert.equal(d.getElementById('pname').value,'복원 제품');
    assert.equal(d.getElementById('pdesc').value,'서버의 제품 설명');
    assert.equal(d.getElementById('task').value,'홈으로 이동하세요');
    assert.equal(d.querySelectorAll('#v-run .prototype-phone').length,2);
    assert.ok(calls.includes('/api/studies/12/report'));
  });
});

test('library panel and Act-only flow use stored server responses without planning questions',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];
    const panel=[{id:7,attributes:{profile:{age:28,job_group:'학생'},card_text:'엔진에서 받은 카드',traits:{},source:{persona_id:'ENGINE007',scoring_version:'v-test',library_entry_id:107,library_panel_id:7}}}];
    const ask={usage_intention:2,willingness_to_pay:0,needed_features:['일정 정리'],unneeded_features:[],concern:'PRIVACY',reason:'서버의 실제 형식 응답'};
    const act={path:['S01','S02'],events:[{turn:1,screen:'S01',action:'click',target:'시작하기',to:'S02',reason:'첫 화면 탐색'},{turn:2,screen:'S02',action:'abandon',target:null,to:null,reason:'서버에서 받은 이탈 이유',drop_reason:'PRIVACY'}],end:{result:'drop',screen:'S02',drop_reason:'PRIVACY'}};
    const result=(includeAct)=>[{id:7,persona_id:'ENGINE007',ask:null,act:includeAct?act:null}];
    globalThis.fetch=async(url,options={})=>{
      const body=options.body?JSON.parse(options.body):undefined; calls.push({url,body});
      let data={};
      if(url.endsWith('/capabilities'))data={persona_ready:true,llm_ready:true,provider:'openai',library_ready:true,library_count:400,model:'gpt-5.4-mini',missing:[]};
      else if(url==='/api/studies') data=body?{id:42}:[];
      else if(url==='/api/persona-library/panels')data=[{id:7,panel_key:'panel_univ_n100_seed42',count:100,version_hash:'v1',source_commit:'commit',metadata:{}}];
      else if(url.endsWith('/panel/import'))data=panel;
      else if(url.endsWith('/runs'))data={id:body.mode==='ask'?101:102,status:'pending',progress:0,mode:body.mode};
      else if(url.endsWith('/status'))data={id:url.includes('101')?101:102,status:'done',progress:1};
      else if(url.endsWith('/report'))data={study_id:42,ask_run_id:101,act_run_id:url.includes('101')?null:102,results:result(!url.includes('101'))};
      return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
    };
    mount(); const d=dom.window.document;
    await until(()=>d.getElementById('engineStatus').textContent==='엔진 연결됨');
    for(const[id,value]of Object.entries({pname:'실제 입력 제품',pdesc:'입력한 제품 설명',pfeat:'일정 정리'})){d.getElementById(id).value=value;d.getElementById(id).dispatchEvent(new dom.window.Event('input',{bubbles:true}));}
    registerFixtureScreens(dom);
    d.getElementById('samplePanel').click();
    await until(()=>d.getElementById('tickets').textContent.includes('ENGINE007'));
    assert.deepEqual(calls.find(c=>c.url.endsWith('/panel/import')).body,{panel_id:7,n:30,seed:42});
    assert.ok(!calls.some(c=>c.url.endsWith('/panel/generate')));
    assert.ok(!calls.some(c=>c.url.endsWith('/questions')));
    assert.ok(d.getElementById('tickets').textContent.includes('엔진에서 받은 카드'));
    dom.window.location.hash='#run';
    d.getElementById('startRun').click();
    await until(()=>d.getElementById('liveNotice').textContent.includes('서버에 저장되었습니다'));
    assert.deepEqual(calls.filter(c=>c.url.endsWith('/runs')).map(c=>c.body.mode),['act']);
    assert.ok(calls.some(c=>c.url==='/api/runs/102/report'));
    const report=d.getElementById('liveReport');
    assert.ok(!report.textContent.includes('기획'));
    report.querySelector('[data-rv-tab="coverage"]').click();
    assert.equal([...report.querySelectorAll('tbody tr')].filter(row=>row.children[2].textContent==='방문 없음').length,3);
    report.querySelector('[data-rv-tab="overview"]').click();
    assert.ok(report.textContent.includes('서버에서 받은 이탈 이유'));
    assert.ok(report.textContent.includes('ENGINE007'));
    assert.ok(report.textContent.includes('실제 사용자 응답과 구분'));
    assert.ok(!report.querySelector('h1').textContent.includes('76%'));
    assert.equal(d.querySelectorAll('#v-run .prototype-phone').length,5);
  });
});

test('AI (LLM) runs need the OpenAI-transmission acknowledgement before any run is created',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];
    const panel=[{id:7,attributes:{profile:{age:28,job_group:'학생'},card_text:'엔진에서 받은 카드',traits:{},source:{persona_id:'ENGINE007',scoring_version:'v-test',library_entry_id:107,library_panel_id:7}}}];
    const ask={usage_intention:2,willingness_to_pay:0,needed_features:['일정 정리'],unneeded_features:[],concern:'PRIVACY',reason:'서버의 실제 형식 응답'};
    const act={path:['S01','S02'],events:[{turn:1,screen:'S01',action:'click',target:'시작하기',to:'S02',reason:'첫 화면 탐색'},{turn:2,screen:'S02',action:'abandon',target:null,to:null,reason:'서버에서 받은 이탈 이유',drop_reason:'PRIVACY'}],end:{result:'drop',screen:'S02',drop_reason:'PRIVACY'}};
    const result=(includeAct)=>[{id:7,persona_id:'ENGINE007',ask:null,act:includeAct?act:null}];
    globalThis.fetch=async(url,options={})=>{
      const body=options.body?JSON.parse(options.body):undefined; calls.push({url,body});
      let data={};
      if(url.endsWith('/capabilities'))data={persona_ready:true,llm_ready:true,provider:'openai',agent_engine:'llm',persona_transmission_allowed:true,library_ready:true,library_count:400,model:'gpt-5.4-mini',missing:[]};
      else if(url==='/api/studies') data=body?{id:42}:[];
      else if(url==='/api/persona-library/panels')data=[{id:7,panel_key:'panel_univ_n100_seed42',count:100,version_hash:'v1',source_commit:'commit',metadata:{}}];
      else if(url.endsWith('/panel/import'))data=panel;
      else if(url.endsWith('/runs'))data={id:body.mode==='ask'?101:102,status:'pending',progress:0,mode:body.mode};
      else if(url.endsWith('/status'))data={id:url.includes('101')?101:102,status:'done',progress:1};
      else if(url.endsWith('/report'))data={study_id:42,ask_run_id:101,act_run_id:url.includes('101')?null:102,results:result(!url.includes('101'))};
      return new Response(JSON.stringify(data),{status:200,headers:{'content-type':'application/json'}});
    };
    mount(); const d=dom.window.document;
    await until(()=>d.getElementById('engineStatus').textContent==='엔진 연결됨');
    for(const[id,value]of Object.entries({pname:'실제 입력 제품',pdesc:'입력한 제품 설명',pfeat:'일정 정리'})){d.getElementById(id).value=value;d.getElementById(id).dispatchEvent(new dom.window.Event('input',{bubbles:true}));}
    registerFixtureScreens(dom);
    d.getElementById('samplePanel').click();
    await until(()=>d.getElementById('tickets').textContent.includes('ENGINE007'));
    assert.deepEqual(calls.find(c=>c.url.endsWith('/panel/import')).body,{panel_id:7,n:30,seed:42});
    assert.ok(!calls.some(c=>c.url.endsWith('/panel/generate')));
    assert.ok(!calls.some(c=>c.url.endsWith('/questions')));
    assert.ok(d.getElementById('tickets').textContent.includes('엔진에서 받은 카드'));
    dom.window.location.hash='#run';
    // 확인 체크 없이는 실행이 만들어지지 않고, 무엇이 전송되는지 알려 준다
    assert.equal(d.getElementById('llmNotice').hidden,false);
    d.getElementById('startRun').click();
    await until(()=>d.getElementById('liveNotice').textContent.includes('OpenAI로 전송'));
    assert.ok(!calls.some(c=>c.url.endsWith('/runs')));
    // 확인하면 그때 실행이 시작된다
    d.getElementById('llmConsent').checked=true;
    d.getElementById('startRun').click();
    await until(()=>d.getElementById('liveNotice').textContent.includes('서버에 저장되었습니다'));
    assert.deepEqual(calls.filter(c=>c.url.endsWith('/runs')).map(c=>c.body.mode),['act']);
  });
});

test('deferred card transmission keeps library selection but never queues a run',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];
    globalThis.fetch=async(url,options={})=>{
      calls.push(url);let data={};
      if(url.endsWith('/capabilities'))data={persona_ready:true,llm_ready:true,provider:'openai',model:'gpt-5.4-mini',missing:[],library_ready:true,library_count:400,persona_transmission_allowed:false};
      else if(url==='/api/studies')data=options.body?{id:55}:[];
      else if(url==='/api/persona-library/panels')data=[{id:7,panel_key:'panel_univ_n100_seed42',count:100,metadata:{}}];
      else if(url.endsWith('/panel/import'))data=[{id:9,attributes:{profile:{age:23,job_group:'학생'},card_text:'원본 보관함 카드',traits:{},source:{persona_id:'P004',library_entry_id:4,library_panel_id:7}}}];
      return new Response(JSON.stringify(data),{status:200});
    };
    mount();const d=dom.window.document;
    await until(()=>d.getElementById('engineStatus').textContent.includes('전송 보류'));
    for(const[id,value]of Object.entries({pname:'보류 상태 테스트',pdesc:'테스트 설명',pfeat:'가입'})){
      d.getElementById(id).value=value;d.getElementById(id).dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    }
    registerFixtureScreens(dom);
    d.getElementById('samplePanel').click();
    await until(()=>d.getElementById('tickets').textContent.includes('원본 보관함 카드'));
    assert.equal(d.getElementById('startRun').disabled,true);
    assert.equal(d.getElementById('transmissionStatus').hidden,false);
    dom.window.location.hash='#run';
    d.getElementById('startRun').click();
    await new Promise(resolve=>setTimeout(resolve,20));
    assert.ok(!calls.some(url=>url.endsWith('/runs')));
    assert.ok(calls.some(url=>url.endsWith('/panel/import')));
  });
});

test('public complete demo selects records, replays, interviews and never calls private APIs',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];
    globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify({detail:'로그인이 필요합니다.'}),{status:401});};
    const privateKey='personalab-connected-mockup-v1:user:55';
    dom.window.localStorage.setItem(privateKey,'PRIVATE-DRAFT');
    dom.window.location.hash='#demo';mount();const d=dom.window.document;
    await until(()=>d.getElementById('v-demo').classList.contains('on'));
    const demo=d.getElementById('v-demo');
    assert.ok(demo.textContent.includes('저장된 AI 기록 5명'));
    assert.equal(d.querySelectorAll('#v-demo [aria-current="step"]').length,1);
    demo.querySelector('[data-dm-step="1"]').click();
    demo.querySelector('[data-dm-screen="S02"]').click();
    assert.ok(demo.querySelector('.dm-phone').textContent.includes('휴대폰 번호'));
    demo.querySelector('[data-dm-step="2"]').click();
    const first=demo.querySelector('[data-dm-person="1"]'); first.checked=false;first.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
    assert.ok(demo.querySelector('.dm-panel-summary').textContent.includes('4명 선택'));
    demo.querySelector('[data-dm-step="3"]').click();
    demo.querySelector('[data-dm-play]').click();
    assert.ok(demo.querySelector('.dm-run-evidence').textContent.includes('P069'));
    demo.querySelector('[data-dm-play]').click();
    assert.equal(demo.querySelector('[data-dm-play]').textContent,'이어 재생 ▷');
    demo.querySelector('[data-dm-finish]').click();
    assert.equal(demo.querySelectorAll('.rv-coverage-grid>button').length,5);
    assert.equal(demo.querySelector('.rv-metrics strong').textContent,'4 / 4명');
    demo.querySelector('[data-rv-tab="interview"]').click();
    assert.ok(!demo.querySelector('.rv-interview-context').textContent.includes('P938'));
    demo.querySelector('[data-rv-question="0"]').click();
    assert.ok(demo.querySelector('.rv-messages').textContent.includes('개인정보를 많이'));
    assert.ok(demo.querySelector('.rv-messages').textContent.includes('기록에서 찾은 답변'));
    demo.querySelector('[data-rv-chat-person="3"]').click();
    assert.equal(demo.querySelectorAll('.rv-messages article').length,0);
    demo.querySelector('[data-rv-question="2"]').click();
    assert.ok(demo.querySelector('.rv-messages').textContent.includes('방문하지 않은 화면'));
    demo.querySelector('[data-rv-chat-person="2"]').click();
    assert.ok(demo.querySelector('.rv-messages').textContent.includes('왜 이 화면에서 멈췄나요?'));
    const input=demo.querySelector('[data-rv-input]'); input.value='<img src=x onerror=alert(1)> 앞으로 성공할까요?';
    input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    demo.querySelector('[data-rv-form]').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
    assert.equal(demo.querySelectorAll('.rv-messages img').length,0);
    assert.ok(demo.querySelector('.rv-messages').textContent.includes('새 답변은 생성하지 않습니다'));
    assert.equal(dom.window.localStorage.getItem(privateKey),'PRIVATE-DRAFT');
    assert.ok(!calls.some(url=>url.startsWith('/api/studies')||url.includes('/runs')||url.includes('/persona-library')));
    const saved=JSON.parse(dom.window.localStorage.getItem('personalab-public-demo-v1'));
    assert.equal(saved.step,4);assert.deepEqual(saved.selected,[2,3,4,5]);assert.equal(saved.complete,true);
  },false);
});

test('visual screen editor saves labels and links, rejects duplicate buttons, and removes stale connections',async()=>{
  await environment(async({dom,mount})=>{
    globalThis.fetch=async(url)=>new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:true,llm_ready:true,persona_transmission_allowed:false,provider:'openai',missing:[]}:[]),{status:200});
    dom.window.location.hash='#proto';mount();const d=dom.window.document;
    await until(()=>d.getElementById('v-proto').classList.contains('on'));
    registerFixtureScreens(dom);
    d.getElementById('editScreenLabel').value='처음 만나는 화면';
    d.querySelector('[data-editor-action="save"]').click();
    let screens=JSON.parse(d.getElementById('screenJson').value);
    assert.equal(screens[0].label,'처음 만나는 화면');
    d.querySelector('[data-editor-action="link"]').click();
    d.querySelector('.screen-link-editor:last-child [data-edit-link-text]').value='시작하기';
    d.querySelector('[data-editor-action="save"]').click();
    assert.ok(d.getElementById('liveNotice').textContent.includes('같은 이름'));
    assert.equal(JSON.parse(d.getElementById('screenJson').value)[0].elements.length,1);
    d.querySelector('.screen-link-editor:last-child [data-edit-link-text]').value='다른 버튼';
    d.querySelector('[data-editor-action="save"]').click();
    assert.equal(JSON.parse(d.getElementById('screenJson').value)[0].elements.length,2);
    d.querySelector('[data-edit-screen="S02"]').click();d.querySelector('[data-editor-action="delete"]').click();
    screens=JSON.parse(d.getElementById('screenJson').value);
    assert.equal(screens.length,4);assert.equal(screens[0].elements[0].to,null);
    assert.ok(!screens.some(s=>s.id==='S02'));
    d.querySelector('[data-editor-action="add"]').click();
    screens=JSON.parse(d.getElementById('screenJson').value);assert.equal(screens.length,5);
    assert.equal(new Set(screens.map(s=>s.id)).size,5);
  });
});

test('Figma import replaces sample screens with returned connections without an LLM call',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];
    const screens=[{id:'S01',label:'검색',description:'키워드를 입력하세요',elements:[{text:'검색하기',to:'S02'}]},{id:'S02',label:'검색 결과',description:'결과 목록',elements:[]}];
    globalThis.fetch=async(url,options={})=>{
      calls.push(url); let body=[];
      if(url.endsWith('/capabilities'))body={persona_ready:true,llm_ready:true,persona_transmission_allowed:false,figma_ready:true,provider:'openai',missing:[]};
      else if(url==='/api/studies'&&options.method==='POST')body={id:55};
      else if(url==='/api/studies/55/prototype')body={screens,warnings:['이미지 분석은 포함하지 않습니다.']};
      else if(options.method==='POST')body={};
      return new Response(JSON.stringify(body),{status:200});
    };
    dom.window.location.hash='#proto';mount();const d=dom.window.document;
    await until(()=>d.getElementById('v-proto').classList.contains('on'));
    d.getElementById('pname').value='검색 서비스';d.getElementById('pdesc').value='검색해서 결과를 확인합니다';d.getElementById('pfeat').value='검색';
    d.querySelector('.figma-row input').value='https://www.figma.com/design/ABC123/search';d.querySelector('.figma-row button').click();
    await until(()=>d.getElementById('liveNotice').textContent.includes('2개 화면을 가져왔습니다'));
    assert.equal(JSON.parse(d.getElementById('screenJson').value)[0].label,'검색');assert.equal(d.getElementById('goal').value,'S02');
    assert.ok(d.getElementById('screenEditor').textContent.includes('검색 결과'));assert.ok(!calls.some(url=>url.endsWith('/runs')));
  });
});

test('stored persona summary opens without exposing internal prompts or sending cards to a model',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];
    const persona={id:81,attributes:{profile:{age:42,sex:'여',job_group:'사무직'},card_text:'PRIVATE_RAW_CARD',traits:{raw_score:'PRIVATE_SCORE'},source:{persona_id:'P081',library_entry_id:100}}};
    globalThis.fetch=async(url,options={})=>{
      calls.push(url);let data=[];
      if(url.endsWith('/capabilities'))data={persona_ready:true,llm_ready:true,provider:'openai',persona_transmission_allowed:false,missing:[]};
      else if(url==='/api/studies/55')data={id:55,name:'원본 테스트',product:{description:'제품\n설명',features:['기능'],price:''},prototype:{screens:[{id:'S01',label:'처음',description:'화면 문구',elements:[]}]},task:{description:'둘러보세요',goal_screen_id:'S01'},personas:[persona],runs:[]};
      else if(url==='/api/studies/55/report')data={results:[]};
      else if(url==='/api/studies/55/personas/81/prompt')data={persona_id:81,display_id:'P081',card_text:persona.attributes.card_text,profile:persona.attributes.profile,traits:persona.attributes.traits,screen_id:'S01',system:'실행기와 같은 시스템',contents:['Persona\n'+persona.attributes.card_text,'Task\n둘러보세요'],response_schema:{type:'object'}};
      else if(url==='/api/studies')data=[{id:55,name:'원본 테스트',status:'draft'}];
      return new Response(JSON.stringify(data),{status:200});
    };
    dom.window.location.hash='#workspace';mount();const d=dom.window.document;
    await until(()=>d.querySelector('[data-open-server="55"]'));
    d.querySelector('[data-open-server="55"]').click();
    await until(()=>d.querySelector('[data-persona-prompt="81"]'));
    dom.window.location.hash='#panel';await until(()=>d.getElementById('v-panel').classList.contains('on'));
    d.querySelector('[data-persona-prompt="81"]').click();
    await until(()=>d.querySelector('#personaPromptDetail .persona-public-traits'));
    const panel=d.getElementById('personaPromptDetail');
    assert.equal(panel.hidden,false);assert.ok(panel.textContent.includes('42세'));assert.ok(!panel.textContent.includes('PRIVATE_'));
    assert.equal(panel.querySelector('textarea,[data-prompt-copy],[data-prompt-download],pre'),null);
    assert.ok(panel.querySelector('.persona-profile-portrait').src.includes('mature-female'));
    assert.ok(!calls.some(url=>url.endsWith('/runs')||url.includes('openai.com')));
    panel.querySelector('[data-prompt-close]').click();
    assert.equal(panel.hidden,true);
  });
});

test('stored test opens server results and saves interviews through owned APIs',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[],saved=[];
    const personas=[{id:701,attributes:{profile:{age:21,job_group:'가상 프로필'},card_text:'연결 점검용',traits:{},source:{persona_id:'LC001'}}}];
    const report={source:'local-demo',study_id:77,ask_run_id:null,act_run_id:900,results:[{id:701,persona_id:'LC001',ask:null,act:{path:['LC01','LC02'],events:[{turn:1,screen:'LC01',action:'click',target:'가입',to:'LC02'},{turn:2,screen:'LC02',action:'abandon',target:null,drop_reason:'PRIVACY',reason:'서버에 저장된 점검 원문'}],end:{result:'drop',screen:'LC02',drop_reason:'PRIVACY'}}}]};
    globalThis.fetch=async(url,options={})=>{
      calls.push(url);let data={};
      if(url.endsWith('/capabilities'))data={local_tools_enabled:true,library_ready:true,library_count:400,llm_ready:true,persona_transmission_allowed:false,provider:'openai',missing:[]};
      else if(url==='/api/studies')data=[{id:77,name:'저장된 테스트',status:'done'}];
      else if(url==='/api/persona-library/panels')data=[];
      else if(url==='/api/studies/77')data={id:77,name:'로컬 점검',status:'done',source:'local-demo',product:{description:'점검\n예시 제품',features:['점검'],price:''},prototype:{screens:[{id:'LC01',label:'시작',description:'시작',elements:[{text:'가입',to:'LC02'}]},{id:'LC02',label:'가입 확인',description:'인증 안내',elements:[]}]},task:{description:'가입하기',goal_screen_id:'LC02'},personas,runs:[{id:900,mode:'act',status:'done',progress:1}]};
      else if(url.endsWith('/report'))data=report;
      else if(url.endsWith('/interview')){
        if(options.method==='POST'){const q=JSON.parse(options.body);data={id:saved.length+1,question:q.question,answer:'DB에 저장한 기록 기반 답변',mode:'records',evidence:[{log_id:55,screen_id:'LC02',screen_label:'가입 확인'}],created_at:'2026-11-03T00:00:00Z'};saved.push(data);}
        else data={messages:saved,llm_allowed:false,source:'local-demo'};
      }
      return new Response(JSON.stringify(data),{status:200});
    };
    dom.window.location.hash='#workspace';mount();const d=dom.window.document;
    await until(()=>d.querySelector('[data-open-server="77"]'));
    assert.equal(d.getElementById('localBackendTools'),null);assert.equal(d.querySelector('.ws-demo-link'),null);
    d.querySelector('[data-open-server="77"]').click();await until(()=>d.getElementById('v-report').classList.contains('on'));
    assert.equal(d.getElementById('stepper').hidden,false);
    assert.equal(d.querySelector('.wf-sidebar-settings').hidden,true);
    assert.equal(d.getElementById('newConnectedStudy').hidden,false);
    assert.equal(d.getElementById('workflowProgress').hidden,true);
    const view=d.getElementById('liveReport');assert.ok(view.querySelector('.rv-compact-meta').textContent.includes('로컬 연결 점검'));
    d.querySelector('#stepper a[href="#interview"]').click();await until(()=>view.querySelector('[data-rv-question="0"]')&&!view.querySelector('.rv-chat-loading'));
    view.querySelector('[data-rv-question="0"]').click();await until(()=>view.querySelector('.rv-messages').textContent.includes('DB에 저장한'));
    assert.equal(saved.length,1);assert.ok(view.querySelector('.rv-answer-evidence').textContent.includes('#55'));
    assert.ok(!calls.includes('/api/local/demo'));assert.ok(calls.includes('/api/runs/900/personas/701/interview'));assert.ok(!calls.some(url=>url.endsWith('/runs')));
    await until(()=>dom.window.location.hash==='#interview'&&d.getElementById('v-interview').classList.contains('on'));
    assert.equal(view.parentElement.id,'interviewReportSlot');
    assert.equal(d.querySelector('#stepper [aria-current="page"]').getAttribute('href'),'#interview');
    assert.equal(view.querySelector('[data-rv-mode]'),null);
    view.querySelector('[data-rv-citation="LC02"]').click();
    await until(()=>dom.window.location.hash==='#report'&&d.getElementById('v-report').classList.contains('on'));
    assert.ok(view.querySelector('.rv-selected-evidence h2').textContent.includes('가입 확인'));
    d.querySelector('#stepper a[href="#interview"]').click();
    await until(()=>dom.window.location.hash==='#interview'&&view.querySelector('.rv-messages'));
    assert.ok(view.querySelector('.rv-messages').textContent.includes('DB에 저장한'));

    assert.ok(JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7')).reportSource==='local-demo');
    startNew(d);await until(()=>dom.window.location.hash==='#product'&&d.getElementById('v-product').classList.contains('on'));
    assert.equal(d.getElementById('stepper').hidden,false);
    assert.equal(d.querySelector('.wf-sidebar-settings').hidden,true);
    assert.equal(d.getElementById('newConnectedStudy').hidden,true);
    assert.equal(d.getElementById('workflowProgress').hidden,false);
    assert.equal(d.querySelector('.studio-brand').getAttribute('href'),'#workspace');d.querySelector('.studio-brand').click();await until(()=>d.getElementById('v-workspace').classList.contains('on'));assert.equal(d.getElementById('workspaceBreadcrumb').textContent,'내 테스트');
  });
});
test('sidebar workspace prioritizes running tests and returns home from its logo',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];
    globalThis.fetch=async(url)=>{
      calls.push(url);
      const data=url.endsWith('/capabilities')?{persona_ready:false,llm_ready:false,provider:'gemini',missing:[]}:
        url==='/api/studies'?[{id:51,name:'완료한 테스트',status:'done'},{id:52,name:'실행하는 테스트',status:'running'},{id:53,name:'<img src=x onerror=alert(1)> 초안',status:'draft'}]:[];
      return new Response(JSON.stringify(data),{status:200});
    };
    dom.window.location.hash='#workspace';mount();const d=dom.window.document;
    await until(()=>d.querySelector('.ws-detail [data-open-server="52"]'));
    assert.equal(d.getElementById('workspaceCount').textContent,'3');
    assert.equal(d.querySelector('.ws-detail h2').textContent,'실행하는 테스트');
    assert.ok(d.querySelector('.workspace-topbar [data-create-study]'));
    assert.ok(d.querySelector('#workspaceSideList .ws-it[data-state="done"]'));
    assert.equal(d.querySelector('#workspaceStudies img'),null);
    assert.equal(d.querySelector('.c10-ring'),null); // The list API does not provide a denominator.
    assert.equal(d.querySelector('.c10-counts'),null);
    const search=d.getElementById('workspaceSearch');
    search.value='초안';search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    assert.equal(d.querySelector('.ws-it[data-state="running"]'),null);
    assert.equal(d.querySelectorAll('.ws-it:not(.ws-add)').length,1);
    assert.equal(d.querySelector('.ws-detail [data-open-server]').dataset.openServer,'53');
    assert.ok(d.querySelector('.ws-it:not(.ws-add)').textContent.includes('<img src=x onerror=alert(1)>'));
    search.value='없는 이름';search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    assert.ok(d.querySelector('.ws-empty').textContent.includes('검색 결과가 없습니다'));
    search.value='';search.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    const account=d.querySelector('.c10-account');account.open=true;
    account.querySelector('summary').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));
    assert.equal(account.open,false);
    assert.equal(d.activeElement,account.querySelector('summary'));
    const brand=d.querySelector('.ws-brand');assert.equal(brand.getAttribute('href'),'#workspace');
    d.querySelector('[data-ws-page="library"]').click();assert.equal(d.getElementById('workspace-title').textContent,'페르소나 보관함');
    brand.click();assert.equal(dom.window.location.hash,'#workspace');assert.equal(d.getElementById('workspaceBreadcrumb').textContent,'내 테스트');assert.equal(d.getElementById('workspaceTestsPanel').hidden,false);
    assert.equal(d.querySelector('.workspace-footer a').getAttribute('href'),'#workspace');assert.equal(d.getElementById('workspaceStatus'),null);assert.equal(d.getElementById('liveNotice').parentElement.id,'appNotifications');
    dom.window.location.hash='#landing';
    await until(()=>d.getElementById('v-landing').classList.contains('on'));
    assert.equal(d.querySelectorAll('#v-landing .people-card').length,5);
    assert.equal(d.querySelector('[data-landing-entry]').getAttribute('href'),'#workspace');
    assert.ok(!calls.some(url=>url.includes('/runs')||url.includes('/panel/generate')||url.includes('/interviews')));
  });
});

test('sidebar workspace keeps offline drafts searchable and resumes through the existing editor',async()=>{
  await environment(async({dom,mount})=>{
    globalThis.fetch=async()=>new Response(JSON.stringify({detail:'Server offline'}),{status:503});
    dom.window.location.hash='#workspace';mount();const d=dom.window.document;
    await until(()=>d.querySelector('.workspace-server-note:not(.ws-loading)'));
    startNew(d,'.workspace-topbar [data-create-study]');
    await until(()=>dom.window.location.hash==='#product');
    d.getElementById('pname').value='오프라인 초안';d.getElementById('pname').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    dom.window.location.hash='#workspace';await until(()=>d.querySelector('.ws-detail [data-open-local]'));
    assert.ok(d.querySelector('.ws-it:not(.ws-add)').textContent.includes('오프라인 초안'));
    assert.match(d.querySelector('.ws-sub').textContent,/화면 0개/);
    assert.ok(d.getElementById('workspaceStudies').textContent.includes('서버 목록을 불러오지 못했습니다'));
    d.querySelector('.ws-open').click();await until(()=>dom.window.location.hash==='#product');
    assert.equal(d.getElementById('pname').value,'오프라인 초안');
  });
});
test('sidebar library browses stored cards locally and clears profile details on logout',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];const card={id:107,panel_id:7,source_persona_id:'P701',profile_hash:'fixture',attributes:{profile:{age:21,job_group:'학생',region:'서울',sex:'여'},card_text:'<img src=x onerror=alert(1)> 보관함의 원본 설명',traits:{},source:{}}};
    globalThis.fetch=async(url,options={})=>{calls.push({url,options});let data=[];if(url.endsWith('/capabilities'))data={persona_ready:true,llm_ready:false,provider:'openai',missing:[]};else if(url==='/api/persona-library/panels')data=[{id:7,panel_key:'panel_univ_fixture',version_hash:'v1',source_commit:'fixture',count:13,metadata:{}}];else if(url.startsWith('/api/persona-library/panels/7/personas')){const next=url.endsWith('offset=12');data={total:13,limit:12,offset:next?12:0,items:[{...card,id:next?108:107,source_persona_id:next?'P702':'P701'}]};}else if(url==='/api/auth/logout')data={message:'로그아웃했습니다.'};return new Response(JSON.stringify(data),{status:200});};
    dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
    dom.window.location.hash='#workspace';mount();const d=dom.window.document;
    await until(()=>d.querySelector('.ws-panel-card')||d.getElementById('engineStatus').textContent.includes('서버 연결'));
    d.querySelector('[data-ws-toggle]').click();assert.equal(d.querySelector('[data-ws-toggle]').getAttribute('aria-expanded'),'true');assert.equal(d.querySelector('.ws-sidebar-backdrop').hidden,false);
    d.querySelector('[data-ws-page="library"]').click();await until(()=>d.querySelector('[data-ws-panel="7"]'));assert.equal(d.querySelector('[data-ws-toggle]').getAttribute('aria-expanded'),'false');
    assert.equal(d.getElementById('workspace-title').textContent,'페르소나 보관함');assert.equal(d.querySelector('[data-ws-page="library"]').getAttribute('aria-current'),'page');
    d.querySelector('[data-ws-panel="7"]').click();await until(()=>d.querySelector('[data-ws-person="107"]'));
    d.querySelector('[data-ws-person="107"]').click();assert.equal(d.getElementById('workspacePersonaDialog').open,true);assert.equal(d.querySelector('#workspacePersonaContents img'),null);assert.ok(d.getElementById('workspacePersonaContents').textContent.includes('원본 설명'));
    d.querySelector('[data-ws-person-close]').click();d.querySelector('[data-ws-offset="12"]').click();await until(()=>d.querySelector('[data-ws-person="108"]'));
    d.querySelector('[data-ws-person="108"]').click();d.querySelector('[data-auth-logout]').click();await until(()=>d.getElementById('v-login').classList.contains('on'));
    assert.equal(d.getElementById('workspacePersonaDialog').open,false);assert.equal(d.getElementById('workspacePersonaContents').textContent,'');assert.equal(d.getElementById('workspaceLibraryContents').textContent,'');
    assert.ok(!calls.some(c=>c.url.includes('/panel/import')||c.url.includes('/panel/generate')||c.url.includes('/runs')));
  });
});

test('sidebar run history opens the selected Act run rather than the newest one',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];const persona={id:7,attributes:{profile:{age:28,job_group:'학생'},card_text:'검증용 가상 프로필',traits:{},source:{}}};
    const result={id:7,persona_id:'P007',ask:null,act:{path:['S1','S2'],events:[{turn:1,screen:'S1',action:'click',target:'다음',to:'S2',reason:'검증용 기록'}],end:{result:'complete',screen:'S2'}}};
    globalThis.fetch=async(url)=>{calls.push(url);let data=[];if(url.endsWith('/capabilities'))data={persona_ready:false,llm_ready:false,provider:'openai',missing:[]};else if(url==='/api/studies')data=[{id:12,name:'보관한 UI 테스트',status:'done'}];else if(url==='/api/studies/12')data={id:12,name:'보관한 UI 테스트',status:'done',source:'live',product:{description:'복원 제품\n입력 화면 검토',features:['입력'],price:'무료'},prototype:{screens:[{id:'S1',label:'시작',description:'처음',elements:[{text:'다음',to:'S2'}]},{id:'S2',label:'완료',description:'마지막',elements:[]}]},task:{description:'완료 화면으로 가세요',goal_screen_id:'S2'},personas:[persona],runs:[{id:102,mode:'act',status:'done',progress:1},{id:101,mode:'act',status:'done',progress:1},{id:100,mode:'ask',status:'done',progress:1}]};else if(url.endsWith('/report'))data={study_id:12,results:[result],ask_run_id:null,act_run_id:url.includes('/101/')?101:102};return new Response(JSON.stringify(data),{status:200});};
    dom.window.location.hash='#workspace';mount();const d=dom.window.document;await until(()=>d.querySelector('[data-open-server="12"]'));
    d.querySelector('[data-ws-page="history"]').click();await until(()=>d.querySelectorAll('.ws-history-row').length===2);
    assert.equal(d.querySelector('[data-ws-run="100"]'),null);const before=calls.length;d.querySelector('[data-ws-run="101"]').click();await until(()=>dom.window.location.hash==='#report');
    assert.equal(JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7')).runs.act,101);assert.ok(calls.includes('/api/runs/101/report'));assert.ok(!calls.slice(before).includes('/api/runs/102/report'));
  });
});

test('late library page response after logout cannot restore private cards',async()=>{
  await environment(async({dom,mount})=>{
    let finish;
    globalThis.fetch=async(url)=>{if(url.startsWith('/api/persona-library/panels/7/personas'))return await new Promise(resolve=>{finish=resolve;});const data=url.endsWith('/capabilities')?{persona_ready:false,llm_ready:false,provider:'openai',missing:[]}:url==='/api/persona-library/panels'?[{id:7,panel_key:'panel_univ_fixture',version_hash:'v1',source_commit:'fixture',count:1,metadata:{}}]:[];return new Response(JSON.stringify(data),{status:200});};
    dom.window.location.hash='#workspace';mount();const d=dom.window.document;await until(()=>d.getElementById('engineStatus').textContent.includes('서버 연결'));
    d.querySelector('[data-ws-page="library"]').click();await until(()=>d.querySelector('[data-ws-panel="7"]'));d.querySelector('[data-ws-panel="7"]').click();await until(()=>finish);
    d.querySelector('[data-auth-logout]').click();await until(()=>d.getElementById('v-login').classList.contains('on'));
    finish(new Response(JSON.stringify({total:1,limit:12,offset:0,items:[{id:707,panel_id:7,source_persona_id:'P-PRIVATE',profile_hash:'fixture',attributes:{profile:{age:30,job_group:'직장인'},card_text:'PRIVATE-LATE-CARD',traits:{},source:{}}}]}),{status:200}));await new Promise(resolve=>setTimeout(resolve,30));
    assert.ok(!d.getElementById('v-workspace').textContent.includes('PRIVATE-LATE-CARD'));assert.equal(d.getElementById('workspaceLibraryContents').textContent,'');
  });
});

test('new test starts empty and exposes six separate setup pages',async()=>{
  await environment(async({dom,mount})=>{
    globalThis.fetch=async(url)=>new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:true,llm_ready:false,workflow_ready:true,missing:[]}:[]));
    mount();const d=dom.window.document;await until(()=>d.getElementById('engineStatus').textContent.includes('서버 연결'));
    startNew(d);await until(()=>dom.window.location.hash==='#product'&&d.getElementById('v-product').classList.contains('on'));
    assert.deepEqual(JSON.parse(d.getElementById('screenJson').value),[]);
    assert.equal(d.querySelector('[data-source-tab="web"]').getAttribute('aria-pressed'),'true');
    assert.equal(d.querySelectorAll('#workflowProgress a').length,6);
    assert.deepEqual([...d.querySelectorAll('#stepper a')].map(a=>a.getAttribute('href')),['#product','#run','#report','#interview']);
    assert.ok(!d.getElementById('sourcePreview').textContent.includes('일정메이트'));
    assert.equal(d.getElementById('stepper').hidden,false);
    assert.equal(d.querySelector('.wf-sidebar-settings').hidden,true);
    assert.equal(d.getElementById('newConnectedStudy').hidden,true);
    assert.equal(d.getElementById('workflowProgress').hidden,false);
    assert.equal(d.querySelector('#workflowProgress [aria-current="step"]').getAttribute('href'),'#product');
  });
});

test('URL source persists scope and opens a grouped revision without fabricating results',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];let scope={mode:'general',focus:'',goal_url:'https://example.com/done',goal_text:'',viewport:'desktop',scenario:'완료 화면 살펴보기'};
    const source={kind:'web',url:'https://example.com',title:'연결된 웹',suggestions:[{name:'완료 화면 살펴보기',url:'https://example.com/done'}]};
    const screens=[{id:'W1',label:'처음',description:'관찰한 화면',elements:[{text:'다음',to:null}]}];
    globalThis.fetch=async(url,options={})=>{calls.push({url,body:options.body&&JSON.parse(options.body)});let data=[];
      if(url.endsWith('/capabilities'))data={workflow_ready:true,browser_ready:true,persona_ready:true,llm_ready:false,persona_transmission_allowed:false,missing:[]};
      else if(url==='/api/studies')data=options.body?{id:71}:[];
      else if(url==='/api/studies/71/sources/web'){scope={...scope,goal_url:'https://example.com/done',scenario:'완료 화면 살펴보기'};data={study_id:71,root_study_id:71,revision:1,source,scope,screens};}
      else if(url==='/api/studies/71/workflow'){if(options.body)scope=JSON.parse(options.body).scope;data={study_id:71,root_study_id:71,revision:1,source,scope};}
      else if(url==='/api/studies/71/revisions')data=options.body?{id:72}:[{study_id:71,revision:1,name:'연결된 웹',status:'draft',runs:[]}];
      else if(url==='/api/studies/72')data={id:72,name:'연결된 웹',status:'draft',product:{description:'연결된 웹\n사용 흐름',features:['탐색'],price:''},prototype:{screens},task:{description:'완료 화면 살펴보기',goal_screen_id:'__browser_goal__'},personas:[],runs:[]};
      else if(url==='/api/studies/72/workflow')data={study_id:72,root_study_id:71,revision:2,source,scope};
      else if(url.endsWith('/report'))data={results:[],act_run_id:null};
      return new Response(JSON.stringify(data));};
    mount();const d=dom.window.document;await until(()=>d.getElementById('engineStatus').textContent.includes('서버 연결'));
    startNew(d,undefined,'연결된 웹');await until(()=>dom.window.location.hash==='#product'&&d.getElementById('v-product').classList.contains('on'));
    d.getElementById('sourceUrl').value='https://example.com';d.getElementById('connectWeb').click();
    await until(()=>d.getElementById('sourcePreview').textContent.includes('연결된 웹'));
    assert.equal(d.getElementById('pname').value,'연결된 웹');
    assert.equal(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7:step:server:71'),'product');
    d.querySelector('#v-product [data-step-next]').click();await until(()=>dom.window.location.hash==='#source-review'&&d.getElementById('v-source-review').classList.contains('on'));d.getElementById('sourceReviewContinue').click();await until(()=>dom.window.location.hash==='#panel');
    const connectedDraft=JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'));
    assert.equal(connectedDraft.workflow.source.url,'https://example.com');assert.equal(connectedDraft.workflow.scope.goal_url,'https://example.com/done');
    // 범위 설정은 자기 페이지 뒤에 저장한다. 연결 전에는 앱·웹 소속과 테스트 이름만 한 번 먼저 저장한다.
    const early=calls.filter(c=>c.url==='/api/studies/71/workflow'&&c.body);
    assert.equal(early.length,1);assert.ok(early[0].body.scope.product_id);assert.equal(early[0].body.scope.test_title,'전반 탐색');
    assert.ok(calls.indexOf(early[0])<calls.findIndex(c=>c.url==='/api/studies/71/sources/web'));
    assert.ok(!calls.some(c=>c.url.endsWith('/prototype/manual')));
    d.getElementById('scopeFocus').value='안내가 충분한지';d.getElementById('scopeFocus').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    d.getElementById('newConnectedStudy').click();
    assert.equal(d.getElementById('newTestDialog').open,true);assert.equal(d.getElementById('newTestNameField').hidden,true);
    d.getElementById('newTestNote').value='  가입 단계 개선 v2  ';
    d.getElementById('newTestForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true,bubbles:true}));
    await until(()=>calls.some(c=>c.url==='/api/studies/71/revisions'&&c.body));
    assert.equal(calls.find(c=>c.url==='/api/studies/71/revisions'&&c.body).body.note,'가입 단계 개선 v2');
    await until(()=>d.getElementById('studioTestName').textContent==='연결된 웹'&&dom.window.location.hash==='#product');
    const saved=JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'));
    assert.equal(saved.workflow.root_study_id,71);assert.equal(saved.workflow.revision,2);assert.deepEqual(saved.results,[]);
  });
});


function submitManagement(dom,value){
  const d=dom.window.document,input=d.getElementById('workspaceManageInput');if(input&&value!==undefined)input.value=value;
  d.getElementById('workspaceManageForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
}

test('workspace management persists rename, group trash, restore and permanent removal without ghost caches',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];let state={display_name:null,archived:false,trashed:false},removed=false;
    globalThis.fetch=async(url,options={})=>{
      const body=options.body&&JSON.parse(options.body);calls.push({url,body});let data=[];
      if(url.endsWith('/capabilities'))data={workspace_management_ready:true,persona_ready:true,llm_ready:false,missing:[]};
      else if(url.startsWith('/api/studies?'))data=removed?[]:[{id:41,name:'원본 이름',status:'draft',root_study_id:41,revision:1,workspace:state},{id:42,name:'원본 이름',status:'draft',root_study_id:41,revision:2,workspace:state}];
      else if(url==='/api/studies/42')data={id:42,name:'원본 이름',status:'draft',workspace:state,product:{description:'대상 이름\n제품 설명',features:['이동'],price:''},prototype:{screens:[]},personas:[],runs:[]};
      else if(url.endsWith('/report'))data={results:[]};
      else if(url.endsWith('/manage')){if(body.action==='rename')state={...state,display_name:body.name};if(body.action==='trash')state={...state,trashed:true};if(body.action==='restore')state={...state,trashed:false,archived:false};if(body.action==='archive')state={...state,archived:true};if(body.action==='delete')removed=true;data={root_study_id:41,affected_study_ids:[41,42],workspace:state,deleted:removed};}
      return new Response(JSON.stringify(data));
    };
    dom.window.location.hash='#workspace';mount();const d=dom.window.document;await until(()=>d.querySelector('[data-open-server="42"]'));
    d.querySelector('[data-open-server="42"]').click();await until(()=>dom.window.location.hash==='#product');dom.window.location.hash='#workspace';await until(()=>d.getElementById('v-workspace').classList.contains('on'));
    const act=(op)=>d.querySelector(`.ws-it [data-wm-action="${op}"]`).click();
    act('rename');submitManagement(dom,'새 관리 이름');await until(()=>d.querySelector('.ws-detail h2').textContent==='새 관리 이름');
    assert.ok(!calls.some(c=>c.url.endsWith('/product')));
    act('archive');submitManagement(dom);await until(()=>!d.querySelector('.ws-it:not(.ws-add)'));
    d.querySelector('[data-wm-view="archived"]').click();assert.ok(d.querySelector('.ws-it:not(.ws-add)').textContent.includes('새 관리 이름'));
    act('trash');submitManagement(dom);await until(()=>!d.querySelector('.ws-it:not(.ws-add)'));
    d.querySelector('[data-wm-view="trash"]').click();assert.ok(d.querySelector('.ws-it:not(.ws-add)'));assert.equal(d.querySelector('.ws-open'),null);
    act('restore');submitManagement(dom);await until(()=>!d.querySelector('.ws-it:not(.ws-add)'));
    d.querySelector('[data-wm-view="active"]').click();assert.ok(d.querySelector('.ws-it:not(.ws-add)'));
    act('trash');submitManagement(dom);await until(()=>!d.querySelector('.ws-it:not(.ws-add)'));d.querySelector('[data-wm-view="trash"]').click();
    act('delete');submitManagement(dom,'다른 이름');assert.ok(d.getElementById('workspaceManageError').textContent.includes('정확히'));assert.ok(!calls.some(c=>c.body?.action==='delete'));
    submitManagement(dom,'새 관리 이름');await until(()=>removed&&!d.querySelector('.ws-it:not(.ws-add)'));
    d.querySelector('[data-wm-refresh]').click();await new Promise(r=>setTimeout(r,30));d.querySelector('[data-wm-view="active"]').click();assert.equal(d.querySelector('.ws-it:not(.ws-add)'),null);
    const stored=[JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7')),...JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7:history'))];
    assert.ok(stored.every(s=>![41,42].includes(s.serverId)));
  });
});

test('management API failure keeps the card and provides a retryable dialog',async()=>{
  await environment(async({dom,mount})=>{
    let failures=0;
    globalThis.fetch=async(url)=>{
      if(url.endsWith('/manage')){failures++;return new Response(JSON.stringify({detail:'실행 중인 회차가 있습니다.'}),{status:409});}
      const data=url.endsWith('/capabilities')?{workspace_management_ready:true,persona_ready:true,llm_ready:false,missing:[]}:url.startsWith('/api/studies?')?[{id:55,name:'실행 중 테스트',status:'running'}]:[];
      return new Response(JSON.stringify(data));
    };
    dom.window.location.hash='#workspace';mount();const d=dom.window.document;await until(()=>d.querySelector('[data-wm-action="trash"]'));
    d.querySelector('[data-wm-action="trash"]').click();submitManagement(dom);await until(()=>d.getElementById('workspaceManageError').textContent.includes('실행 중'));
    assert.equal(d.getElementById('workspaceManageSubmit').disabled,false);assert.equal(d.querySelectorAll('.ws-it:not(.ws-add)').length,1);assert.equal(d.getElementById('workspaceToast').hidden,true);assert.equal(failures,1);
    d.querySelector('[data-wm-close]').click();assert.equal(d.getElementById('workspaceManageDialog').open,false);
  });
});

test('offline drafts support duplication, trash and restore with account-scoped persistence',async()=>{
  await environment(async({dom,mount})=>{
    globalThis.fetch=async()=>new Response(JSON.stringify({detail:'offline'}),{status:503});
    dom.window.location.hash='#workspace';mount();const d=dom.window.document;await until(()=>d.querySelector('.workspace-server-note:not(.ws-loading)'));
    startNew(d);await until(()=>dom.window.location.hash==='#product'&&d.getElementById('v-product').classList.contains('on'));d.getElementById('pname').value='로컬 초안';d.getElementById('pname').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    dom.window.location.hash='#workspace';await until(()=>d.querySelector('[data-wm-action="duplicate"]'));
    d.querySelector('[data-wm-action="duplicate"]').click();submitManagement(dom);await until(()=>dom.window.location.hash==='#product');assert.equal(d.getElementById('studioTestName').textContent,'로컬 초안 복사본');
    dom.window.location.hash='#workspace';await until(()=>d.querySelectorAll('.ws-it:not(.ws-add)').length===2);
    const original=[...d.querySelectorAll('.ws-it:not(.ws-add)')].find(c=>c.querySelector('.ws-it-name').firstChild.textContent==='로컬 초안');original.querySelector('[data-wm-action="trash"]').click();submitManagement(dom);await until(()=>d.querySelectorAll('.ws-it:not(.ws-add)').length===1);
    d.querySelector('[data-wm-view="trash"]').click();assert.equal(d.querySelector('.ws-detail h2').textContent,'로컬 초안');d.querySelector('.ws-it [data-wm-action="restore"]').click();submitManagement(dom);await until(()=>!d.querySelector('.ws-it:not(.ws-add)'));
    d.querySelector('[data-wm-view="active"]').click();assert.equal(d.querySelectorAll('.ws-it:not(.ws-add)').length,2);
    d.getElementById('workspaceFilter').value='done';d.getElementById('workspaceFilter').dispatchEvent(new dom.window.Event('change'));assert.ok(d.querySelector('[data-wm-reset]'));d.querySelector('[data-wm-reset]').click();assert.equal(d.querySelectorAll('.ws-it:not(.ws-add)').length,2);
  });
});

test('late management response cannot repopulate content after logout',async()=>{
  await environment(async({dom,mount})=>{
    let finish;
    globalThis.fetch=async(url)=>{
      if(url.endsWith('/manage'))return await new Promise(resolve=>finish=resolve);
      const data=url.endsWith('/capabilities')?{workspace_management_ready:true,persona_ready:true,llm_ready:false,missing:[]}:url.startsWith('/api/studies?')?[{id:88,name:'비공개 테스트',status:'draft'}]:[];
      return new Response(JSON.stringify(data));
    };
    dom.window.location.hash='#workspace';mount();const d=dom.window.document;await until(()=>d.querySelector('[data-wm-action="rename"]'));
    d.querySelector('[data-wm-action="rename"]').click();submitManagement(dom,'PRIVATE LATE NAME');await until(()=>finish);
    dom.window.dispatchEvent(new dom.window.CustomEvent('personalab:session-expired'));await until(()=>d.getElementById('v-login').classList.contains('on'));
    finish(new Response(JSON.stringify({root_study_id:88,affected_study_ids:[88],workspace:{display_name:'PRIVATE LATE NAME'},deleted:false})));await new Promise(r=>setTimeout(r,30));
    assert.equal(d.getElementById('workspaceManageDialog').textContent,'');assert.equal(d.getElementById('workspaceToast').textContent,'');assert.ok(!d.getElementById('workspaceStudies').textContent.includes('PRIVATE LATE NAME'));
  });
});


const audienceCards=Array.from({length:4},(_,i)=>({id:400+i,panel_id:7,source_persona_id:`X${i}`,profile_hash:`p${i}`,attributes:{profile:{age:25+i,job_group:'디자이너',region:'제주'},card_text:`<script>unsafe</script> 원본 카드 ${i} 예약 앱 사용`,traits:{digital:'중간'},source:{persona_id:`X${i}`,library_entry_id:400+i}}}));
function audienceFetch(calls){let scope={product_kind:'web',mode:'general',focus:'',goal_url:'',goal_text:'',viewport:'desktop',scenario:''};return async(url,options={})=>{const body=options.body?JSON.parse(options.body):null;calls.push({url,body});let data=[];
 if(url.endsWith('/capabilities'))data={audience_builder_ready:true,workflow_ready:true,persona_ready:true,llm_ready:false,persona_transmission_allowed:false,provider:'openai',missing:[]};
 else if(url.endsWith('/audience/facets'))data={total:4,jobs:['디자이너'],regions:['제주'],digital:['중간'],age_min:25,age_max:28,max_selection:100};
 else if(url.endsWith('/audience/search'))data={total:4,duplicates_excluded:0,items:audienceCards};
 else if(url.endsWith('/audience/recommend'))data={total:4,requested_count:body.count,items:audienceCards.slice(0,body.count)};
 else if(url==='/api/studies'&&body)data={id:51};
 else if(url.endsWith('/workflow')){if(body)scope=body.scope;data={study_id:51,root_study_id:51,revision:1,source:{kind:'manual'},scope};}
 else if(url.endsWith('/panel/select')){scope.audience=body.audience;data=audienceCards.filter(p=>body.audience.entry_ids.includes(p.id)).map(p=>({id:p.id,attributes:p.attributes}));}
 else if(url==='/api/auth/logout')data={message:'로그아웃'};
 return new Response(JSON.stringify(data),{status:200});};}

test('customer audience searches across cards and explicitly selects, replaces, persists criteria',async()=>{
 await environment(async({dom,mount})=>{const calls=[];globalThis.fetch=audienceFetch(calls);mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);
 assert.equal(d.getElementById('legacyPanelSetup').hidden,true);assert.equal(d.getElementById('audienceBuilder').hidden,false);assert.equal(d.querySelector('#audienceBuilder script'),null);
 assert.equal(d.getElementById('audienceAgeMin').value,'');assert.equal(d.querySelector('[data-audience-filter="jobs"]').checked,false);
 registerFixtureScreens(dom);d.getElementById('pname').value='예약 앱';d.getElementById('pdesc').value='예약을 확인하는 제품';
 d.getElementById('audienceDescription').value='예약 서비스를 이용하는 디자이너';d.getElementById('audienceDescription').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 d.getElementById('audienceContext').value='이동 중 휴대폰으로';d.getElementById('audienceContext').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 d.getElementById('audienceCount').value='2';d.querySelector('[data-audience-action="auto"]').click();await until(()=>d.getElementById('audienceSelectedCount').textContent==='2');
 assert.equal(d.querySelector('[data-audience-remove]'),null);
 d.querySelector('[data-audience-replace="400"]').click();await until(()=>!d.querySelector('[data-audience-replace="400"]'));assert.equal(d.getElementById('audienceSelectedCount').textContent,'2');
 d.querySelector('[data-audience-action="apply"]').click();await until(()=>calls.some(c=>c.url.endsWith('/panel/select')));await until(()=>d.getElementById('audienceSaveState').textContent.includes('저장된 구성'));
 const body=calls.find(c=>c.url.endsWith('/panel/select')).body.audience;assert.equal(body.entry_ids.length,2);assert.ok(body.entry_ids.includes(401)&&!body.entry_ids.includes(400));assert.equal(body.context,'이동 중 휴대폰으로');assert.deepEqual(body.filters.jobs,[]);
 const saved=JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'));assert.equal(saved.workflow.scope.audience.description,'예약 서비스를 이용하는 디자이너');assert.equal(saved.personas.length,2);assert.equal(saved.audienceDraft,undefined);
 assert.ok(!calls.some(c=>c.url.includes('/panel/import')||c.url.includes('/panel/generate')||c.url.includes('/runs')));
 });
});

test('customer audience blocks insufficient selection and unsaved configuration without model calls',async()=>{
 await environment(async({dom,mount})=>{const calls=[];globalThis.fetch=audienceFetch(calls);mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);
 registerFixtureScreens(dom);dom.window.location.hash='#panel';await until(()=>d.getElementById('v-panel').classList.contains('on'));
 d.getElementById('audienceCount').value='20';d.querySelector('[data-audience-action="auto"]').click();await until(()=>d.getElementById('audienceError').textContent.includes('4명만'));
 assert.equal(d.getElementById('audienceSelectedCount').textContent,'0');assert.ok(!calls.some(c=>c.url.endsWith('/panel/select')));
 d.getElementById('audienceDescription').value='직접 입력한 대상';d.getElementById('audienceDescription').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 dom.window.location.hash='#run';await until(()=>d.getElementById('liveNotice').textContent.includes('먼저 저장'));assert.equal(dom.window.location.hash,'#panel');assert.ok(d.getElementById('liveNotice').textContent.includes('아직 열 수 없어요'));
 });
});

test('native product setup uses mobile prototype flow and preserves kind when editing screens',async()=>{
 await environment(async({dom,mount})=>{const calls=[];globalThis.fetch=audienceFetch(calls);dom.window.location.hash='#product';mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);
 const ios=d.querySelector('[name="productKind"][value="ios"]');ios.checked=true;ios.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
 assert.equal(d.querySelector('[data-source-tab="web"]').hidden,false);assert.equal(d.querySelector('[data-source-tab="html"]').hidden,false);assert.ok(d.getElementById('productKindNote').textContent.includes('설치 앱'));
 d.querySelector('[data-source-tab="html"]').click();assert.equal(d.getElementById('sourceHtml').hidden,false);
 d.querySelector('[data-source-tab="figma"]').click();assert.equal(d.getElementById('sourceFigma').hidden,false);
 registerFixtureScreens(dom);const saved=JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'));assert.equal(saved.workflow.scope.product_kind,'ios');assert.equal(saved.workflow.scope.viewport,'mobile');assert.ok(d.getElementById('editScreenImage'));
 });
});


test('late audience lookup after logout cannot restore private candidates',async()=>{
 await environment(async({dom,mount})=>{const calls=[];const normal=audienceFetch(calls);let finish;
 globalThis.fetch=(url,options)=>url.endsWith('/audience/search')?new Promise(resolve=>{finish=resolve;}):normal(url,options);
 mount();const d=dom.window.document;await until(()=>finish);d.querySelector('[data-auth-logout]').click();await until(()=>dom.window.location.hash==='#login');
 finish(new Response(JSON.stringify({total:4,duplicates_excluded:0,items:audienceCards}),{status:200}));await new Promise(resolve=>setTimeout(resolve,25));
 assert.equal(d.querySelectorAll('.ab-person').length,0);assert.ok(!d.getElementById('audienceBuilder').textContent.includes('원본 카드'));
 });
});


test('app screen image upload, replacement and removal persist in the screen editor',async()=>{
 const previous=globalThis.FileReader;
 try{await environment(async({dom,mount})=>{globalThis.FileReader=dom.window.FileReader;const calls=[];globalThis.fetch=audienceFetch(calls);mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);registerFixtureScreens(dom);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6B9sAAAAASUVORK5CYII=','base64');
 const upload=()=>{const input=d.getElementById('editScreenImage');Object.defineProperty(input,'files',{value:[new dom.window.File([png],'screen.png',{type:'image/png'})]});input.dispatchEvent(new dom.window.Event('change',{bubbles:true}));};
 upload();await until(()=>d.querySelector('.screen-image-editor img'));let saved=JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'));assert.ok(saved.screens[0].image.startsWith('data:image/png;base64,'));
 d.querySelector('[data-editor-action="remove-image"]').click();await until(()=>!d.querySelector('.screen-image-editor img'));saved=JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'));assert.equal(saved.screens[0].image,undefined);
 upload();await until(()=>d.querySelector('.screen-image-editor img'));assert.ok(!calls.some(c=>c.url.includes('/runs')));
 });}finally{if(previous===undefined)delete globalThis.FileReader;else globalThis.FileReader=previous;}
});


test('audience wizard shows one page at a time and saves exact cards before scope',async()=>{
 await environment(async({dom,mount})=>{const calls=[];globalThis.fetch=audienceFetch(calls);mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);
 registerFixtureScreens(dom);dom.window.location.hash='#panel';await until(()=>d.getElementById('v-panel').classList.contains('on'));
 assert.equal(d.querySelectorAll('#workflowProgress a').length,6);assert.equal(d.getElementById('audienceDefinition').hidden,false);assert.equal(d.querySelector('.ab-persona-browser').hidden,true);assert.equal(d.getElementById('workflowScope').hidden,true);
 d.getElementById('panelContinue').click();assert.equal(d.activeElement.id,'audienceDescription');assert.equal(dom.window.location.hash,'#panel');
 d.getElementById('audienceDescription').value='예약을 확인하는 디자이너';d.getElementById('audienceDescription').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 d.getElementById('panelContinue').click();await until(()=>dom.window.location.hash==='#personas');await until(()=>d.getElementById('audienceDefinition').hidden);
 assert.equal(d.querySelector('.ab-persona-browser').hidden,false);assert.equal(d.getElementById('workflowScope').hidden,true);assert.equal(d.querySelector('#workflowProgress a[href="#personas"]').getAttribute('aria-current'),'step');
 d.querySelector('[data-audience-pick="401"]').click();d.querySelector('[data-audience-pick="403"]').click();assert.ok(d.getElementById('panelActionSelection').textContent.includes('2명'));
 d.getElementById('panelContinue').click();await until(()=>dom.window.location.hash==='#scope');await until(()=>d.getElementById('audienceBuilder').hidden);
 assert.equal(d.getElementById('workflowScope').hidden,false);assert.equal(d.getElementById('panelBackLink').getAttribute('href'),'#personas');
 const selections=calls.filter(c=>c.url.endsWith('/panel/select'));assert.equal(selections.length,1);assert.deepEqual(selections[0].body.audience.entry_ids,[401,403]);
 d.getElementById('panelContinue').click();await until(()=>dom.window.location.hash==='#run');
 const saved=JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'));assert.equal(saved.personas.length,2);assert.equal(saved.audienceDraft,undefined);assert.ok(!calls.some(c=>c.url.endsWith('/runs')));
 });
});


test('wizard blocks missing description and retains persona choices on save failure',async()=>{
 await environment(async({dom,mount})=>{const calls=[];const normal=audienceFetch(calls);globalThis.fetch=(url,options)=>url.endsWith('/panel/select')?Promise.resolve(new Response(JSON.stringify({detail:'저장 연결 실패'}),{status:503})):normal(url,options);mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);
 registerFixtureScreens(dom);dom.window.location.hash='#panel';await until(()=>d.getElementById('v-panel').classList.contains('on'));
 d.getElementById('panelContinue').click();await until(()=>d.getElementById('audienceError').textContent.includes('한두 문장'));assert.equal(d.activeElement.id,'audienceDescription');assert.equal(dom.window.location.hash,'#panel');
 d.getElementById('audienceDescription').value='직접 고른 사용자';d.getElementById('audienceDescription').dispatchEvent(new dom.window.Event('input',{bubbles:true}));d.getElementById('panelContinue').click();await until(()=>dom.window.location.hash==='#personas');
 d.querySelector('[data-audience-pick="400"]').click();d.getElementById('panelContinue').click();await until(()=>d.getElementById('audienceError').textContent.includes('저장 연결 실패'));assert.equal(dom.window.location.hash,'#personas');assert.equal(d.getElementById('panelContinue').disabled,false);assert.equal(d.getElementById('audienceDescription').value,'직접 고른 사용자');assert.equal(d.getElementById('audienceSelectedCount').textContent,'1');
 });
});


test('Android URL connection transmits product kind and mobile viewport and keeps source options',async()=>{
 await environment(async({dom,mount})=>{const calls=[];const normal=audienceFetch(calls);globalThis.fetch=async(url,options={})=>{
 if(url.endsWith('/sources/web')){const body=JSON.parse(options.body);calls.push({url,body});return new Response(JSON.stringify({study_id:51,root_study_id:51,revision:1,source:{kind:'web',url:body.url,title:'앱 프로토타입',suggestions:[]},scope:{product_kind:body.product_kind,viewport:body.viewport,mode:'general',focus:'',goal_url:'',goal_text:'',scenario:''},screens:[{id:'W1',label:'앱 시작',description:'버튼',elements:[]}]}));}
 return normal(url,options);
 };dom.window.location.hash='#product';mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);
 const android=d.querySelector('[name="productKind"][value="android"]');android.checked=true;android.dispatchEvent(new dom.window.Event('change',{bubbles:true}));d.getElementById('sourceUrl').value='https://example.com/app';d.getElementById('connectWeb').click();await until(()=>d.getElementById('sourcePreview').textContent.includes('앱 프로토타입'));
 const source=calls.find(c=>c.url.endsWith('/sources/web')).body;assert.equal(source.product_kind,'android');assert.equal(source.viewport,'mobile');assert.equal(d.querySelector('[data-source-tab="web"]').hidden,false);assert.ok(d.getElementById('sourcePreview').textContent.includes('모바일 브라우저'));
 const saved=JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'));assert.equal(saved.workflow.scope.product_kind,'android');assert.equal(saved.workflow.source.kind,'web');
 });
});


test('personas can be saved before scope is configured, and missing scope blocks execution review',async()=>{
 await environment(async({dom,mount})=>{const calls=[];globalThis.fetch=audienceFetch(calls);mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);
 registerFixtureScreens(dom);dom.window.location.hash='#panel';await until(()=>d.getElementById('v-panel').classList.contains('on'));
 d.getElementById('task').value='';d.getElementById('task').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
 d.getElementById('audienceDescription').value='직접 입력한 대상';d.getElementById('audienceDescription').dispatchEvent(new dom.window.Event('input',{bubbles:true}));d.getElementById('panelContinue').click();await until(()=>dom.window.location.hash==='#personas');d.querySelector('[data-audience-pick="400"]').click();d.getElementById('panelContinue').click();await until(()=>dom.window.location.hash==='#scope');
 assert.equal(calls.filter(c=>c.url.endsWith('/panel/select')).length,1);d.getElementById('panelContinue').click();assert.equal(d.activeElement.id,'workflowScope');assert.equal(dom.window.location.hash,'#scope');assert.ok(d.getElementById('panelActionState').textContent.includes('확인해 주세요'));assert.equal(d.getElementById('audienceSelectedCount').textContent,'1');assert.ok(!calls.some(c=>c.url.endsWith('/runs')));
 });
});


test('source recognition shows loading, real metadata, zoom and preserves the previous connection after failure',async()=>{
 await environment(async({dom,mount})=>{const calls=[];const normal=audienceFetch(calls);let finish;
 globalThis.fetch=(url,options)=>url.endsWith('/sources/web')?new Promise(resolve=>{finish=resolve;}):normal(url,options);
 dom.window.location.hash='#product';mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);
 assert.equal(d.querySelector('.wf-context-panel'),null);assert.ok(d.getElementById('sourcePreview').textContent.includes('연결 대기'));assert.equal(d.querySelector('.wf-optional-context').open,false);
 d.getElementById('sourceUrl').value='https://example.com';d.getElementById('connectWeb').click();await until(()=>finish);assert.equal(d.getElementById('sourceRecognition').getAttribute('aria-busy'),'true');assert.ok(d.getElementById('connectWeb').disabled);
 const observed={id:'W1',label:'연결된 예약 화면',description:'이름을 입력하고 예약 내용을 확인하세요.',url:'https://example.com',elements:[{text:'이름',kind:'input',type:'text',to:null}]};
 finish(new Response(JSON.stringify({study_id:51,root_study_id:51,revision:1,source:{kind:'web',url:'https://example.com',title:observed.label,preview:'data:image/png;base64,iVBORw0KGgo=',viewport:'desktop',observed_screen:observed},scope:{product_kind:'web',viewport:'desktop',mode:'general',focus:'',goal_url:'',goal_text:'',scenario:''},screens:[observed]})));
 await until(()=>d.querySelector('[data-source-zoom]'));assert.equal(d.getElementById('pname').value,observed.label);assert.equal(d.getElementById('pdesc').value,'');assert.equal(d.getElementById('sourceRecognition').contains(d.getElementById('sourceDetails')),false);d.querySelector('[data-recognition-tab=structure]').click();assert.ok(d.querySelector('.ri-elements').textContent.includes('이름'));assert.equal(d.getElementById('sourceRecognition').getAttribute('aria-busy'),'false');
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
 d.querySelector('[data-source-zoom]').click();assert.ok(d.getElementById('sourceCaptureDialog').open);assert.ok(d.getElementById('sourceCaptureImage').src.startsWith('data:image/png'));d.getElementById('closeSourceCapture').click();assert.equal(d.getElementById('sourceCaptureDialog').open,false);
 finish=undefined;d.getElementById('sourceUrl').value='https://example.com/missing';d.getElementById('connectWeb').click();await until(()=>finish);finish(new Response(JSON.stringify({detail:'대상 페이지 오류'}),{status:422}));await until(()=>d.querySelector('.ri-error'));
 assert.ok(d.querySelector('.ri-error').textContent.includes('이전에 연결한 화면'));assert.ok(d.querySelector('.ri-source').textContent.includes(observed.label));assert.equal(d.getElementById('connectWeb').disabled,false);const saved=JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'));assert.equal(saved.workflow.source.url,'https://example.com');
 });
});

test('late source recognition after logout cannot restore private preview',async()=>{
 await environment(async({dom,mount})=>{const calls=[];const normal=audienceFetch(calls);let finish;
 globalThis.fetch=(url,options)=>url.endsWith('/sources/web')?new Promise(resolve=>{finish=resolve;}):normal(url,options);dom.window.location.hash='#product';mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);
 d.getElementById('sourceUrl').value='https://example.com';d.getElementById('connectWeb').click();await until(()=>finish);dom.window.dispatchEvent(new dom.window.CustomEvent('personalab:session-expired'));await until(()=>d.getElementById('v-login').classList.contains('on'));
 finish(new Response(JSON.stringify({study_id:51,source:{kind:'web',title:'PRIVATE_LATE_SOURCE'},scope:{},screens:[]})));await new Promise(resolve=>setTimeout(resolve,30));assert.ok(!d.getElementById('sourcePreview').textContent.includes('PRIVATE_LATE_SOURCE'));assert.equal(d.getElementById('pname').value,'');assert.equal(d.getElementById('sourceRecognition').getAttribute('aria-busy'),'false');
 });
});


test('draft result deep links return to connection without opening result actions',async()=>{
  await environment(async({dom,mount})=>{
    const calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:false,llm_ready:false,provider:'openai',missing:[]}:[]));};
    dom.window.location.hash='#overview';mount();const d=dom.window.document;
    await until(()=>dom.window.location.hash==='#product'&&d.getElementById('v-product').classList.contains('on'));
    for(const destination of ['report','interview','compare','overview']){
      dom.window.location.hash=`#${destination}`;
      await until(()=>dom.window.location.hash==='#product');
      assert.equal(d.getElementById('v-product').classList.contains('on'),true);
      assert.equal(d.getElementById(`v-${destination}`).classList.contains('on'),false);
      assert.equal(d.getElementById('stepper').hidden,false);
    }
    assert.equal(d.getElementById('workflowProgress').hidden,false);
    assert.equal(d.querySelector('#workflowProgress [aria-current="step"]').getAttribute('href'),'#product');
    assert.ok(!calls.some(url=>/\/(report|revisions|interview)$/.test(url)));
  });
});

test('draft result links do not overwrite the last setup step or lose inputs',async()=>{
  await environment(async({dom,mount})=>{
    globalThis.fetch=async(url)=>new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:false,llm_ready:false,provider:'openai',missing:[]}:[]));
    dom.window.location.hash='#product';mount();const d=dom.window.document;
    await until(()=>d.getElementById('engineStatus').textContent.includes('서버 연결'));
    registerFixtureScreens(dom);
    d.getElementById('pname').value='작성 중인 내 제품';d.getElementById('pname').dispatchEvent(new dom.window.Event('input',{bubbles:true}));
    const key='personalab-connected-mockup-v1:user:7';const draft=JSON.parse(dom.window.localStorage.getItem(key));
    dom.window.location.hash='#panel';await until(()=>d.getElementById('v-panel').classList.contains('on'));
    assert.equal(dom.window.localStorage.getItem(`${key}:step:${draft.id}`),'panel');
    dom.window.location.hash='#overview';await until(()=>dom.window.location.hash==='#panel');
    assert.equal(dom.window.localStorage.getItem(`${key}:step:${draft.id}`),'panel');
    dom.window.location.hash='#product';await until(()=>d.getElementById('v-product').classList.contains('on'));
    dom.window.location.hash='#report';await until(()=>dom.window.location.hash==='#product');
    assert.equal(d.getElementById('pname').value,'작성 중인 내 제품');
    assert.equal(JSON.parse(d.getElementById('screenJson').value).length,5);
    dom.window.location.hash='#workspace';await until(()=>d.querySelector('.ws-open[data-open-local]'));
    d.querySelector('.ws-open[data-open-local]').click();await until(()=>dom.window.location.hash==='#product');
    assert.equal(d.getElementById('stepper').hidden,false);
    assert.equal(d.getElementById('pname').value,'작성 중인 내 제품');
  });
});

test('server drafts resume a stable setup step even with selected personas and empty report rows',async()=>{
  await environment(async({dom,mount})=>{
    const key='personalab-connected-mockup-v1:user:7';
    const persona={id:701,attributes:{profile:{age:30,job_group:'가상 프로필'},card_text:'회귀 검증용',traits:{},source:{persona_id:'NAV701'}}};
    globalThis.fetch=async(url)=>{let data=[];
      if(url.endsWith('/capabilities'))data={persona_ready:false,llm_ready:false,workflow_ready:true,provider:'openai',missing:[]};
      else if(url==='/api/studies')data=[{id:81,name:'서버 초안',status:'draft'}];
      else if(url==='/api/studies/81')data={id:81,name:'서버 초안',product:{description:'서버 초안\n제품 설명',features:['탐색'],price:''},prototype:{screens:[{id:'W1',label:'시작',description:'화면',elements:[]}]},task:{description:'살펴보기',goal_screen_id:'W1'},personas:[persona],runs:[]};
      else if(url==='/api/studies/81/workflow')data={study_id:81,root_study_id:81,revision:1,source:{kind:'web',url:'https://example.com',title:'연결된 화면'},scope:{product_kind:'web',mode:'general',focus:'',goal_url:'',goal_text:'완료',viewport:'desktop',scenario:'살펴보기'}};
      else if(url.endsWith('/report'))data={study_id:81,results:[{id:701,persona_id:'NAV701',ask:null,act:null}],act_run_id:null,ask_run_id:null};
      return new Response(JSON.stringify(data));};
    dom.window.localStorage.setItem(`${key}:step:old-local-id`,'overview');
    dom.window.localStorage.setItem(`${key}:step:server:81`,'product');
    dom.window.location.hash='#workspace';mount();const d=dom.window.document;
    await until(()=>d.querySelector('[data-open-server="81"]'));
    d.querySelector('[data-open-server="81"]').click();await until(()=>dom.window.location.hash==='#product');
    const restored=JSON.parse(dom.window.localStorage.getItem(key));
    assert.notEqual(restored.id,'old-local-id');assert.equal(restored.serverId,81);
    assert.equal(d.getElementById('stepper').hidden,false);
    assert.equal(d.getElementById('workflowProgress').hidden,false);
    dom.window.location.hash='#interview';await until(()=>dom.window.location.hash==='#product');
    dom.window.location.hash='#panel';await until(()=>d.getElementById('v-panel').classList.contains('on'));
    assert.equal(dom.window.localStorage.getItem(`${key}:step:server:81`),'panel');
    // A legacy invalid step must never send an unexecuted draft into results.
    dom.window.localStorage.setItem(`${key}:step:server:81`,'overview');
    dom.window.localStorage.setItem(`${key}:step:${restored.id}`,'report');
    dom.window.location.hash='#compare';await until(()=>dom.window.location.hash==='#panel');assert.ok(d.getElementById('liveNotice').textContent.includes('아직 열 수 없어요'));
    assert.equal(d.getElementById('stepper').hidden,false);
    assert.equal(d.getElementById('workflowProgress').hidden,false);
    assert.equal(d.querySelector('#workflowProgress [aria-current="step"]').getAttribute('href'),'#panel');
  });
});


function navigationStudy({executed=false,status='ready',records=false}={}){
 const persona={id:701,attributes:{profile:{age:30,job_group:'검증용'},card_text:'가상 카드',traits:{},source:{persona_id:'NAV701'}}};
 return {id:'workflow-audit',serverId:81,name:'사용 흐름 검증',created:'2026-11-05T00:00:00Z',source:'server',status,
 product:{name:'연결한 제품',description:'제품 설명',features:[],price:''},screens:[{id:'S1',label:'시작',description:'첫 화면',elements:[{text:'다음',to:'S2'}]},{id:'S2',label:'도착',description:'끝',elements:[]}],task:'도착 화면 살펴보기',goal:'S2',conditions:{preset:'',age:'',price:[]},count:1,seed:42,personas:[persona],panelSource:'library',
 workflow:{study_id:81,root_study_id:81,revision:1,source:{kind:'manual'},scope:{product_kind:'web',mode:'general',focus:'원래 집중 항목',goal_url:'',goal_text:'',viewport:'desktop',scenario:'',audience:{description:'검증용 사용자',context:'',filters:{query:'',age_min:null,age_max:null,jobs:[],regions:[],digital:[]},entry_ids:[701]}}},
 runs:executed?{act:900}:undefined,results:[{id:701,persona_id:'NAV701',ask:null,act:records?{path:['S1','S2'],events:[{turn:1,screen:'S1',action:'click',target:'다음',to:'S2',reason:'도착 확인'}],end:{result:'complete',screen:'S2'}}:null}]};
}

test('empty setup blocks every forward entry while back and contextual help remain available',async()=>{
 await environment(async({dom,mount})=>{
  const calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:false,llm_ready:false,provider:'openai',missing:[]}:[]));};
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  dom.window.location.hash='#product';mount();const d=dom.window.document;await until(()=>d.getElementById('engineStatus').textContent.includes('서버 연결'));
  d.querySelector('#workflowProgress a[href="#panel"]').click();await new Promise(r=>setTimeout(r,15));
  assert.equal(dom.window.location.hash,'#product');assert.ok(d.getElementById('liveNotice').textContent.includes('먼저 연결'));
  dom.window.location.hash='#run';await until(()=>dom.window.location.hash==='#product');
  assert.equal(d.getElementById('runResultLink').hidden,true);assert.equal(d.getElementById('startRun').disabled,true);
  assert.equal(d.querySelector('#workflowProgress a[href="#run"]').getAttribute('aria-disabled'),'true');
  dom.window.location.hash='#proto';await until(()=>d.getElementById('v-proto').classList.contains('on'));
  d.querySelector('#v-proto .nextrow a[href="#product"]').click();await until(()=>dom.window.location.hash==='#product');
  d.querySelector('#apphead [data-open-guide]').click();assert.equal(d.getElementById('workflowGuide').open,true);assert.equal(dom.window.location.hash,'#product');
  d.querySelector('#workflowGuide [data-close-guide]').click();assert.equal(d.getElementById('workflowGuide').open,false);
  assert.ok(!calls.some(u=>u.includes('/runs')||u.includes('/product')));
 });
});

test('settings stay read only after route rendering and inspecting screens remains possible',async()=>{
 await environment(async({dom,mount})=>{
  const key='personalab-connected-mockup-v1:user:7',saved=navigationStudy({executed:true,status:'done',records:true});dom.window.localStorage.setItem(key,JSON.stringify(saved));
  globalThis.fetch=async(url)=>new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:true,llm_ready:false,provider:'openai',missing:[]}:url.endsWith('/report')?{results:saved.results}:[]));
  dom.window.location.hash='#panel';mount();const d=dom.window.document;await until(()=>d.getElementById('v-panel').classList.contains('on'));
  assert.equal(d.getElementById('scopeFocus').disabled,true);assert.equal(d.getElementById('studioReadonly').hidden,false);
  dom.window.location.hash='#product';await until(()=>d.getElementById('v-product').classList.contains('on'));assert.equal(d.querySelector('[data-recognition-tab=structure]').disabled,false);d.querySelector('[data-recognition-tab=structure]').click();assert.equal(d.querySelector('#sourceDetails [role=tab][aria-selected=true]').dataset.recognitionTab,'structure');
  dom.window.location.hash='#panel';await until(()=>d.getElementById('v-panel').classList.contains('on'));
  d.getElementById('scopeFocus').value='바뀌면 안 되는 값';d.getElementById('scopeFocus').dispatchEvent(new dom.window.Event('input',{bubbles:true}));d.getElementById('scopeFocus').dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.equal(JSON.parse(dom.window.localStorage.getItem(key)).workflow.scope.focus,'원래 집중 항목');
  dom.window.location.hash='#proto';await until(()=>d.getElementById('v-proto').classList.contains('on'));
  assert.equal(d.querySelector('.figma-row button').disabled,true);assert.equal(d.getElementById('goal').disabled,true);
  d.querySelector('[data-edit-screen="S2"]').click();assert.equal(d.getElementById('editScreenLabel').value,'도착');assert.equal(d.getElementById('editScreenLabel').disabled,true);
  dom.window.location.hash='#run';await until(()=>d.getElementById('v-run').classList.contains('on'));
  assert.equal(d.getElementById('studioReadonly').hidden,true);assert.equal(d.getElementById('runTitle').textContent,'탐색 기록이 저장됐어요.');
  assert.equal(d.getElementById('runResultLink').hidden,false);assert.ok(d.getElementById('runPreparation').textContent.includes('설정 보기'));assert.ok(!d.getElementById('runPreparation').textContent.includes('확인 / 수정'));
 });
});

test('pending and failed executions expose status, not empty reports or duplicate launches',async()=>{
 await environment(async({dom,mount})=>{
  const key='personalab-connected-mockup-v1:user:7',saved=navigationStudy({executed:true,status:'running'}),calls=[];dom.window.localStorage.setItem(key,JSON.stringify(saved));let failedRead=false,status='running';
  globalThis.fetch=async(url,options={})=>{calls.push({url,method:options.method});let data=[];
   if(url.endsWith('/capabilities'))data={persona_ready:true,workflow_ready:true,llm_ready:false,persona_transmission_allowed:false,provider:'openai',missing:[]};
   else if(url.endsWith('/status')){if(failedRead)return new Response(JSON.stringify({detail:'조회 연결 실패'}),{status:503});data={id:900,status,progress:.3,mode:'act'};}
   else if(url.endsWith('/report'))data={results:saved.results};else if(url.endsWith('/control'))data={cancel_requested:false,error:'검증용 실행 오류'};
   return new Response(JSON.stringify(data));};
  dom.window.location.hash='#report';mount();const d=dom.window.document;await until(()=>dom.window.location.hash==='#run'&&d.getElementById('engineStatus').textContent.includes('서버 연결'));
  assert.equal(d.querySelector('#stepper a[href="#report"]').getAttribute('aria-disabled'),'true');assert.equal(d.querySelector('#stepper a[href="#interview"]').getAttribute('aria-disabled'),'true');
  assert.equal(d.getElementById('newConnectedStudy').disabled,true);assert.equal(d.getElementById('runResultLink').getAttribute('aria-disabled'),'true');assert.ok(d.getElementById('runTitle').textContent.includes('살펴보고'));
  d.getElementById('cancelRun').click();d.getElementById('cancelRun').click();await until(()=>calls.some(c=>c.url.endsWith('/cancel')));assert.equal(calls.filter(c=>c.url.endsWith('/cancel')).length,1);assert.equal(d.getElementById('cancelRun').disabled,true);
  failedRead=true;d.getElementById('startRun').click();await until(()=>d.getElementById('liveNotice').textContent.includes('조회 연결 실패'));
  assert.equal(JSON.parse(dom.window.localStorage.getItem(key)).status,'running');
  failedRead=false;status='failed';d.getElementById('startRun').click();await until(()=>d.getElementById('liveNotice').textContent.includes('검증용 실행 오류'));
  assert.equal(d.getElementById('runTitle').textContent,'실행 상태를 확인해 주세요.');assert.ok(!d.getElementById('startRun').textContent.includes('이어가기'));
  assert.equal(d.getElementById('newConnectedStudy').disabled,false);assert.equal(d.getElementById('cancelRun').hidden,true);
  assert.ok(!calls.some(c=>c.url.endsWith('/runs')&&c.method==='POST'));
 });
});

test('screen edits retain chosen personas and a filter reset only clears filters',async()=>{
 await environment(async({dom,mount})=>{
  const key='personalab-connected-mockup-v1:user:7';dom.window.localStorage.setItem(key,JSON.stringify(navigationStudy()));const calls=[];globalThis.fetch=audienceFetch(calls);
  dom.window.location.hash='#proto';mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);
  d.getElementById('editScreenLabel').value='수정한 첫 화면';d.querySelector('[data-editor-action="save"]').click();
  let saved=JSON.parse(dom.window.localStorage.getItem(key));assert.equal(saved.personas.length,1);assert.equal(saved.personas[0].id,701);assert.equal(saved.screens[0].label,'수정한 첫 화면');
  dom.window.location.hash='#panel';await until(()=>d.getElementById('v-panel').classList.contains('on'));
  d.querySelector('[data-audience-pick="400"]').click();const count=d.getElementById('audienceSelectedCount').textContent;
  d.querySelector('[data-audience-action="reset"]').click();await until(()=>!d.querySelector('[data-audience-action="reset"]').disabled);
  assert.equal(d.getElementById('audienceSelectedCount').textContent,count);assert.equal(d.getElementById('audienceDescription').value,'검증용 사용자');
 });
});


test('reopened running test refreshes saved results automatically without queuing an execution',async()=>{
 await environment(async({dom,mount})=>{
  const key='personalab-connected-mockup-v1:user:7',saved=navigationStudy({executed:true,status:'running'}),done=navigationStudy({executed:true,status:'done',records:true}),calls=[];
  dom.window.localStorage.setItem(key,JSON.stringify(saved));
  globalThis.fetch=async(url,options={})=>{calls.push({url,method:options.method});let data=[];
   if(url.endsWith('/capabilities'))data={persona_ready:true,llm_ready:false,provider:'openai',missing:[]};
   else if(url.endsWith('/status'))data={id:900,status:'done',progress:1,mode:'act'};
   else if(url.endsWith('/report'))data={results:done.results};
   return new Response(JSON.stringify(data));};
  dom.window.location.hash='#run';mount();const d=dom.window.document;
  await until(()=>d.getElementById('runTitle').textContent==='탐색 기록이 저장됐어요.');
  assert.equal(JSON.parse(dom.window.localStorage.getItem(key)).status,'done');
  assert.equal(d.getElementById('runResultLink').hidden,false);assert.equal(d.querySelector('#stepper a[href="#interview"]').hidden,false);
  assert.ok(calls.some(c=>c.url==='/api/runs/900/status'));assert.ok(!calls.some(c=>c.method==='POST'));
 });
});


test('auth fields explain errors, focus the first invalid field and reset secrets on mode switch',async()=>{
 await environment(async({dom,mount})=>{
  const calls=[];globalThis.fetch=async url=>{calls.push(url);return new Response(JSON.stringify({detail:'로그인이 필요합니다.'}),{status:401});};
  dom.window.location.hash='#register';mount();const d=dom.window.document;await until(()=>d.getElementById('v-login').classList.contains('on'));
  const submit=()=>d.getElementById('authForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));
  submit();assert.equal(d.activeElement.id,'authEmail');assert.equal(d.getElementById('authEmail').getAttribute('aria-invalid'),'true');assert.equal(d.getElementById('authPasswordError').hidden,false);
  d.getElementById('authEmail').value='person@example.com';d.getElementById('authPassword').value='abcd';d.getElementById('authConfirm').value='different';submit();assert.equal(d.activeElement.id,'authConfirm');assert.equal(calls.filter(u=>u==='/api/auth/register').length,0);
  d.getElementById('authPasswordToggle').click();d.querySelector('[data-auth-toggle="authConfirm"]').click();assert.equal(d.getElementById('authPassword').type,'text');assert.equal(d.getElementById('authConfirm').type,'text');
  const key=new dom.window.KeyboardEvent('keyup');Object.defineProperty(key,'getModifierState',{value:name=>name==='CapsLock'});d.getElementById('authPassword').dispatchEvent(key);assert.equal(d.getElementById('authCapsLock').hidden,false);
  d.getElementById('authPassword').dispatchEvent(new dom.window.Event('blur'));assert.equal(d.getElementById('authCapsLock').hidden,true);
  dom.window.location.hash='#login';await until(()=>d.getElementById('authTitle').textContent==='로그인');assert.equal(d.getElementById('authEmail').value,'person@example.com');assert.equal(d.getElementById('authPassword').value,'');assert.equal(d.getElementById('authConfirm').type,'password');assert.equal(d.getElementById('authConfirmField').hidden,true);
 },false);
});

test('auth requests prevent duplicates and keep server errors across focus, with a duplicate-account login shortcut',async()=>{
 await environment(async({dom,mount})=>{
  let finish,posts=0;globalThis.fetch=async(url)=>{if(url==='/api/auth/register'){posts++;return new Promise(resolve=>{finish=()=>resolve(new Response(JSON.stringify({detail:'기존 계정이라면 로그인해 주세요.'}),{status:409}));});}return new Response(JSON.stringify({detail:'로그인이 필요합니다.'}),{status:401});};
  dom.window.location.hash='#register';mount();const d=dom.window.document;await until(()=>d.getElementById('v-login').classList.contains('on'));
  d.getElementById('authEmail').value='existing@example.com';d.getElementById('authPassword').value='a!2?';d.getElementById('authConfirm').value='a!2?';
  const submit=()=>d.getElementById('authForm').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));submit();submit();await until(()=>finish);
  assert.equal(posts,1);assert.equal(d.getElementById('authForm').getAttribute('aria-busy'),'true');assert.equal(d.getElementById('authEmail').disabled,true);assert.match(d.getElementById('authSubmit').textContent,/만들고/);
  const click=new dom.window.MouseEvent('click',{bubbles:true,cancelable:true});d.getElementById('authSwitch').dispatchEvent(click);assert.equal(click.defaultPrevented,true);
  finish();await until(()=>!d.getElementById('authSubmit').disabled);assert.equal(d.getElementById('authExistingLogin').hidden,false);assert.equal(d.getElementById('authError').hidden,false);
  dom.window.dispatchEvent(new dom.window.Event('focus'));await new Promise(r=>setTimeout(r,40));assert.equal(d.getElementById('authError').hidden,false);
  d.getElementById('authExistingLogin').click();await until(()=>d.getElementById('authTitle').textContent==='로그인');assert.equal(d.getElementById('authEmail').value,'existing@example.com');assert.equal(d.getElementById('authError').hidden,true);
 },false);
});

test('initial session network failure can be retried without losing email input',async()=>{
 await environment(async({dom,mount})=>{
  let offline=true,checks=0;globalThis.fetch=async()=>{checks++;if(offline)throw new Error('offline');return new Response(JSON.stringify({detail:'로그인이 필요합니다.'}),{status:401});};
  dom.window.location.hash='#login';mount();const d=dom.window.document;await until(()=>!d.getElementById('authRetry').hidden);d.getElementById('authEmail').value='retry@example.com';offline=false;
  d.getElementById('authRetry').click();await until(()=>checks>1&&!d.getElementById('authRetry').disabled);assert.equal(d.getElementById('authEmail').value,'retry@example.com');assert.equal(d.getElementById('v-login').classList.contains('on'),true);assert.equal(d.getElementById('authError').hidden,true);assert.equal(d.getElementById('authRetry').hidden,true);
 },false);
});

test('temporary session check failure preserves the current authenticated draft',async()=>{
 await environment(async({dom,mount})=>{
  let offline=false;globalThis.fetch=async url=>{if(url==='/api/auth/me'){if(offline)throw new Error('offline');return new Response(JSON.stringify({id:91,email:'owner@example.com'}));}return new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:false,llm_ready:false,provider:'openai',missing:[]}:[]));};
  dom.window.location.hash='#product';mount();const d=dom.window.document;await until(()=>d.getElementById('v-product').classList.contains('on'));
  d.getElementById('pname').value='보존할 초안';d.getElementById('pname').dispatchEvent(new dom.window.Event('input',{bubbles:true}));offline=true;dom.window.dispatchEvent(new dom.window.Event('focus'));await until(()=>d.getElementById('liveNotice').textContent.includes('로그인 상태를 확인하지 못'));
  assert.equal(d.getElementById('pname').value,'보존할 초안');assert.equal(d.getElementById('v-product').classList.contains('on'),true);assert.equal(d.querySelector('.studio-account [data-auth-user]').textContent,'owner@example.com');
 },false);
});

test('editor account menu supports Escape, failed logout retry and complete logout',async()=>{
 await environment(async({dom,mount})=>{
  let account={id:92,email:'editor@example.com'},fail=true,finish;globalThis.fetch=async url=>{
   if(url==='/api/auth/me')return new Response(JSON.stringify(account||{detail:'로그인이 필요합니다.'}),{status:account?200:401});
   if(url==='/api/auth/logout')return new Promise(resolve=>{finish=()=>{if(!fail)account=null;resolve(new Response(JSON.stringify(fail?{detail:'잠시 후 다시 시도해 주세요.'}:{message:'로그아웃'}),{status:fail?503:200}));};});
   return new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:false,llm_ready:false,provider:'openai',missing:[]}:[]));
  };
  dom.window.location.hash='#product';mount();const d=dom.window.document;await until(()=>d.getElementById('v-product').classList.contains('on'));
  const menu=d.querySelector('.studio-account');menu.open=true;d.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape'}));assert.equal(menu.open,false);assert.equal(d.activeElement,menu.querySelector('summary'));
  menu.open=true;d.getElementById('pname').click();assert.equal(menu.open,false);menu.querySelector('[data-auth-logout]').click();await until(()=>finish);assert.ok([...d.querySelectorAll('[data-auth-logout]')].every(b=>b.disabled));finish();await until(()=>!menu.querySelector('[data-auth-logout]').disabled);
  assert.equal(d.getElementById('v-product').classList.contains('on'),true);assert.match(d.getElementById('liveNotice').textContent,/로그아웃하지 못/);fail=false;finish=undefined;menu.querySelector('[data-auth-logout]').click();await until(()=>finish);finish();await until(()=>d.getElementById('v-login').classList.contains('on')&&!d.getElementById('authSubmit').disabled);
  assert.ok([...d.querySelectorAll('[data-auth-user]')].every(n=>n.textContent===''));assert.equal(menu.open,false);
 },false);
});


test('wizard previous buttons preserve descriptions, selections and scope without premature saves',async()=>{
 await environment(async({dom,mount})=>{
  const calls=[];globalThis.fetch=audienceFetch(calls);dom.window.location.hash='#product';mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);registerFixtureScreens(dom);
  d.getElementById('pname').value='이동 검증';d.getElementById('pname').dispatchEvent(new dom.window.Event('input',{bubbles:true}));d.querySelector('#v-product [data-step-next]').click();await until(()=>dom.window.location.hash==='#source-review'&&d.getElementById('v-source-review').classList.contains('on'));d.getElementById('sourceReviewContinue').click();await until(()=>dom.window.location.hash==='#panel');
  d.getElementById('audienceDescription').value='모바일로 예약을 확인하는 사용자';d.getElementById('audienceDescription').dispatchEvent(new dom.window.Event('input',{bubbles:true}));d.getElementById('panelContinue').click();await until(()=>dom.window.location.hash==='#personas');d.querySelector('[data-audience-pick="401"]').click();
  d.getElementById('panelBackLink').click();await until(()=>dom.window.location.hash==='#panel'&&d.getElementById('panelBackLink').getAttribute('href')==='#source-review');d.getElementById('panelBackLink').click();await until(()=>dom.window.location.hash==='#source-review');d.querySelector('#v-source-review [data-step-back]').click();await until(()=>dom.window.location.hash==='#product');assert.ok(!calls.some(c=>c.url.endsWith('/panel/select')));
  assert.equal(d.getElementById('pname').value,'이동 검증');d.querySelector('#v-product [data-step-next]').click();await until(()=>dom.window.location.hash==='#source-review'&&d.getElementById('v-source-review').classList.contains('on'));d.getElementById('sourceReviewContinue').click();await until(()=>dom.window.location.hash==='#panel');assert.equal(d.getElementById('audienceDescription').value,'모바일로 예약을 확인하는 사용자');
  d.getElementById('panelContinue').click();await until(()=>dom.window.location.hash==='#personas');assert.equal(d.getElementById('audienceSelectedCount').textContent,'1');d.getElementById('panelContinue').click();await until(()=>dom.window.location.hash==='#scope'&&!d.getElementById('workflowScope').hidden);
  d.getElementById('scopeFocus').value='다음 버튼이 잘 보이는지 확인';d.getElementById('scopeFocus').dispatchEvent(new dom.window.Event('input',{bubbles:true}));d.getElementById('panelBackLink').click();await until(()=>dom.window.location.hash==='#personas');d.getElementById('panelContinue').click();await until(()=>dom.window.location.hash==='#scope');assert.equal(d.getElementById('scopeFocus').value,'다음 버튼이 잘 보이는지 확인');
  d.getElementById('panelContinue').click();await until(()=>dom.window.location.hash==='#run');assert.equal(calls.filter(c=>c.url.endsWith('/panel/select')).length,1);assert.equal(d.getElementById('startRun').disabled,true);d.getElementById('runBackLink').click();await until(()=>dom.window.location.hash==='#scope');assert.equal(d.getElementById('scopeFocus').value,'다음 버튼이 잘 보이는지 확인');assert.ok(!calls.some(c=>c.url.includes('/runs')));
 });
});


test('result footers move from execution to report to interview and back without a new run',async()=>{
 await environment(async({dom,mount})=>{
  const saved=navigationStudy({executed:true,status:'done',records:true}),calls=[];
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(saved));
  globalThis.fetch=async(url,options={})=>{calls.push({url,method:options.method});return new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:true,llm_ready:false,provider:'openai',missing:[]}:url.endsWith('/report')?{results:saved.results}:url.endsWith('/status')?{id:900,status:'done',progress:1}:[]));};
  dom.window.location.hash='#run';mount();const d=dom.window.document;await until(()=>d.getElementById('v-run').classList.contains('on')&&d.getElementById('runResultLink').getAttribute('aria-disabled')==='false');
  d.getElementById('runResultLink').click();await until(()=>d.getElementById('v-report').classList.contains('on'));assert.ok(d.getElementById('liveReport').textContent.includes('멈'));
  d.querySelector('#v-report [data-step-next]').click();await until(()=>d.getElementById('v-interview').classList.contains('on'));assert.equal(d.getElementById('liveReport').parentElement.id,'interviewReportSlot');
  d.querySelector('#v-interview [data-step-back]').click();await until(()=>d.getElementById('v-report').classList.contains('on'));assert.equal(d.getElementById('liveReport').closest('.view').id,'v-report');
  d.querySelector('#v-report [data-step-back]').click();await until(()=>d.getElementById('v-run').classList.contains('on')&&d.getElementById('runResultLink').getAttribute('aria-disabled')==='false');assert.equal(d.getElementById('runResultLink').hidden,false);assert.ok(!calls.some(c=>c.method==='POST'&&c.url.includes('/runs')));
 });
});


test('a delayed next-step save cannot pull the user forward after choosing previous',async()=>{
 for(const stage of ['scope'])await environment(async({dom,mount})=>{
  const saved=navigationStudy(),calls=[];dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(saved));let finish,completed=false;
  const handler=audienceFetch(calls);globalThis.fetch=async(url,options={})=>{
   if(url.endsWith('/product')&&options.method==='POST')return new Promise(resolve=>{finish=()=>resolve(new Response('{}'));});
   if(url.endsWith('/workflow')&&options.method!=='POST'&&finish)completed=true;
   return handler(url,options);
  };
  dom.window.location.hash='#'+stage;mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);
  d.querySelector('#v-panel [data-step-next]').click();await until(()=>finish);
  const destination='#personas';d.querySelector('#v-panel [data-step-back]').click();await until(()=>dom.window.location.hash===destination);finish();await until(()=>completed);await new Promise(r=>setTimeout(r,35));
  assert.equal(dom.window.location.hash,destination);assert.equal(d.getElementById('pname').value,'연결한 제품');assert.ok(!calls.some(c=>c.url.includes('/runs')));
 });
});


test('candidate pages replace four cards and retain selection across next and previous',async()=>{
 await environment(async({dom,mount})=>{
  const calls=[],normal=audienceFetch(calls),cards=Array.from({length:10},(_,i)=>({...audienceCards[i%4],id:400+i,source_persona_id:`P${i}`,attributes:{...audienceCards[i%4].attributes,source:{...audienceCards[i%4].attributes.source,library_entry_id:400+i}}}));
  globalThis.fetch=async(url,options={})=>{if(url.endsWith('/audience/search')){const body=JSON.parse(options.body);calls.push({url,body});return new Response(JSON.stringify({total:10,duplicates_excluded:0,items:cards.slice(body.offset,body.offset+body.limit)}));}return normal(url,options);};
  mount();const d=dom.window.document;await until(()=>d.querySelectorAll('.ab-person').length===4);registerFixtureScreens(dom);d.getElementById('audienceDescription').value='카드 페이지를 확인할 사용자';d.getElementById('audienceDescription').dispatchEvent(new dom.window.Event('input',{bubbles:true}));dom.window.location.hash='#personas';await until(()=>!d.querySelector('.ab-persona-browser').hidden);
  d.querySelector('[data-audience-pick="400"]').click();d.querySelector('[data-audience-action="more"]').click();await until(()=>d.querySelector('[data-audience-pick="404"]'));assert.equal(d.querySelectorAll('.ab-person').length,4);assert.equal(d.querySelector('[data-audience-pick="400"]'),null);d.querySelector('[data-audience-pick="404"]').click();
  d.querySelector('[data-audience-action="previous"]').click();await until(()=>d.querySelector('[data-audience-pick="400"]'));assert.equal(d.querySelector('[data-audience-pick="400"]').getAttribute('aria-pressed'),'true');assert.equal(d.getElementById('audienceSelectedCount').textContent,'2');assert.equal(d.querySelectorAll('.ab-person').length,4);assert.ok(calls.some(c=>c.body?.offset===4&&c.body.limit===4));assert.ok(!calls.some(c=>c.url.endsWith('/panel/select')));
 });
});

test('scope route and browser back restore the same subpage without resetting saved settings',async()=>{
 await environment(async({dom,mount})=>{
  const saved=navigationStudy(),key='personalab-connected-mockup-v1:user:7';dom.window.localStorage.setItem(key,JSON.stringify(saved));dom.window.localStorage.setItem(key+':step:server:81','scope');
  globalThis.fetch=async url=>new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:false,llm_ready:false,provider:'openai',missing:[]}:[]));
  dom.window.location.hash='#overview';mount();const d=dom.window.document;await until(()=>dom.window.location.hash==='#scope'&&!d.getElementById('workflowScope').hidden);assert.equal(d.getElementById('audienceBuilder').hidden,true);assert.equal(d.getElementById('scopeFocus').value,'원래 집중 항목');
  d.getElementById('panelBackLink').click();await until(()=>dom.window.location.hash==='#personas'&&!d.querySelector('.ab-persona-browser').hidden);dom.window.history.back();await until(()=>dom.window.location.hash==='#scope'&&!d.getElementById('workflowScope').hidden);assert.equal(d.getElementById('scopeFocus').value,'원래 집중 항목');assert.equal(dom.window.localStorage.getItem(key+':step:server:81'),'scope');assert.equal(d.getElementById('audienceDefinition').hidden,false);assert.equal(d.getElementById('audienceBuilder').hidden,true);
 });
});


test('browser run shows actual 3D captures and reaches report and interview after completion',async()=>{
 await environment(async({dom,mount})=>{
  const key='personalab-connected-mockup-v1:user:7',saved=navigationStudy({executed:true,status:'running'}),done=navigationStudy({executed:true,status:'done',records:true}),calls=[];
  saved.workflow.source={kind:'html',title:'실제 연결 화면',preview:'data:image/jpeg;base64,YQ=='};
  saved.workflow.scope.max_turns=12;
  const evidence=[{id:101,persona_id:701,turn:0,screen:{...saved.screens[0],viewport:{width:1000,height:800},elements:[{id:'pl-0',text:'다음',to:null,rect:{x:10,y:20,width:80,height:30}}]},image:'/api/runs/900/evidence/101/image',action:{action:'click',target:'pl-0',reason:'관찰된 버튼 선택'}},{id:102,persona_id:701,turn:1,screen:saved.screens[1],image:'/api/runs/900/evidence/102/image',action:{action:'complete'}}];
  dom.window.localStorage.setItem(key,JSON.stringify(saved));
  globalThis.fetch=async(url,options={})=>{calls.push({url,method:options.method});let data=[];
   if(url.endsWith('/capabilities'))data={persona_ready:true,llm_ready:true,persona_transmission_allowed:true,workflow_ready:true,provider:'openai',missing:[],max_turns:3};
   else if(url.endsWith('/status'))data={id:900,status:'done',progress:1,mode:'act'};
   else if(url.endsWith('/report'))data={results:done.results};
   else if(url.includes('/evidence?'))data=url.endsWith('after=0')?evidence:[];
   else if(url.endsWith('/interview'))data={messages:[],llm_allowed:true};
   return new Response(JSON.stringify(data));};
  dom.window.location.hash='#run';mount();const d=dom.window.document;
  await until(()=>d.getElementById('runTitle').textContent==='탐색 기록이 저장됐어요.');
  assert.equal(d.getElementById('browserExecution').hidden,false);
  for(const image of d.querySelectorAll('.ls-image-buffer'))image.dispatchEvent(new dom.window.Event('load'));await Promise.resolve();
  assert.equal(d.getElementById('browserEvidenceImage').getAttribute('src'),evidence[1].image);
  assert.equal(d.querySelector('[data-ls-follow]').textContent,'마지막 기록');
  assert.ok(d.getElementById('runPreparation').textContent.includes('최대 12회'));
  d.querySelector('[data-ls-evidence="101"]').click();for(const image of d.querySelectorAll('.ls-image-buffer'))image.dispatchEvent(new dom.window.Event('load'));await Promise.resolve();assert.equal(d.getElementById('browserEvidenceImage').getAttribute('src'),evidence[0].image);
  assert.equal(d.getElementById('runResultLink').hidden,false);d.getElementById('runResultLink').click();await until(()=>d.getElementById('v-report').classList.contains('on'));
  d.querySelector('#v-report .report-document-actions [data-step-next]').click();await until(()=>d.getElementById('v-interview').classList.contains('on'));
  assert.equal(calls.filter(c=>c.method==='POST'&&c.url.endsWith('/runs')).length,0);
 });
});


test('site scope proceeds without a goal and preserves optional priorities when toggling journey mode',async()=>{
 await environment(async({dom,mount})=>{
  const fixture=navigationStudy();fixture.goal='__browser_goal__';fixture.workflow.source={kind:'web',url:'https://example.com',title:'Fixture'};fixture.workflow.scope.exploration='site';fixture.workflow.scope.focus='';fixture.workflow.scope.priorities=[];
  const calls=[];globalThis.fetch=async(url,options={})=>{
   const body=options.body?JSON.parse(options.body):null;calls.push({url,body});let data=[];
   if(url.endsWith('/capabilities'))data={persona_ready:true,llm_ready:true,persona_transmission_allowed:true,workflow_ready:true,provider:'openai',missing:[]};
   else if(url.endsWith('/workflow')){if(body)fixture.workflow.scope=body.scope;data=fixture.workflow;}
   else if(url.endsWith('/name')||url.endsWith('/product'))data={};
   else if(url.endsWith('/runs'))data={id:5,status:'pending',progress:0};
   else if(/\/runs\/5$/.test(url))data={status:'failed',progress:0};
   return new Response(JSON.stringify(data));
  };
  const key='personalab-connected-mockup-v1:user:7';dom.window.localStorage.setItem(key,JSON.stringify(fixture));dom.window.location.hash='#scope';mount();const d=dom.window.document;
  await until(()=>d.getElementById('engineStatus').textContent.includes('연결'));
  assert.equal(d.getElementById('journeyScopeFields').hidden,true);
  const priorities=d.getElementById('scopePriorities');priorities.value='검색 결과 찾기\n입력 오류 안내';priorities.dispatchEvent(new dom.window.Event('input',{bubbles:true}));
  const journey=d.querySelector('[name=explorationMode][value=journey]');journey.checked=true;journey.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.equal(d.getElementById('journeyScopeFields').hidden,false);
  d.getElementById('panelContinue').click();await until(()=>d.getElementById('liveNotice').textContent.includes('사용 흐름'));
  assert.equal(dom.window.location.hash,'#scope');
  const general=d.querySelector('[name=explorationMode][value=site]');general.checked=true;general.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  d.getElementById('panelContinue').click();await until(()=>dom.window.location.hash==='#run');
  const saved=calls.find(c=>c.url.endsWith('/workflow')&&c.body).body.scope;
  assert.equal(saved.exploration,'site');assert.equal(saved.goal_url,'');assert.deepEqual(saved.priorities,['검색 결과 찾기','입력 오류 안내']);await until(()=>calls.some(c=>c.url.endsWith('/runs')&&c.body!==undefined||c.url.endsWith('/runs'))); // 5단계에서 실행 시작을 누르면 바로 실행이 시작된다
 });
});


test('connection review tabs and pagination work and block stale-size navigation',async()=>{
 await environment(async({dom,mount})=>{
  const fixture=navigationStudy();fixture.goal='__browser_goal__';fixture.workflow.source={kind:'web',url:'https://example.com',title:'연결 화면',viewport:'desktop',preview:'data:image/png;base64,iVBORw0KGgo=',observed_screen:{id:'S1',label:'연결 화면',description:'본문',elements:[{text:'검색',kind:'input',to:null}]},site_map:{pages:Array.from({length:9},(_,i)=>({url:`https://example.com/${i}`,label:`페이지 ${i+1}`,state:'loaded',issues:[]})),edges:[],limit_reached:false,excluded_count:0,max_pages:20}};fixture.workflow.scope.exploration='site';fixture.workflow.scope.focus='';
  globalThis.fetch=async(url)=>new Response(JSON.stringify(url.endsWith('/workflow')?fixture.workflow:url.endsWith('/capabilities')?{persona_ready:true,llm_ready:true,persona_transmission_allowed:true,workflow_ready:true,provider:'openai',missing:[]}:[]));
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(fixture));dom.window.location.hash='#product';mount();const d=dom.window.document;
  await until(()=>d.querySelectorAll('.sr-page-row').length===6);
  assert.equal(d.getElementById('sourceDetails').closest('.view').id,'v-source-review');assert.equal(d.getElementById('sourceRecognition').querySelector('[role=tablist]'),null);d.querySelector('#v-product [data-step-next]').click();await until(()=>dom.window.location.hash==='#source-review');
  assert.equal(d.querySelectorAll('.sr-page-row').length,6);d.querySelector('[data-recognition-page="1"]').click();assert.equal(d.querySelectorAll('.sr-page-row').length,3);
  d.querySelector('[data-recognition-tab=pages]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));assert.equal(d.querySelector('#sourceDetails [role=tab][aria-selected=true]').dataset.recognitionTab,'checks');assert.equal(d.activeElement.dataset.recognitionTab,'checks');
  d.querySelector('#v-source-review [data-step-back]').click();await until(()=>dom.window.location.hash==='#product');const mobile=d.querySelector('[name=sourceViewport][value=mobile]');mobile.checked=true;mobile.dispatchEvent(new dom.window.Event('change',{bubbles:true}));
  assert.ok(d.getElementById('sourcePreview').textContent.includes('다시 연결 필요'));assert.ok(d.getElementById('sourceContinueHint').textContent.includes('다시 연결'));
  d.querySelector('#v-product [data-step-next]').click();await until(()=>d.getElementById('liveNotice').textContent.includes('다시 연결'));
  assert.equal(dom.window.location.hash,'#product');assert.equal(d.activeElement.id,'connectWeb');
 });
});


test('preflight menu selection opens its actual scene page without a new run or source scan',async()=>{
 await environment(async({dom,mount})=>{
  const fixture=navigationStudy();fixture.workflow.source={kind:'web',url:'https://example.com',title:'Fixture',viewport:'desktop',preview:'data:image/png;base64,iVBORw0KGgo=',preflight:{states:Array.from({length:9},(_,i)=>({id:'scene'+i,label:'화면 '+i,url:'https://example.com/',excerpt:'내용',path:['열기'],element_count:1,image:null})),transitions:[],skipped:[],attempts:1,clicks:1,input_fills:0,limited:true,status:'partial',navigation:[{id:'n1',label:'설정',group:'main',kind:'global',status:'visited',state_id:'scene8',attempts:1}]}};
  const calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:true,llm_ready:false,workflow_ready:true,provider:'openai',missing:[]}:[]));};
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(fixture));dom.window.location.hash='#product';mount();const d=dom.window.document;
  await until(()=>d.querySelector('[data-recognition-state="scene8"]'));
  assert.equal(d.querySelectorAll('.pf-state-card').length,6);d.querySelector('[data-recognition-state="scene8"]').click();
  assert.equal(d.querySelectorAll('.pf-state-card').length,3);assert.equal(d.querySelector('.pf-selected').dataset.preflightState,'scene8');assert.equal(d.activeElement.dataset.preflightState,'scene8');
  d.querySelector('[data-recognition-page="0"]').click();assert.equal(d.querySelectorAll('.pf-state-card').length,6);assert.equal(d.querySelector('.pf-selected'),null);
  assert.ok(!calls.some(u=>u.includes('/sources/')||u.endsWith('/runs')));
 });
});


test('structure job polls stored progress and pause resumes the same job without paid run calls',async()=>{
 await environment(async({dom,mount})=>{
  const fixture=navigationStudy();fixture.workflow.source={kind:'web',url:'https://example.com',viewport:'desktop',title:'Job fixture',exploration:{id:'job-fixture',status:'running',phase:'screens',version:1,budget:{states:200,seconds:300},states:0,pending_actions:5,pages_found:3,pages_checked:2,pages_failed:0,elapsed_seconds:1}};
  let status='running',version=1;const calls=[];
  globalThis.fetch=async(url,options)=>{
   const body=options?.body?JSON.parse(options.body):null;calls.push({url,body});
   if(url.endsWith('/capabilities'))return new Response(JSON.stringify({persona_ready:true,llm_ready:true,workflow_ready:true,provider:'openai',missing:[]}));
   if(url.includes('/exploration')){
    if(body){status=body.action==='pause'?'paused':'running';version++;}else version++;
    const job={...fixture.workflow.source.exploration,status,version,states:36,pending_actions:4};
    return new Response(JSON.stringify({job,source:{preflight:{states:[{id:'actual',label:'실제 저장된 화면',url:'https://example.com',excerpt:'내용',path:[],element_count:1,image:null}],transitions:[],navigation:[],skipped:[],attempts:1,clicks:1,input_fills:0,status:'partial',limited:false}}}));
   }
   return new Response(JSON.stringify([]));
  };
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(fixture));dom.window.location.hash='#product';mount();const d=dom.window.document;
  await until(()=>d.querySelector('[data-exploration-action="pause"]'));
  d.querySelector('[data-exploration-action="pause"]').focus();
  await new Promise(resolve=>setTimeout(resolve,2200));
  await until(()=>d.querySelector('.ex-job').textContent.includes('36'));
  assert.ok(calls.some(c=>c.url.includes('after_version=1')));
  assert.equal(d.activeElement.dataset.explorationAction,'pause');
  d.querySelector('[data-exploration-action="pause"]').click();await until(()=>d.querySelector('[data-exploration-action="resume"]'));
  const persisted=JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'));
  assert.equal(persisted.workflow.source.exploration.id,'job-fixture');assert.equal(persisted.workflow.source.exploration.status,'paused');
  d.querySelector('[data-exploration-action="resume"]').click();await until(()=>d.querySelector('[data-exploration-action="pause"]'));
  assert.ok(calls.some(c=>c.body?.action==='resume'));assert.equal(calls.find(c=>c.body?.action==='pause').body.job_id,'job-fixture');assert.ok(!calls.some(c=>c.url.endsWith('/runs')||c.url.includes('/sources/')));
 });
});


test('missing server exploration gives a reconnect explanation instead of silently polling forever',async()=>{
 await environment(async({dom,mount})=>{
  const fixture=navigationStudy();fixture.workflow.source={kind:'web',url:'https://www.aicoss.kr/www/',viewport:'desktop',exploration:{id:'missing-job',status:'queued',phase:'pages',version:1,budget:{states:200,seconds:300},states:0,pending_actions:0,pages_found:0,pages_checked:0,pages_failed:0}};
  globalThis.fetch=async(url)=>new Response(JSON.stringify(url.includes('/exploration')?{job:null,source:null}:url.endsWith('/capabilities')?{persona_ready:true,llm_ready:false,workflow_ready:true,provider:'openai',missing:[]}:[]));
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(fixture));dom.window.location.hash='#product';mount();const d=dom.window.document;
  await until(()=>d.querySelector('#explorationJob'));
  await new Promise(resolve=>setTimeout(resolve,2200));await until(()=>d.querySelector('.ex-connection-error'));
  assert.ok(d.querySelector('.ex-connection-error').textContent.includes('주소를 다시 연결'));
 });
});


test('active structure work permits review page but blocks audience navigation',async()=>{
 await environment(async({dom,mount})=>{
  const fixture=navigationStudy();fixture.workflow.source={kind:'web',url:'https://example.com',viewport:'desktop',exploration:{id:'active-job',status:'running',phase:'screens',version:1,budget:{states:200,seconds:300},states:4,attempts:5,pending_actions:15,pages_found:10,pages_checked:8,pages_failed:0}};
  const calls=[];globalThis.fetch=async(url,options={})=>{calls.push(url);let data=[];
   if(url.endsWith('/capabilities'))data={persona_ready:true,llm_ready:false,workflow_ready:true,provider:'openai',missing:[]};
   else if(url.endsWith('/exploration/review'))data={scope:{reviewed_exploration_id:'active-job'}};
   else if(url.endsWith('/exploration')){if(options.body)fixture.workflow.source.exploration={...fixture.workflow.source.exploration,status:'paused',version:2};data={job:fixture.workflow.source.exploration,source:{exploration:fixture.workflow.source.exploration}};}
   return new Response(JSON.stringify(data));};
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(fixture));dom.window.location.hash='#product';mount();const d=dom.window.document;
  await until(()=>d.querySelector('.ex-job'));
  await until(()=>d.querySelector('#v-product [data-step-next]').getAttribute('aria-disabled')==='false');
  assert.equal(d.getElementById('v-product').contains(d.getElementById('sourceDetails')),false);
  d.querySelector('#v-product [data-step-next]').click();await until(()=>dom.window.location.hash==='#source-review'&&d.getElementById('v-source-review').classList.contains('on'));
  assert.equal(d.getElementById('sourceReviewContinue').getAttribute('aria-disabled'),'true');assert.ok(d.getElementById('sourceReviewContinueHint').textContent.includes('구조 탐색'));
  d.getElementById('sourceReviewContinue').click();assert.equal(dom.window.location.hash,'#source-review');
  dom.window.location.hash='#panel';await until(()=>dom.window.location.hash==='#source-review');
  d.querySelector('[data-exploration-action="pause"]').click();await until(()=>d.querySelector('[data-exploration-review]'));
  assert.equal(d.getElementById('sourceReviewContinue').getAttribute('aria-disabled'),'true');
  d.querySelector('[data-exploration-review]').click();await until(()=>d.getElementById('sourceReviewContinue').getAttribute('aria-disabled')==='false');
  d.getElementById('sourceReviewContinue').click();await until(()=>dom.window.location.hash==='#panel'&&d.getElementById('v-panel').classList.contains('on'));
  assert.ok(!calls.some(url=>url.includes('/runs')||url.includes('/sources/web')));
 });
});

test('reload restores the server preview while the local draft stays small and private',async()=>{
 await environment(async({dom,mount})=>{
  const fixture=navigationStudy();fixture.workflow.source={kind:'web',url:'https://example.com',viewport:'desktop',preview:'data:image/png;base64,OLD',observed_screen:fixture.screens[0]};
  const fresh={...fixture.workflow,source:{...fixture.workflow.source,preview:'data:image/png;base64,NEW_SERVER_CAPTURE'}};
  const calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify(url.endsWith('/workflow')?fresh:url.endsWith('/capabilities')?{persona_ready:true,llm_ready:false,workflow_ready:true,provider:'openai',missing:[]}:[]));};
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(fixture));dom.window.location.hash='#product';mount();const d=dom.window.document;
  await until(()=>d.querySelector('.ri-capture img')?.src.includes('NEW_SERVER_CAPTURE'));
  assert.ok(calls.some(u=>u.endsWith('/workflow')));
  const cached=JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'));assert.equal(cached.workflow.source.preview,undefined);
 });
});


test('connection review is its own persisted page and previous keeps the connected input intact',async()=>{
 await environment(async({dom,mount})=>{
  const saved=navigationStudy(),calls=[];saved.workflow.source={kind:'manual'};
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(saved));
  globalThis.fetch=audienceFetch(calls);dom.window.location.hash='#product';mount();const d=dom.window.document;
  await until(()=>d.getElementById('pname').value===saved.product.name&&d.getElementById('v-product').classList.contains('on')&&d.querySelector('#v-product [data-step-next]').getAttribute('aria-disabled')==='false');
  assert.equal(d.getElementById('sourceDetails').closest('.view').id,'v-source-review');assert.equal(d.querySelector('#v-product #sourceDetails'),null);
  d.querySelector('#v-product [data-step-next]').click();await until(()=>dom.window.location.hash==='#source-review'&&d.getElementById('v-source-review').classList.contains('on'));
  assert.equal(d.querySelector('#workflowProgress [aria-current=step]').getAttribute('href'),'#source-review');
  assert.equal(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7:step:server:81'),'source-review');
  d.querySelector('#workflowProgress a[href="#source-review"]').click();assert.equal(dom.window.location.hash,'#source-review');
  d.querySelector('#v-source-review [data-step-back]').click();await until(()=>dom.window.location.hash==='#product');
  assert.equal(d.getElementById('pname').value,saved.product.name);assert.ok(!calls.some(c=>c.url.includes('/sources/')||c.url.includes('/runs')));
 });
 await environment(async({dom,mount})=>{
  const saved=navigationStudy(),key='personalab-connected-mockup-v1:user:7';dom.window.localStorage.setItem(key,JSON.stringify(saved));dom.window.localStorage.setItem(key+':step:server:81','source-review');
  globalThis.fetch=audienceFetch([]);dom.window.location.hash='#overview';mount();const d=dom.window.document;
  await until(()=>dom.window.location.hash==='#source-review'&&d.getElementById('v-source-review').classList.contains('on'));
  assert.equal(d.querySelector('#workflowProgress [aria-current=step]').getAttribute('href'),'#source-review');
 });
});


test('snapshot collection restores images, opens the chosen capture, and permits the next setup page',async()=>{
 await environment(async({dom,mount})=>{
  const fixture=navigationStudy(),image='data:image/png;base64,SNAPSHOT_CAPTURE';
  fixture.workflow.source={kind:'web',url:'https://example.com',viewport:'desktop',preview:image,observed_screen:fixture.screens[0],inspection:{capture_ready:true,captured_at:'2026-11-06T00:00:00Z',viewport:{width:1365,height:900},document:{width:1365,height:900},headings:[],landmarks:[],html_documents:[]},site_map:{mode:'snapshot',pages:[{url:'https://example.com/one',label:'Captured one',state:'loaded',image,issues:[]},{url:'https://example.com/two',label:'Later page',state:'pending',issues:[]}],edges:[],excluded_count:0,limit_reached:true,max_pages:24,max_discovered:1000},exploration:{id:'snapshots',mode:'snapshot',status:'done',phase:'complete',version:2,budget:{states:24,pages:24,seconds:20},states:1,pending_actions:0,pages_found:2,pages_checked:1,pages_failed:0}};
  const calls=[];globalThis.fetch=async(url)=>{calls.push(url);const data=url.endsWith('/workflow')?fixture.workflow:url.endsWith('/capabilities')?{persona_ready:true,llm_ready:false,workflow_ready:true,provider:'openai',missing:[]}:[];return new Response(JSON.stringify(data));};
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(fixture));dom.window.location.hash='#source-review';mount();const d=dom.window.document;
  await until(()=>d.querySelector('[data-snapshot-url]'));
  assert.equal(d.getElementById('sourceReviewContinue').getAttribute('aria-disabled'),'false');
  d.querySelector('[data-snapshot-url]').click();assert.ok(d.getElementById('sourceCaptureDialog').open);assert.ok(d.getElementById('sourceCaptureImage').src.includes('SNAPSHOT_CAPTURE'));assert.ok(d.getElementById('sourceCaptureImage').alt.includes('Captured one'));
  d.getElementById('closeSourceCapture').click();assert.equal(d.getElementById('sourceCaptureDialog').open,false);
  const cached=JSON.parse(dom.window.localStorage.getItem('personalab-connected-mockup-v1:user:7'));assert.equal(cached.workflow.source.site_map.pages[0].image,undefined);
  d.getElementById('sourceReviewContinue').click();await until(()=>dom.window.location.hash==='#panel');
  assert.ok(!calls.some(url=>url.includes('/runs')||url.includes('/sources/')));
 });
});


test('fixed sidebar blocks active results everywhere and unlocks a verified complete report without a new run',async()=>{
 await environment(async({dom,mount})=>{
  const saved=navigationStudy({executed:true,status:'running',records:true}),calls=[];
  saved.personas=[saved.personas[0],...([702,703].map(id=>({...saved.personas[0],id,attributes:{...saved.personas[0].attributes,source:{persona_id:'P'+id}}})))];
  let status='running',results=saved.results;
  globalThis.fetch=async(url,options={})=>{calls.push({url,method:options.method});let data=[];
   if(url.endsWith('/capabilities'))data={persona_ready:true,llm_ready:false,provider:'openai',missing:[]};
   else if(url.endsWith('/status'))data={id:900,status,progress:status==='done'?1:1/3};
   else if(url.endsWith('/report'))data={results};
   else if(url.endsWith('/interview'))data={messages:[],llm_allowed:false};
   return new Response(JSON.stringify(data));};
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(saved));dom.window.location.hash='#run';mount();const d=dom.window.document;
  await until(()=>d.getElementById('runActionState').textContent.includes('1/3'));
  const paths=()=>[...d.querySelectorAll('#stepper a')].map(a=>a.getAttribute('href'));
  assert.deepEqual(paths(),['#product','#run','#report','#interview']);assert.ok([...d.querySelectorAll('#stepper a')].every(a=>!a.hidden));
  assert.equal(d.getElementById('runResultLink').getAttribute('aria-disabled'),'true');d.getElementById('runResultLink').click();assert.equal(dom.window.location.hash,'#run');
  d.querySelector('#stepper a[href="#report"]').click();assert.equal(dom.window.location.hash,'#run');
  dom.window.location.hash='#interview';await until(()=>dom.window.location.hash==='#run');assert.ok(!calls.some(c=>c.url.endsWith('/interview')));
  status='done';results=[saved.results[0],...[702,703].map((id,i)=>({id,persona_id:'P'+id,ask:null,act:{path:['S1'],events:[],end:{result:'drop',screen:'S1',drop_reason:i?'MAX_TURNS':'PRIVACY'}}}))];
  d.getElementById('startRun').click();await until(()=>d.getElementById('runResultLink').getAttribute('aria-disabled')==='false');assert.equal(dom.window.location.hash,'#run');
  d.getElementById('runResultLink').click();await until(()=>d.getElementById('v-report').classList.contains('on'));
  assert.ok(d.querySelector('#liveReport .rv-summary-line').textContent.includes('3/3명'));assert.equal(d.querySelector('#liveReport [data-rv-tab="interview"]'),null);assert.deepEqual(paths(),['#product','#run','#report','#interview']);
  d.querySelector('#stepper a[href="#interview"]').click();await until(()=>d.getElementById('v-interview').classList.contains('on'));assert.equal(d.querySelector('#liveReport .rv-tabs').hidden,true);
  assert.ok(!calls.some(c=>c.method==='POST'&&c.url.endsWith('/runs')));
 });
});

test('a failed partial run opens an explicitly partial document and locks people without terminal records',async()=>{
 await environment(async({dom,mount})=>{
  const saved=navigationStudy({executed:true,status:'failed',records:true});saved.personas.push({...saved.personas[0],id:702,attributes:{...saved.personas[0].attributes,source:{persona_id:'P702'}}});
  globalThis.fetch=async(url)=>new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:true,llm_ready:false,provider:'openai',missing:[]}:url.endsWith('/status')?{id:900,status:'failed',progress:.5}:url.endsWith('/report')?{results:saved.results}:url.endsWith('/interview')?{messages:[],llm_allowed:false}:[]));
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(saved));dom.window.location.hash='#run';mount();const d=dom.window.document;
  await until(()=>d.getElementById('runResultLink').textContent.includes('부분 실행 기록'));
  d.getElementById('runResultLink').click();await until(()=>d.getElementById('v-report').classList.contains('on'));assert.ok(d.querySelector('#liveReport .rv-summary-line').textContent.includes('1/2명'));assert.ok(d.querySelector('#liveReport .rv-summary-line').textContent.includes('부분 실행 기록'));
  d.querySelector('#stepper a[href="#interview"]').click();await until(()=>d.getElementById('v-interview').classList.contains('on'));
  assert.equal(d.querySelector('[data-rv-select-person] option[value="702"]').disabled,true);
 });
});

test('cached complete-looking results cannot bypass the current running server state',async()=>{
 await environment(async({dom,mount})=>{
  const saved=navigationStudy({executed:true,status:'done',records:true});
  globalThis.fetch=async(url)=>new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:true,llm_ready:false,provider:'openai',missing:[]}:url.endsWith('/status')?{id:900,status:'running',progress:.8}:url.endsWith('/report')?{results:saved.results}:[]));
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(saved));dom.window.location.hash='#report';mount();const d=dom.window.document;
  await until(()=>dom.window.location.hash==='#run'&&d.getElementById('runActionState').textContent.includes('탐색 중'));
  assert.equal(d.getElementById('runResultLink').getAttribute('aria-disabled'),'true');assert.equal(d.getElementById('v-report').classList.contains('on'),false);
 });
});


test('verified completion stays accessible when only the image lookup fails',async()=>{
 await environment(async({dom,mount})=>{
  const saved=navigationStudy({executed:true,status:'running',records:true});
  globalThis.fetch=async(url)=>{if(url.includes('/evidence?'))return new Response(JSON.stringify({detail:'fixture image lookup failed'}),{status:503});return new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:true,llm_ready:false,workflow_ready:true,provider:'openai',missing:[]}:url.endsWith('/status')?{id:900,status:'done',progress:1}:url.endsWith('/report')?{results:saved.results}:[]));};
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(saved));dom.window.location.hash='#run';mount();const d=dom.window.document;
  await until(()=>d.getElementById('runResultLink').getAttribute('aria-disabled')==='false');assert.ok(d.getElementById('liveNotice').textContent.includes('이미지'));
  d.getElementById('runResultLink').click();await until(()=>d.getElementById('v-report').classList.contains('on'));assert.ok(d.querySelector('#liveReport .rv-summary-line').textContent.includes('1/1명'));
 });
});


test('a refreshed completed report returns to its document only after current server status is verified',async()=>{
 await environment(async({dom,mount})=>{
  const saved=navigationStudy({executed:true,status:'done',records:true});let finish;
  globalThis.fetch=async(url)=>{if(url.endsWith('/status'))return new Promise(resolve=>finish=resolve);return new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:true,llm_ready:false,provider:'openai',missing:[]}:url.endsWith('/report')?{results:saved.results}:[]));};
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(saved));dom.window.location.hash='#report';mount();const d=dom.window.document;
  await until(()=>finish&&dom.window.location.hash==='#run');assert.equal(d.getElementById('v-report').classList.contains('on'),false);
  finish(new Response(JSON.stringify({id:900,status:'done',progress:1})));await until(()=>dom.window.location.hash==='#report'&&d.getElementById('v-report').classList.contains('on'));
  assert.ok(d.querySelector('#liveReport .rv-summary-line').textContent.includes('1/1명'));
 });
});

test('new app dialog only creates new apps; further checks stack as rounds',async()=>{
  await environment(async({dom,mount})=>{
    globalThis.fetch=async()=>new Response(JSON.stringify({detail:'offline'}),{status:503}); // 서버 없이 이 브라우저의 초안만
    dom.window.location.hash='#workspace';mount();const d=dom.window.document,w=dom.window;
    await until(()=>d.querySelector('.workspace-server-note:not(.ws-loading)'));
    const proto=w.HTMLDialogElement.prototype;proto.showModal=function(){this.open=true;};proto.close=function(){this.open=false;};
    const submit=()=>d.getElementById('newTestForm').dispatchEvent(new w.Event('submit',{cancelable:true,bubbles:true}));
    d.querySelector('[data-create-study]').click();
    assert.equal(d.getElementById('newTestDialog').open,true);assert.equal(w.location.hash,'#workspace');
    assert.equal(d.getElementById('newTestProductField').hidden,true); // 아직 만든 앱·웹이 없으니 새 이름만 받는다
    assert.equal(d.getElementById('newTestTestTitle').value,'전반 탐색');
    d.getElementById('newTestName').value='   ';submit();
    assert.ok(d.getElementById('newTestError').textContent.includes('앱·웹 이름'));assert.equal(w.location.hash,'#workspace');
    d.getElementById('newTestName').value='일정메이트';submit();
    await until(()=>w.location.hash==='#product');
    assert.equal(d.getElementById('newTestDialog').open,false);
    assert.equal(d.getElementById('pname').value,'일정메이트');
    assert.equal(d.getElementById('studioContextName').textContent,'일정메이트 · 전반 탐색');
    // '새 앱·웹'은 목록에 앱·웹이 있어도 새 앱·웹만 만든다(같은 앱·웹의 다음 확인은 수정 회차로 쌓인다)
    w.location.hash='#workspace';await until(()=>d.querySelector('.ws-it'));
    d.querySelector('.ws-side-new').click();
    assert.equal(d.getElementById('newTestProductField').hidden,true);assert.equal(d.getElementById('newTestNameField').hidden,false);
    assert.equal(d.querySelector('.ws-detail [data-create-study][data-product]'),null);assert.equal(d.querySelector('.ws-prod-add'),null);
    d.getElementById('newTestName').value='북쉘프';submit();
    await until(()=>w.location.hash==='#product'&&d.getElementById('studioContextName').textContent==='북쉘프 · 전반 탐색');
    w.location.hash='#workspace';await until(()=>d.querySelectorAll('.ws-it').length===2);
    const labels=[...d.querySelectorAll('.ws-it .ws-it-name')].map(n=>n.textContent).sort();
    assert.deepEqual(labels,['북쉘프 · 전반 탐색','일정메이트 · 전반 탐색']);
  });
});

test('search lives in the sidebar and the calendar tab shows rounds by date',async()=>{
  await environment(async({dom,mount})=>{
    globalThis.KeyboardEvent=dom.window.KeyboardEvent; // 워크스페이스 핸들러가 참조한다(실제 브라우저에는 있다)
    globalThis.fetch=async()=>new Response(JSON.stringify({detail:'offline'}),{status:503});
    dom.window.location.hash='#workspace';mount();const d=dom.window.document,w=dom.window;
    await until(()=>d.querySelector('.workspace-server-note:not(.ws-loading)'));
    assert.ok(d.querySelector('#workspaceSidebar #workspaceSearch'));assert.equal(d.querySelector('.ws-tabbar #workspaceSearch'),null);
    startNew(d,undefined,'일정메이트');await until(()=>w.location.hash==='#product');
    w.location.hash='#workspace';await until(()=>d.querySelector('.ws-it'));
    startNew(d,undefined,'북쉘프');await until(()=>w.location.hash==='#product');
    w.location.hash='#workspace';await until(()=>d.querySelectorAll('.ws-it').length===2);
    // 사이드바 검색은 앱·웹 이름과 테스트 이름으로 거른다
    const q=d.getElementById('workspaceSearch');q.value='북쉘';q.dispatchEvent(new w.Event('input',{bubbles:true}));
    assert.equal(d.querySelectorAll('.ws-it').length,1);assert.ok(d.querySelector('.ws-it .ws-it-name').textContent.startsWith('북쉘프'));
    q.value='전반';q.dispatchEvent(new w.Event('input',{bubbles:true}));assert.equal(d.querySelectorAll('.ws-it').length,2);
    q.value='';q.dispatchEvent(new w.Event('input',{bubbles:true}));
    // 캘린더: 선택한 테스트의 회차를 날짜 칸에 보여 준다
    assert.ok([...d.querySelectorAll('[data-ws-tab]')].some(b=>b.dataset.wsTab==='cal'&&!b.hidden));
    d.querySelector('[data-ws-tab="cal"]').click();
    assert.ok(d.querySelector('.ws-calx'));assert.equal(d.querySelectorAll('.ws-cal-h').length,7);
    assert.ok(d.querySelectorAll('.ws-cal-e').length>=1);
    const title=d.querySelector('.ws-cal-bar b').textContent;
    d.querySelector('[data-ws-cal="next"]').click();assert.notEqual(d.querySelector('.ws-cal-bar b').textContent,title);
    d.querySelector('[data-ws-cal="today"]').click();assert.ok(d.querySelector('.ws-cal-d.td'));
  });
});


test('revision dialog offers the previous round text with one click',async()=>{
 await environment(async({dom,mount})=>{
  const saved=navigationStudy({executed:true,status:'done',records:true});saved.roundNote='온보딩 v3 · 회원가입 흐름 점검';
  dom.window.localStorage.setItem('personalab-connected-mockup-v1:user:7',JSON.stringify(saved));
  globalThis.fetch=async(url)=>new Response(JSON.stringify(url.endsWith('/capabilities')?{persona_ready:true,llm_ready:false,workflow_ready:true,provider:'openai',missing:[]}:url.endsWith('/report')?{results:saved.results}:url.endsWith('/status')?{id:900,status:'done',progress:1}:[]));
  const proto=dom.window.HTMLDialogElement.prototype;proto.showModal=function(){this.open=true;};proto.close=function(){this.open=false;};
  dom.window.location.hash='#run';mount();const d=dom.window.document;
  await until(()=>d.getElementById('v-run').classList.contains('on')&&!d.getElementById('newConnectedStudy').disabled);
  d.getElementById('newConnectedStudy').click();
  assert.equal(d.getElementById('newTestDialog').open,true);
  const reuse=d.getElementById('newTestNoteReuse');assert.equal(reuse.hidden,false);assert.ok(reuse.textContent.includes('온보딩 v3'));
  assert.equal(d.getElementById('newTestNote').value,'');
  reuse.click();assert.equal(d.getElementById('newTestNote').value,'온보딩 v3 · 회원가입 흐름 점검');
 });
});


test('empty trash asks for a confirmation phrase and then deletes every trashed test through one call',async()=>{
 await environment(async({dom,mount})=>{
  const calls=[];let emptied=false;
  const proto=dom.window.HTMLDialogElement.prototype;proto.showModal=function(){this.open=true;};proto.close=function(){this.open=false;};
  globalThis.KeyboardEvent=dom.window.KeyboardEvent;
  globalThis.fetch=async(url,options={})=>{
   const body=options.body&&JSON.parse(options.body);calls.push({url,body});let data=[];
   if(url.endsWith('/capabilities'))data={workspace_management_ready:true,persona_ready:true,llm_ready:false,missing:[]};
   else if(url.startsWith('/api/studies?'))data=emptied?[{id:60,name:'남은 테스트',status:'draft',root_study_id:60,revision:1,workspace:{trashed:false,archived:false}}]:[{id:60,name:'남은 테스트',status:'draft',root_study_id:60,revision:1,workspace:{trashed:false,archived:false}},{id:61,name:'버린 테스트',status:'draft',root_study_id:61,revision:1,workspace:{trashed:true,archived:false}}];
   else if(url.endsWith('/studies/trash/empty')){emptied=true;data={deleted:1,skipped:0,study_ids:[61]};}
   return new Response(JSON.stringify(data));
  };
  dom.window.location.hash='#workspace';mount();const d=dom.window.document;
  await until(()=>d.querySelector('[data-open-server="60"]'));
  assert.equal(d.getElementById('emptyTrashBtn').hidden,true);                       // 전체 보기에서는 보이지 않는다
  d.querySelector('[data-wm-view="trash"]').click();
  assert.equal(d.getElementById('emptyTrashBtn').hidden,false);assert.ok(d.getElementById('emptyTrashBtn').textContent.includes('(1)'));
  d.getElementById('emptyTrashBtn').click();assert.equal(d.getElementById('emptyTrashDialog').open,true);
  d.getElementById('emptyTrashInput').value='틀린 문구';d.getElementById('emptyTrashForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true,bubbles:true}));
  assert.ok(d.getElementById('emptyTrashError').textContent.includes('정확히'));assert.ok(!calls.some(c=>c.url.endsWith('/studies/trash/empty')));
  d.getElementById('emptyTrashInput').value='휴지통 비우기';d.getElementById('emptyTrashForm').dispatchEvent(new dom.window.Event('submit',{cancelable:true,bubbles:true}));
  await until(()=>calls.some(c=>c.url.endsWith('/studies/trash/empty')));
  assert.equal(calls.find(c=>c.url.endsWith('/studies/trash/empty')).body.confirmation,'휴지통 비우기');
  await until(()=>d.getElementById('emptyTrashBtn').hidden===true);
 });
});
