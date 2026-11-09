import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';

async function withReport(callback){
  const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
  const dom=new JSDOM('<main id="a"></main><main id="b"></main>',{url:'http://localhost/#sample',pretendToBeVisual:true});
  const originals=new Map();
  for(const[name,value]of Object.entries({window:dom.window,document:dom.window.document,CSS:{escape:s=>s}})){originals.set(name,Object.getOwnPropertyDescriptor(globalThis,name));Object.defineProperty(globalThis,name,{value,writable:true,configurable:true});}
  let views=[];
  try {
    const {mockReportStudy}=await server.ssrLoadModule('/src/mockup/ReportFixture.ts');
    const {mountReport}=await server.ssrLoadModule('/src/mockup/ReportView.ts');
    const model=await server.ssrLoadModule('/src/mockup/ReportModel.ts');
    const exporter=await server.ssrLoadModule('/src/mockup/ReportExport.ts');
    const printer=await server.ssrLoadModule('/src/mockup/ReportPrint.ts');
    const workflow=await server.ssrLoadModule('/src/mockup/WorkflowView.ts');
    const {DEMO}=await server.ssrLoadModule('/src/studio/model.ts');
    await callback({dom,workflow,fixture:mockReportStudy,model,exporter,printer,DEMO,mount:(id,study,options)=>{const view=mountReport(dom.window.document.getElementById(id),study,options);views.push(view);return view;}});
  } finally {views.forEach(v=>v.dispose());dom.window.close();await server.close();for(const[k,v]of originals){if(v)Object.defineProperty(globalThis,k,v);else delete globalThis[k];}}
}
test('mixed outcomes keep unreceived and system stops out of user findings and export provenance',async()=>withReport(async({fixture,model,exporter,DEMO})=>{
  const original=JSON.stringify(DEMO),s=fixture(),a=model.analyzeReport(s);
  assert.equal(a.total,6);assert.equal(a.records.length,5);assert.equal(a.complete.length,2);assert.equal(a.dropped.length,2);assert.equal(a.system.length,1);assert.equal(a.pending.length,1);
  assert.deepEqual(a.findings.map(f=>f.code),['PRIVACY','TOO_MANY_STEPS']);assert.equal(a.coverage[2].system,1);assert.equal(a.coverage[4].arrived,2);
  const payload=exporter.reportPayload(s);assert.equal(payload.source,'ui-mock');assert.equal(payload.response_label,'UI Mock Data');assert.equal(payload.summary.pending,1);assert.equal(payload.findings[0].denominator,5);
  assert.ok(exporter.reportMarkdown(s).includes('실제 실행 결과가 아닙니다'));assert.ok(exporter.reportMarkdown(s).includes('결과 없음'));
  assert.ok(model.recordAnswer(s,102,'왜 홈에서 멈췄나요?').includes('방문하지 않은 화면'));
  assert.ok(model.recordAnswer(s,105,'왜 멈췄나요?').includes('한도'));assert.ok(!model.recordAnswer(s,105,'왜 멈췄나요?').includes('개인정보'));
  assert.ok(model.recordAnswer(s,101,'왜 멈췄나요?').includes('중단 이유는 없습니다'));assert.ok(model.recordAnswer(s,106,'왜 멈췄나요?').includes('아직 없습니다'));
  assert.equal(JSON.stringify(DEMO),original);
}));
test('finding selection updates screen and quote; filters, keyboard tabs and per-person questions stay scoped',async()=>withReport(async({fixture,dom,mount,DEMO})=>{
  const view=mount('a',fixture());mount('b',DEMO);const host=dom.window.document.getElementById('a'),other=dom.window.document.getElementById('b');
  host.querySelector('[data-rv-finding="1"]').click();assert.ok(host.querySelector('.rv-evidence h2').textContent.includes('관심분야'));assert.ok(host.querySelector('blockquote').textContent.includes('다섯 개'));
  host.querySelector('[data-rv-interview]').click();host.querySelector('[data-rv-question="0"]').click();assert.ok(host.querySelector('.rv-messages').textContent.includes('다섯 개'));assert.equal(other.querySelectorAll('.rv-messages').length,0);
  host.querySelector('[data-rv-chat-person="102"]').click();assert.equal(host.querySelectorAll('.rv-messages article').length,0);host.querySelector('[data-rv-question="2"]').click();assert.ok(host.querySelector('.rv-messages').textContent.includes('방문하지 않은 화면'));
  host.querySelector('[data-rv-chat-person="103"]').click();assert.ok(host.querySelector('.rv-messages').textContent.includes('다섯 개'));
  host.querySelector('[data-rv-tab="interview"]').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));assert.equal(host.querySelector('[data-rv-tab="records"]').getAttribute('aria-selected'),'true');assert.equal(dom.window.document.activeElement.dataset.rvTab,'records');
  const select=host.querySelector('[data-rv-filter]');select.value='pending';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));assert.equal(host.querySelectorAll('tbody tr').length,1);assert.ok(host.querySelector('tbody').textContent.includes('M06'));
  host.querySelector('[data-rv-record="106"]').click();assert.ok(host.querySelector('blockquote').textContent.includes('방문하지 않았습니다'));
  view.update(DEMO);assert.equal(host.querySelectorAll('[data-rv-finding]').length,2);assert.equal(host.querySelector('[data-rv-tab="overview"]').getAttribute('aria-selected'),'true');host.querySelector('[data-rv-tab="interview"]').click();assert.equal(host.querySelectorAll('.rv-messages article').length,0);
}));
test('empty report and untrusted text never fabricate completion or execute markup',async()=>withReport(async({fixture,dom,mount})=>{
  const s=fixture();s.id='empty';s.results=[];s.personas=[];s.screens=[];s.product.name='<img src=x onerror=alert(1)>';s.status='draft';mount('a',s);const host=dom.window.document.getElementById('a');
  assert.ok(host.textContent.includes('탐색 결과를 기다리고'));assert.equal(host.querySelectorAll('img').length,0);assert.equal(host.querySelector('.rv-metrics strong').textContent,'0 / 0명');
  host.querySelector('[data-rv-tab="interview"]').click();const input=host.querySelector('[data-rv-input]');assert.equal(input.disabled,true);input.value='<script>alert(1)</script>';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));host.querySelector('[data-rv-form]').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));assert.equal(host.querySelectorAll('script').length,0);assert.ok(host.querySelector('.rv-messages').textContent.includes('아직 없습니다'));
}));

test('interviews default to LLM only when both grants allow it; records stay selectable and a manual choice sticks',async()=>withReport(async({fixture,dom,mount})=>{
  let permitted=true;const calls=[];
  const view=mount('a',fixture(),{canUseLlm:()=>permitted,loadInterview:async()=>({messages:[],llm_allowed:true}),askInterview:async(id,question,mode)=>{calls.push({id,mode});return {question,answer:'mock answer',mode,evidence:[{log_id:9,screen_id:'S02',screen_label:'회원가입'}]};}});
  view.showTab('interview');await new Promise(r=>setTimeout(r,0));const host=dom.window.document.getElementById('a');
  assert.equal(host.querySelector('[data-rv-mode]').value,'llm');   // 두 허용이 모두 있으면 LLM이 기본
  host.querySelector('[data-rv-question="0"]').click();await new Promise(r=>setTimeout(r,0));assert.equal(calls[0].mode,'llm');
  assert.ok(host.querySelector('.rv-messages').textContent.includes('로그를 근거로 생성한 AI 답변'));
  let select=host.querySelector('[data-rv-mode]');select.value='records';select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));   // 직접 고른 방식은 유지된다
  host.querySelector('[data-rv-question="0"]').click();await new Promise(r=>setTimeout(r,0));assert.equal(calls[1].mode,'records');
  permitted=false;host.querySelector('[data-rv-question="0"]').click();await new Promise(r=>setTimeout(r,0));assert.equal(calls[2].mode,'records');
  assert.equal(host.querySelector('[data-rv-mode] option[value="llm"]').disabled,true);
  const blocked=mount('b',fixture(),{canUseLlm:()=>true,loadInterview:async()=>({messages:[],llm_allowed:false})});blocked.showTab('interview');await new Promise(r=>setTimeout(r,0));assert.equal(dom.window.document.querySelector('#b [data-rv-mode] option[value="llm"]').disabled,true);assert.equal(dom.window.document.querySelector('#b [data-rv-mode]').value,'records');
}));

test('interview source identity change clears conversations and blocks a late answer',async()=>withReport(async({fixture,dom,mount})=>{
  let finish;const s=fixture();const view=mount('a',s,{askInterview:()=>new Promise(r=>{finish=r;})});const host=dom.window.document.getElementById('a');
  view.showTab('interview');host.querySelector('[data-rv-question="0"]').click();
  const other=fixture();other.id='other-owner';view.update(other);finish({question:'old private question',answer:'old private answer'});await new Promise(r=>setTimeout(r,0));view.showTab('interview');
  assert.ok(!host.textContent.includes('old private'));assert.equal(host.querySelectorAll('.rv-messages article').length,0);
}));


test('print report includes every finding, coverage, source and original quote safely',async()=>withReport(async({fixture,printer,dom})=>{
  const s=fixture();s.product.name='<img src=x onerror=alert(1)>';const host=dom.window.document.getElementById('a');host.innerHTML=printer.printableReport(s);
  assert.equal(host.querySelectorAll('img,script').length,0);assert.ok(host.textContent.includes('UI 목데이터'));
  assert.ok(host.textContent.includes('개인정보 요구'));assert.ok(host.textContent.includes('복잡한 절차'));
  assert.ok(host.textContent.includes('결과 없음 1명'));assert.ok(host.textContent.includes('탐색 한도 1명'));assert.ok(host.textContent.includes('수정 효과가 입증된 결론이 아닌'));
  for(const p of s.personas)assert.ok(host.textContent.includes(p.attributes.source.persona_id));
  for(const screen of s.screens)assert.ok(host.textContent.includes(screen.label));
}));


test('revision comparison distinguishes changed goals and unobserved issues from fixes',async()=>withReport(async({fixture,workflow})=>{
  const a=fixture(),b=structuredClone(a);
  a.workflow={revision:1,source:{kind:'web'},scope:{goal_url:'https://example.com/done',goal_text:'',scenario:'탐색',viewport:'desktop',focus:''}};
  b.workflow=structuredClone(a.workflow);b.workflow.revision=2;
  assert.ok(workflow.comparisonMarkup(a,b).includes('페르소나와 탐색 조건이 같습니다.'));
  b.workflow.scope.goal_url='https://example.com/other';
  assert.ok(workflow.comparisonMarkup(a,b).includes('탐색 조건이 달라졌습니다.'));
  b.results=[];
  const out=workflow.comparisonMarkup(a,b);
  assert.ok(out.includes('이번 회차에서 관찰되지 않음'));
  assert.ok(out.includes('해결 여부는 방문 범위를 함께 확인'));
}));


test('browser reports keep captured evidence and unknown site coverage in exports',async()=>withReport(async({fixture,exporter,printer,mount,dom})=>{
  const s=fixture();s.workflow={revision:2,root_study_id:1,source:{kind:'html'},scope:{goal_url:'/done.html'}};
  s.evidence=[{id:11,persona_id:s.personas[0].id,turn:0,screen:s.screens[0],image:'/api/runs/4/evidence/11/image',action:{action:'click'}}];
  const payload=exporter.reportPayload(s);
  assert.equal(payload.workflow.revision,2);assert.equal(payload.evidence[0].image,s.evidence[0].image);
  assert.ok(payload.limits.some(x=>x.includes('미방문 영역은 집계하지 않습니다')));
  assert.ok(exporter.reportMarkdown(s).includes('전체 사이트 대비 비율 아님'));
  assert.ok(printer.printableReport(s).includes('미방문 영역은 집계하지 않습니다'));
  mount('a',s);assert.ok(dom.window.document.getElementById('a').textContent.includes('미방문 영역은 집계하지 않습니다'));
}));


test('overview offers comparison only for two completed rounds and report respects a running revision lock',async()=>{
 await withReport(async({dom,workflow,fixture,mount})=>{
  const study=fixture();study.serverId=81;study.status='running';study.runs={act:900};
  const revisions=[{study_id:81,revision:2,name:'2차',status:'running',runs:[{id:900,mode:'act',status:'running',progress:.3}]},{study_id:80,revision:1,name:'1차',status:'done',runs:[{id:899,mode:'act',status:'done',progress:1}]}];
  assert.ok(!workflow.overviewMarkup(study,revisions).includes('href="#compare"'));
  revisions[0].runs[0].status='done';assert.ok(workflow.overviewMarkup(study,revisions).includes('href="#compare"'));
  mount('a',study,{onNext:()=>{},canCreateNext:()=>false});
  assert.equal(dom.window.document.querySelector('[data-rv-next]').disabled,true);
 });
});


test('independent report labels partial runs in screen and exports and moves interview outside report tabs',async()=>withReport(async({fixture,dom,mount,exporter,printer})=>{
 const s=fixture();s.status='failed';const changes=[];const view=mount('a',s,{independentInterview:true,onTabChange:t=>changes.push(t)}),host=dom.window.document.getElementById('a');
 assert.ok(host.textContent.includes('부분 실행 기록'));assert.equal(host.querySelector('[data-rv-tab="interview"]'),null);
 assert.equal(exporter.reportPayload(s).completion.partial,true);assert.ok(exporter.reportMarkdown(s).includes('부분 실행 기록'));assert.ok(printer.printableReport(s).includes('PARTIAL EXECUTION RECORD'));
 const person=s.results.find(r=>r.act).id;view.selectPersona(person,'interview');assert.equal(changes.at(-1),'interview');assert.equal(host.querySelector('.rv-tabs').hidden,true);
 assert.ok(host.querySelector('[role=tabpanel]').getAttribute('aria-labelledby').includes('interview-title'));
}));


test('compact report bounds long lists, separates coverage and preserves full evidence and exports',async()=>withReport(async({fixture,dom,mount,exporter})=>{
 const s=fixture();const reason='상세 판단 원문입니다. '.repeat(70)+'끝까지 보존';
 for(const r of s.results)if(r.act)for(const e of r.act.events)e.reason=reason;
 s.workflow={source:{kind:'web',site_map:{pages:Array.from({length:31},(_,i)=>({url:`https://example.com/p${i}`,label:`페이지 ${i}`,state:'loaded',issues:[]})),edges:[],max_pages:31,limit_reached:true}},scope:{exploration:'site'}};
 const more=Array.from({length:24},(_,i)=>({...structuredClone(s.personas[0]),id:700+i,attributes:{...structuredClone(s.personas[0].attributes),source:{persona_id:`P${700+i}`}}}));s.personas.push(...more);
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
 const view=mount('a',s,{compact:true,independentInterview:true}),host=dom.window.document.getElementById('a');
 assert.ok(host.querySelector('.rv-compact'));assert.equal(host.querySelector('.rv-metrics'),null);assert.equal(host.querySelector('.rv-coverage'),null);assert.equal(host.querySelector('.site-coverage'),null);
 assert.equal(host.querySelector('[data-rv-tab="interview"]'),null);assert.ok(host.querySelector('[data-rv-tab="coverage"]'));
 host.querySelector('[data-rv-tab="records"]').click();
 assert.ok(host.querySelector('.rv-compact-quote blockquote').textContent.length<=191);
 host.querySelector('[data-rv-detail]').click();assert.equal(host.querySelector('dialog').open,true);assert.ok(host.querySelector('dialog').textContent.includes(reason));
 host.querySelector('[data-rv-close-detail]').click();assert.equal(host.querySelector('dialog'),null);assert.ok(exporter.reportMarkdown(s).includes(reason));
 host.querySelector('[data-rv-tab="coverage"]').click();assert.equal(host.querySelectorAll('tbody tr').length,6);assert.ok(!host.querySelector('.rv-findings-layout'));host.querySelector('[data-rv-page="coverage:1"]').click();assert.ok(host.querySelector('tbody').textContent.includes('페이지 6'));assert.ok(!host.querySelector('tbody').textContent.includes('페이지 0'));
 host.querySelector('[data-rv-tab="records"]').click();assert.equal(host.querySelectorAll('[data-rv-record]').length,6);host.querySelector('[data-rv-page="records:1"]').click();assert.equal(host.querySelectorAll('[data-rv-record]').length,6);
 view.showTab('overview');assert.ok(host.querySelectorAll('.rp-card').length>=1);assert.ok(host.querySelector('.rp-card [data-rv-interview]'));assert.ok(host.querySelector('.rp-conclusion').textContent.includes('멈'));
}));

test('compact interview keeps one composer, preserves per-person history and exposes LLM transmission cost',async()=>withReport(async({fixture,dom,mount})=>{
 const s=fixture(),id=s.results.find(r=>r.act).id;let sent;
 const view=mount('a',s,{compact:true,independentInterview:true,canUseLlm:()=>true,loadInterview:async()=>({messages:[],llm_allowed:true}),askInterview:async(person,question,mode)=>{sent={person,question,mode};return {question,answer:'저장된 맥락에서 답했습니다.',mode};}}),host=dom.window.document.getElementById('a');
 view.selectPersona(id,'interview');await new Promise(r=>setTimeout(r,0));
 assert.equal(host.querySelectorAll('textarea').length,1);assert.ok(host.querySelectorAll('[data-rv-question]').length<=2);assert.equal(host.querySelector('.rv-chat-intro'),null);assert.ok(host.querySelector('.rv-tabs').hidden);
 const mode=host.querySelector('[data-rv-mode]');mode.value='llm';mode.dispatchEvent(new dom.window.Event('change',{bubbles:true}));assert.ok(host.querySelector('.rv-mode-warning').textContent.includes('모델에 전송'));assert.ok(host.querySelector('.rv-mode-warning').textContent.includes('토큰 사용'));
 const input=host.querySelector('[data-rv-input]');input.value='어디서 멈췄나요?';input.dispatchEvent(new dom.window.Event('input',{bubbles:true}));host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true}));await new Promise(r=>setTimeout(r,0));
 assert.equal(sent.mode,'llm');assert.equal(sent.person,id);assert.ok(host.querySelector('.rv-messages').textContent.includes('저장된 맥락'));assert.equal(host.querySelector('.rv-question-chips'),null);assert.equal(host.querySelector('[data-rv-input]').value,'');
 const next=s.results.find(r=>r.act&&r.id!==id).id,select=host.querySelector('[data-rv-select-person]');select.value=String(next);select.dispatchEvent(new dom.window.Event('change',{bubbles:true}));await new Promise(r=>setTimeout(r,0));assert.ok(!host.querySelector('.rv-messages').textContent.includes('저장된 맥락'));assert.equal(host.querySelector('[data-rv-mode]').value,'llm');
}));

test('system-forced NAVIGATION_LOST is not a user drop, but a persona-chosen abandon with the same code is',async()=>withReport(async({model})=>{
  const act=(events,end)=>({id:1,persona_id:'P1',ask:null,act:{path:['S1','S2'],events,end}});
  const click={turn:1,screen:'S1',action:'click',target:'다음',reason:'둘러보려고 눌렀어요'};
  const forced=act([click,{turn:2,screen:'S2',action:'scroll',target:null,reason:'조금 더 내려 봤어요'}],{result:'drop',screen:'S2',drop_reason:'NAVIGATION_LOST'});
  const chosen=act([click,{turn:2,screen:'S2',action:'abandon',target:null,reason:'어디로 가야 할지 모르겠어요',drop_reason:'NAVIGATION_LOST'}],{result:'drop',screen:'S2',drop_reason:'NAVIGATION_LOST'});
  assert.equal(model.outcome(forced),'system');   // 시스템이 같은 화면 반복을 끊은 것: 탐색 마침
  assert.equal(model.outcome(chosen),'drop');     // 페르소나가 직접 포기한 것: 사용자 이탈
  assert.equal(model.outcomeLabel(forced),'탐색 마침');
}));

test('comparison keeps neutral metrics neutral, flags AI noise and changed model, and uses arrivals as the denominator',async()=>withReport(async({fixture,workflow})=>{
  const a=fixture(),b=structuredClone(a);
  a.workflow={revision:1,source:{kind:'web'},scope:{goal_url:'https://example.com/done',goal_text:'',scenario:'탐색',viewport:'desktop',focus:''}};
  b.workflow=structuredClone(a.workflow);b.workflow.revision=2;
  // 시스템 종료만 늘어난 비교: 개선이 아니므로 good/bad 색이 붙으면 안 된다
  const sys=(s,n)=>{s.results=s.results.map((r,i)=>i<n&&r.act?{...r,act:{...r.act,end:{result:'drop',screen:r.act.path.at(-1),drop_reason:'MAX_TURNS'}}}:r);};
  sys(a,0);sys(b,2);
  const rule=workflow.comparisonMarkup(a,b);
  const systemCard=rule.split('<div class="cmp-card">').find(c=>c.includes('탐색 마침·한도'));
  assert.ok(systemCard&&!/cmp-delta (good|bad)/.test(systemCard));
  assert.ok(!rule.includes('오차 범위'));   // 규칙 기반은 같은 입력이면 같은 결과라 오차 경고가 없다
  // AI(LLM) 실행: 작은 차이는 오차 범위, 모델·프롬프트가 달라지면 조건 변경 안내
  a.runMeta={engine:'llm',model:'gpt-5.4-mini',prompt_rev:'r1'};b.runMeta={engine:'llm',model:'gpt-5.4-mini',prompt_rev:'r1'};
  const ai=workflow.comparisonMarkup(a,b);
  assert.ok(ai.includes('cmp-noise-note')&&ai.includes('같은 조건에서도 매번 조금씩'));
  b.runMeta={engine:'llm',model:'other-model',prompt_rev:'r2'};
  const changed=workflow.comparisonMarkup(a,b);
  assert.ok(changed.includes('탐색 조건이 달라졌습니다.')&&changed.includes('AI 엔진·모델·프롬프트 개정이 달라서'));
  // 문제 표의 분모는 전체 참여가 아니라 그 화면에 도착한 사람
  assert.ok(/명 멈춤 \/ 도착 \d+명/.test(workflow.comparisonMarkup(a,b))||workflow.comparisonMarkup(a,b).includes('cmp-empty'));
}));
