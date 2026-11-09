import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {JSDOM} from 'jsdom';
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
const {sourceRecognitionMarkup:render,sourceDetailsMarkup:details,sourceNeedsReconnect}=await server.ssrLoadModule('/src/mockup/SourceRecognition.ts');
const {newStudy}=await server.ssrLoadModule('/src/studio/model.ts');
test.after(()=>server.close());
const dom=html=>new JSDOM(html).window.document;
const image='data:image/png;base64,iVBORw0KGgo=';
function fixture(){
 const s=newStudy();s.screens=[{id:'later',label:'실행 중 다른 화면',description:'',elements:[]}];
 s.workflow={source:{kind:'html',entry:'index.html',viewport:'mobile',preview:image,observed_screen:{id:'initial',label:'예약 앱',description:'화면 원문',url:'/index.html',elements:[{text:'예약 확인',kind:'a',href:'/done.html',to:null},{text:'이름',kind:'input',type:'text',to:null}]},inspection:{captured_at:'2026-11-05T01:00:00Z',viewport:{width:390,height:844},document:{width:390,height:1300},headings:[{level:1,text:'<img onerror=bad> 예약'}],heading_count:1,landmarks:[{role:'main',label:'예약 관리'}],landmark_count:1,element_count:158,elements_truncated:true,image_count:1,unloaded_image_count:1,frame_count:10,dialog_count:0,blocked_request_count:21,html_documents:['index.html','done.html']},site_map:{pages:Array.from({length:9},(_,i)=>({url:`/p${i}.html`,label:`연결 페이지 ${i+1}`,state:i===8?'error':'loaded',issues:[]})),edges:[],excluded_count:2,limit_reached:false,max_pages:20}},scope:{product_kind:'ios',viewport:'mobile'}};return s;
}

test('empty/loading/error connection states never invent page results',()=>{
 const s=newStudy();assert.ok(dom(render(s)).body.textContent.includes('연결 대기'));assert.equal(details(s),'');
 assert.ok(dom(render(s,{phase:'loading'})).querySelector('[role=status]'));assert.equal(details(s,{phase:'loading'}),'');
 const failed=dom(render(s,{phase:'error',error:'<script>bad</script>'}));assert.equal(failed.querySelector('script'),null);assert.ok(failed.querySelector('[role=alert]').textContent.includes('<script>bad</script>'));
});

test('preview stays compact while partial recognition and exact missing scope remain visible below',()=>{
 const s=fixture(),preview=dom(render(s)),review=dom(details(s));
 assert.ok(preview.body.textContent.includes('予約')===false);assert.ok(preview.body.textContent.includes('예약 앱'));assert.ok(!preview.body.textContent.includes('실행 중 다른 화면'));
 assert.ok(preview.body.textContent.includes('시작 화면 캡처'));assert.ok(preview.body.textContent.includes('390 × 844'));assert.ok(preview.querySelector('[data-source-zoom]'));
 assert.equal(preview.querySelector('.ri-stats,.ri-elements,.site-coverage,.ri-headings'),null);assert.ok(preview.querySelector('.ri-status').textContent.includes('일부 확인 필요'));
 assert.ok(review.body.textContent.includes('158개 중 2개'));assert.ok(review.body.textContent.includes('내장된 화면 영역 10개'));assert.ok(review.body.textContent.includes('요청 21건'));
 assert.equal(review.querySelector('[role=tab][aria-selected=true]').dataset.recognitionTab,'checks');
 assert.ok(!review.body.textContent.includes('페르소나 방문'));assert.ok(!review.body.textContent.includes('페르소나 미방문'));assert.equal(review.querySelector('[onerror]'),null);
 const structure=dom(details(s,{phase:'idle'},'',{tab:'structure'}));assert.equal(structure.querySelectorAll('details[open]').length,0);assert.ok(structure.querySelector('.ri-elements').textContent.includes('이름'));
 assert.ok(structure.body.textContent.includes('<img onerror=bad> 예약'));assert.equal(structure.querySelector('[onerror]'),null);
});

test('page review paginates structure results without pre-run visitor statistics',()=>{
 const s=fixture(),first=dom(details(s,{phase:'idle'},'',{tab:'pages',page:0})),last=dom(details(s,{phase:'idle'},'',{tab:'pages',page:1}));
 assert.equal(first.querySelectorAll('.sr-page-row').length,6);assert.equal(last.querySelectorAll('.sr-page-row').length,3);assert.ok(last.body.textContent.includes('열지 못함'));
 assert.ok(first.body.textContent.includes('발견한 9개 페이지 중 8개'));assert.equal(first.querySelector('[data-recognition-page="-1"]').disabled,true);assert.equal(last.querySelector('[data-recognition-page="2"]').disabled,true);
 assert.ok(!first.body.textContent.includes('미방문'));assert.ok(!last.body.textContent.includes('페르소나 방문'));
});

test('viewport changes demand reconnect while failed reconnection retains previous source clearly',()=>{
 const s=fixture();s.workflow.scope.viewport='desktop';assert.ok(sourceNeedsReconnect(s));
 const preview=dom(render(s,{phase:'error',error:'failed'})),review=dom(details(s,{phase:'error',error:'failed'}));
 assert.ok(preview.body.textContent.includes('이전에 연결한 화면'));assert.equal(preview.querySelector('.ri-capture img').getAttribute('src'),image);
 assert.ok(review.body.textContent.includes('캡처는 이전 크기'));assert.ok(review.body.textContent.includes('이전에 성공한 연결 자료'));
});

test('registered images select independently and remain distinct from automatic screen recognition',()=>{
 const s=newStudy();s.screens=[{id:'A',label:'첫 시안',description:'등록한 설명',image,elements:[{text:'다음',to:'B'}]},{id:'B',label:'다음 시안',description:'두 번째 설명',elements:[]},{id:'C',label:'연결 안 된 시안',description:'',elements:[]}];s.workflow={source:{kind:'manual'},scope:{product_kind:'android',viewport:'mobile'}};
 assert.equal(dom(render(s)).querySelector('.ri-capture img').getAttribute('src'),image);
 assert.ok(dom(details(s)).body.textContent.includes('연결되지 않은 화면 1개'));
 const second=dom(render(s,{phase:'idle'},'B'));assert.equal(second.querySelector('.ri-capture img'),null);assert.equal(second.querySelector('#sourceScreenSelect').value,'B');
 const more=dom(details(s,{phase:'idle'},'B',{tab:'structure'}));assert.ok(more.body.textContent.includes('두 번째 설명'));assert.ok(more.body.textContent.includes('자동 추론한 결과가 아닙니다'));
});


test('preflight scenes and real transitions lead the review, with tag-only hints kept in technical details',()=>{
 const s=fixture();s.workflow.source.site_map.pages[0].issues=[{code:'H1_MISSING',label:'대표 제목 확인 필요',count:1}];
 s.workflow.source.preflight={states:[{id:'a',label:'시작 장면',url:'/index.html',excerpt:'실제 시작',path:[],element_count:2,image},{id:'b',label:'인물 설정',url:'/index.html',excerpt:'이름 입력',path:['게임 시작'],element_count:3,image}],transitions:[{from:'a',to:'b',action:'게임 시작',path:['게임 시작'],status:'changed'}],skipped:[],attempts:1,clicks:1,input_fills:0,limited:false,status:'done'};
 const review=dom(details(s));assert.equal(review.querySelector('[role=tab][aria-selected=true]').dataset.recognitionTab,'pages');assert.equal(review.querySelectorAll('.pf-state-card').length,2);
 assert.ok(review.body.textContent.includes('2개 화면 상태'));assert.ok(review.body.textContent.includes('1개 화면 전환'));assert.ok(review.body.textContent.includes('게임 시작'));assert.equal(review.querySelectorAll('.pf-thumb img').length,2);
 assert.ok(!review.body.textContent.includes('H1'));assert.ok(!dom(details(s,{phase:'idle'},'',{tab:'checks'})).body.textContent.includes('대표 제목 확인 필요'));
 assert.ok(dom(details(s,{phase:'idle'},'',{tab:'structure'})).body.textContent.includes('대표 제목 태그(H1) 없음'));
});


test('primary menu coverage links to its scene and keeps pending destinations visibly unconfirmed',()=>{
 const s=fixture();s.workflow.source.preflight={states:Array.from({length:9},(_,i)=>({id:'scene'+i,label:'화면 '+i,url:'/index.html',excerpt:'내용',path:['열기'],element_count:2,image})),transitions:[],skipped:[],attempts:1,clicks:1,input_fills:0,limited:true,status:'partial',navigation:[{id:'n1',label:'설정',group:'main',kind:'global',status:'visited',state_id:'scene8',attempts:1},{id:'n2',label:'브리핑',group:'main',kind:'global',status:'pending',state_id:null,attempts:0}]};
 const d=dom(details(s,{phase:'idle'},'',{stateId:'scene8'}));
 assert.ok(d.querySelector('.pf-menu-review').textContent.includes('1 / 2개 메뉴 확인'));
 assert.equal(d.querySelector('[data-recognition-state="scene8"]').disabled,false);assert.equal(d.querySelector('[data-recognition-state=""]').disabled,true);
 assert.equal(d.querySelectorAll('.pf-state-card').length,3);assert.equal(d.querySelector('.pf-selected').dataset.preflightState,'scene8');
 const checks=dom(details(s,{phase:'idle'},'',{tab:'checks'}));assert.ok(checks.body.textContent.includes('아직 들어가 보지 못한 메뉴'));assert.ok(checks.body.textContent.includes('브리핑'));
});


test('background structure progress keeps unknown scope honest and offers pause or resume',()=>{
 const s=fixture();s.workflow.scope.viewport='mobile';
 const base={id:'job1',status:'running',phase:'screens',version:2,budget:{states:200,seconds:300},states:42,pending_actions:108,pages_found:70,pages_checked:35,pages_failed:2,elapsed_seconds:20};
 s.workflow.source.exploration=base;
 let d=dom(details(s));
 assert.equal(d.querySelector('[data-exploration-action]').dataset.explorationAction,'pause');
 assert.ok(d.querySelector('.ex-job').textContent.includes('42'));assert.ok(d.querySelector('.ex-job').textContent.includes('108'));
 assert.ok(d.querySelector('[role=progressbar]'));assert.equal(d.querySelector('[role=progressbar]').getAttribute('aria-valuenow'),'0');
 assert.ok(!d.querySelector('.sr-panel').textContent.includes('페이지 조사가 한도에서 멈췄어요'));
 s.workflow.source.exploration={...base,status:'paused',reason:'server_restart'};
 d=dom(details(s));assert.equal(d.querySelector('[data-exploration-action]').dataset.explorationAction,'resume');assert.ok(d.querySelector('.ex-job').textContent.includes('서버가 재시작'));
 s.workflow.source.exploration={...base,status:'limited'};d=dom(details(s));assert.ok(d.querySelector('.ex-job').textContent.includes('예산이 늘어납니다'));
 s.workflow.source.exploration.reason='unconfirmed_paths';d=dom(details(s));assert.ok(d.querySelector('.ex-job').textContent.includes('확인하지 못한 경로'));assert.ok(!d.querySelector('.ex-job').textContent.includes('예산이 늘어납니다'));
 s.runs={act:123};d=dom(details(s));assert.equal(d.querySelector('[data-exploration-action]'),null);assert.ok(d.querySelector('[data-exploration-show]'));
});


test('AICOSS-style informational limits keep connection successful and progress visible before notes',()=>{
 const s=fixture();delete s.workflow.source.site_map;
 Object.assign(s.workflow.source.inspection,{element_count:99,frame_count:0,dialog_count:0,blocked_request_count:3,unloaded_image_count:1});
 s.workflow.source.exploration={id:'aicoss',status:'running',phase:'pages',version:1,budget:{states:200,seconds:300},states:0,pending_actions:0,pages_found:40,pages_checked:5,pages_failed:0,elapsed_seconds:4};
 const preview=dom(render(s)),review=dom(details(s));
 assert.equal(preview.querySelector('.ri-status').textContent,'시작 화면 연결됨');
 assert.equal(preview.querySelector('[data-recognition-open]'),null);
 assert.equal(review.querySelector('[role=tab][aria-selected=true]').dataset.recognitionTab,'pages');
 assert.ok(review.querySelector('.sr-root #explorationJob .ex-job'));
 assert.equal(review.querySelector('.sr-scope-label').textContent,'시작 화면 연결됨');
 assert.ok(!review.querySelector('#sr-panel').textContent.includes('일부 요청을 제한'));
 const notes=dom(details(s,undefined,'',{tab:'checks'}));assert.equal(notes.querySelectorAll('.sr-check-note').length,3);
 assert.ok(notes.querySelector('#sr-panel').textContent.includes('연결은 완료됐어요'));
});


test('snapshot collection leads with zoomable images and never reports click transitions',()=>{
 const s=fixture();s.workflow.scope.viewport='mobile';s.workflow.source.site_map.mode='snapshot';
 const pages=s.workflow.source.site_map.pages;pages.forEach((p,i)=>{p.state=i<2?'loaded':'pending';if(i<2)p.image=image;});
 s.workflow.source.site_map.limit_reached=true;
 s.workflow.source.exploration={id:'snapshot',mode:'snapshot',status:'done',phase:'complete',budget:{states:24,pages:24,seconds:20},states:2,pending_actions:0,pages_found:9,pages_checked:2,pages_failed:0};
 s.workflow.source.preflight={states:[{label:'Old clicks'}],transitions:[]};
 const d=dom(details(s));assert.equal(d.querySelectorAll('[data-snapshot-url]').length,2);assert.equal(d.querySelectorAll('.snapshot-image img').length,2);
 assert.equal(d.querySelector('[data-exploration-action]').dataset.explorationAction,'resume');assert.ok(d.body.textContent.includes('더 수집'));
 assert.ok(d.body.textContent.includes('미수집 주소'));assert.ok(!d.body.textContent.includes('Old clicks'));assert.ok(!d.body.textContent.includes('남은 조작 경로'));assert.ok(!d.body.textContent.includes('개 화면 전환'));
 assert.equal(d.querySelector('[role=tab][aria-selected=true]').textContent,'화면 이미지2');
 pages[1].image='javascript:alert(1)';const safe=dom(details(s));assert.equal(safe.querySelectorAll('.snapshot-image img').length,1);assert.equal(safe.querySelectorAll('.snapshot-image:disabled').length,1);
 s.workflow.source.exploration.status='running';const running=dom(details(s));assert.ok(running.querySelector('[role=progressbar]'));assert.equal(running.querySelector('[data-exploration-action]').dataset.explorationAction,'pause');
});
