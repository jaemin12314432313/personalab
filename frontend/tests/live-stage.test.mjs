import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
test('live 3D stage uses owned captures and preserves paused evidence during updates',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
 const dom=new JSDOM('<section id="stage"></section>');const old=globalThis.document;globalThis.document=dom.window.document;
 let stage;
 try{
  const {mountLiveStage}=await server.ssrLoadModule('/src/mockup/LiveStage.ts');
  stage=mountLiveStage(document.getElementById('stage'));
  async function loaded(){for(const img of document.querySelectorAll('.ls-image-buffer'))img.dispatchEvent(new dom.window.Event('load'));await Promise.resolve();}
  const people=[11,12,13].map(id=>({id,attributes:{source:{persona_id:`P${id}`},profile:{age:30,job_group:'직장인'}}}));
  const make=(id,persona_id,action='click')=>({id,persona_id,turn:id-1,image:`/api/runs/8/evidence/${id}/image`,screen:{id:`s${id}`,label:`실제 화면 ${id}`,description:'관찰',viewport:{width:1000,height:800},elements:[{id:'b1',text:'열기',to:null,rect:{x:90,y:70,width:20,height:20}}]},action:{action,target:'b1',reason:'현재 버튼을 선택한 기록'}});
  const study={id:'one',runs:{act:8},status:'running',personas:people,workflow:{source:{kind:'html',preview:'data:image/jpeg;base64,YQ=='},scope:{viewport:'mobile'}},evidence:[make(1,11)]};
  stage.update(study);await loaded();
  assert.equal(document.querySelectorAll('.ls-frame').length,3);
  assert.equal(document.getElementById('browserEvidenceImage').getAttribute('src'),'/api/runs/8/evidence/1/image');
  assert.equal(document.querySelector('.ls-marker:not([hidden])').style.left,'10%');
  assert.equal(document.querySelector('.ls-marker:not([hidden])').style.top,'10%');
  assert.equal(document.getElementById('stage').dataset.viewport,'mobile');
  assert.ok(document.querySelector('[data-ls-frame="12"]').textContent.includes('대기'));
  document.querySelector('[data-ls-evidence="1"]').click();
  study.evidence.push(make(2,12));stage.update(study);await loaded();
  assert.equal(document.getElementById('browserEvidenceImage').getAttribute('src'),'/api/runs/8/evidence/1/image');
  assert.equal(document.getElementById('stage').dataset.follow,'false');
  document.querySelector('[data-ls-follow]').click();
  assert.equal(document.getElementById('browserEvidenceImage').getAttribute('src'),'/api/runs/8/evidence/1/image');
  document.querySelector('[data-ls-all]').click();await loaded();
  assert.equal(document.getElementById('browserEvidenceImage').getAttribute('src'),'/api/runs/8/evidence/2/image');
  assert.ok(document.querySelector('[data-ls-frame="11"]').style.transform===''&&document.querySelector('[data-ls-frame="11"]').style.getPropertyValue('--offset'));
  assert.equal(document.querySelectorAll('#browserEvidenceImage').length,1);
  study.evidence.push({...make(3,12,'complete'),action:{action:'complete'}});stage.update(study);await new Promise(r=>setTimeout(r,1600));await loaded();
  assert.equal(document.querySelector('.ls-marker:not([hidden])'),null);
  assert.ok(document.querySelector('.ls-detail').textContent.includes('목표 도달'));
  stage.replay();await loaded();assert.equal(document.getElementById('browserEvidenceImage').getAttribute('src'),'/api/runs/8/evidence/1/image');
  stage.update({...study,id:'other',runs:{},personas:[],evidence:[],workflow:{source:{kind:'manual'},scope:{}}});
  assert.equal(document.getElementById('stage').hidden,true);assert.ok(!document.body.innerHTML.includes('/api/runs/8/'));
 }finally{stage?.dispose();globalThis.document=old;dom.window.close();await server.close();}
});


test('capture buffering keeps the last image and ignores stale loads or another study',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'}),dom=new JSDOM('<section id="stage"></section>');let stage;
 try{
  const {mountLiveStage}=await server.ssrLoadModule('/src/mockup/LiveStage.ts');stage=mountLiveStage(dom.window.document.getElementById('stage'));
  const event=(id)=>({id,persona_id:1,turn:id-1,image:`/api/runs/8/evidence/${id}/image`,screen:{id:`s${id}`,label:`Capture ${id}`,viewport:{width:100,height:100},elements:[{id:'b',text:'Next',rect:{x:10,y:20,width:20,height:10}}]},action:{action:'click',target:'b',reason:'saved decision'}});
  const s={id:'one',status:'running',runs:{act:8},personas:[{id:1,attributes:{source:{persona_id:'P1'},profile:{age:30,job_group:'worker'}}}],results:[],workflow:{source:{kind:'web',preview:'data:image/png;base64,YQ=='},scope:{}},evidence:[event(1)]};
  const d=dom.window.document,load=async()=>{d.querySelector('.ls-image-buffer').dispatchEvent(new dom.window.Event('load'));await Promise.resolve();};
  stage.update(s);await load();assert.equal(d.getElementById('browserEvidenceImage').getAttribute('src'),event(1).image);
  s.evidence.push(event(2));stage.update(s,2);const stale=d.querySelector('.ls-image-buffer').onload;
  assert.equal(d.getElementById('browserEvidenceImage').getAttribute('src'),event(1).image);assert.ok(d.querySelector('.ls-image-status').textContent.includes('이전 화면 유지'));assert.equal(d.querySelector('.ls-marker:not([hidden])'),null);
  s.evidence.push(event(3));stage.update(s,3);stale(new dom.window.Event('load'));await Promise.resolve();assert.equal(d.getElementById('browserEvidenceImage').getAttribute('src'),event(1).image);
  await load();assert.equal(d.getElementById('browserEvidenceImage').getAttribute('src'),event(3).image);assert.equal(d.querySelector('.ls-marker:not([hidden])').style.left,'20%');
  s.evidence.push(event(4));stage.update(s,4);d.querySelector('.ls-image-buffer').dispatchEvent(new dom.window.Event('error'));
  assert.equal(d.getElementById('browserEvidenceImage').getAttribute('src'),event(3).image);assert.equal(d.querySelector('[data-ls-retry]').hidden,false);
  d.querySelector('[data-ls-retry]').click();const late=d.querySelector('.ls-image-buffer').onload;
  stage.update({...s,id:'other',runs:{act:9},personas:[],evidence:[],workflow:{source:{kind:'manual'},scope:{}}});late(new dom.window.Event('load'));await Promise.resolve();
  assert.equal(d.getElementById('stage').hidden,true);assert.ok(!d.body.innerHTML.includes('/api/runs/8/'));
 }finally{stage?.dispose();dom.window.close();await server.close();}
});

test('selected persona stays pinned and playback only moves through actual records',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'}),dom=new JSDOM('<section id="stage"></section>');let stage;
 try{
  const {mountLiveStage}=await server.ssrLoadModule('/src/mockup/LiveStage.ts');stage=mountLiveStage(dom.window.document.getElementById('stage'));
  const make=(id,p,action)=>({id,persona_id:p,turn:id-1,image:`/api/runs/8/evidence/${id}/image`,screen:{id:'s'+id,label:'Actual capture',elements:[],viewport:{width:100,height:100}},action:{action}});
  const s={id:'one',status:'running',runs:{act:8},personas:[1,2].map(id=>({id,attributes:{source:{},profile:{age:30,job_group:'worker'}}})),results:[],workflow:{source:{kind:'html'},scope:{}},evidence:[make(1,1,'scroll')]};
  const d=dom.window.document,load=async()=>{for(const image of d.querySelectorAll('.ls-image-buffer'))image.dispatchEvent(new dom.window.Event('load'));await Promise.resolve();};
  stage.update(s);await load();assert.equal(d.querySelector('.ls-scroll-cue').hidden,false);
  d.querySelector('.ls-people [data-ls-person="1"]').click();s.evidence.push(make(2,2,'abandon'));stage.update(s);await load();
  assert.equal(d.querySelector('.ls-people [aria-pressed="true"]').dataset.lsPerson,'1');
  // 수동 이전/다음은 보고 있는 사람의 기록 안에서만 움직인다. 1번 사람은 기록이 하나라 갈 곳이 없고, 2번으로 넘어가지 않는다.
  assert.equal(d.querySelector('[data-ls-next]').disabled,true);assert.equal(d.querySelector('[data-ls-previous]').disabled,true);
  d.querySelector('[data-ls-next]').click();await load();assert.equal(d.querySelector('.ls-people [aria-pressed="true"]').dataset.lsPerson,'1');
  // 다른 사람을 직접 고르면 그 사람의 기록으로 간다(그 사람도 기록이 하나라 이전/다음은 비활성)
  d.querySelector('.ls-people [data-ls-person="2"]').click();await load();assert.equal(d.querySelector('.ls-people [aria-pressed="true"]').dataset.lsPerson,'2');
  assert.ok([...d.querySelectorAll('.ls-scroll-cue')].every(e=>e.hidden));
  d.querySelector('[data-ls-play]').click();assert.equal(d.querySelector('[data-ls-play]').getAttribute('aria-pressed'),'true');d.querySelector('[data-ls-play]').click();assert.equal(d.querySelector('[data-ls-play]').getAttribute('aria-pressed'),'false');
 }finally{stage?.dispose();dom.window.close();await server.close();}
});


test('live inspector excerpts long reasoning without losing full original or capture aspect ratio',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'}),dom=new JSDOM('<section id="stage"></section>');let stage;
 try{
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const {mountLiveStage}=await server.ssrLoadModule('/src/mockup/LiveStage.ts');stage=mountLiveStage(dom.window.document.getElementById('stage'));
  const reason='현재 보이는 버튼을 확인한 뒤 이동합니다. '.repeat(40)+'원문 끝';
  const s={id:'compact',status:'done',runs:{act:8},personas:[{id:1,attributes:{source:{persona_id:'P001'},profile:{age:30,job_group:'사무직'}}}],results:[],workflow:{source:{kind:'web'},scope:{}},evidence:[{id:1,persona_id:1,turn:0,image:'/api/runs/8/evidence/1/image',screen:{id:'a',label:'실제 화면',viewport:{width:1000,height:800},elements:[]},action:{action:'scroll',reason}}]};
  stage.update(s);const d=dom.window.document;d.querySelector(".ls-image-buffer").dispatchEvent(new dom.window.Event("load"));await Promise.resolve();
  assert.equal(d.querySelector('.ls-reason').textContent.length,181);assert.equal(d.querySelector('[data-ls-full-reason]').textContent,reason);assert.equal(d.querySelector('.ls-frame').style.getPropertyValue('--ls-ratio'),'1.25');assert.ok(d.querySelector('.ls-workspace>.ls-inspector'));assert.equal(d.querySelector('.ls-note'),null);
  d.querySelector('[data-ls-reason]').click();assert.equal(d.querySelector('dialog').open,true);d.querySelector('[data-ls-close]').click();assert.equal(d.querySelector('dialog').open,false);
 }finally{stage?.dispose();dom.window.close();await server.close();}
});


test('live batches display every capture in order and keep decision, target and image atomic',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'}),dom=new JSDOM('<section id="stage"></section>');let stage;
 try{
  const {mountLiveStage}=await server.ssrLoadModule('/src/mockup/LiveStage.ts');const d=dom.window.document;stage=mountLiveStage(d.getElementById('stage'));
  dom.window.HTMLDialogElement.prototype.showModal=function(){this.open=true;};dom.window.HTMLDialogElement.prototype.close=function(){this.open=false;};
  const e=id=>({id,persona_id:1,turn:id-1,image:`/api/runs/8/evidence/${id}/image`,screen:{id:`s${id}`,label:`Screen ${id}`,viewport:{width:100,height:100},elements:[{id:'b',text:`Target ${id}`,rect:{x:10*id,y:20,width:10,height:10}}]},action:{action:'click',target:'b',reason:`Reason ${id}`}});
  const s={id:'atomic',status:'running',runs:{act:8},personas:[{id:1,attributes:{source:{persona_id:'P1'},profile:{age:30,job_group:'worker'}}}],results:[],workflow:{source:{kind:'html'},scope:{}},evidence:[e(1)]};
  const load=async()=>{d.querySelector('.ls-image-buffer').dispatchEvent(new dom.window.Event('load'));await Promise.resolve();};
  stage.update(s);assert.ok(!d.querySelector('.ls-reason').textContent.includes('Reason 1'));await load();
  assert.equal(d.querySelector('.ls-reason').textContent,'Reason 1');
  s.evidence.push(e(3),e(2),e(2));stage.update(s);
  assert.equal(d.querySelectorAll('[data-ls-evidence]').length,3);
  await new Promise(r=>setTimeout(r,1600));
  assert.equal(d.getElementById('browserEvidenceImage').getAttribute('src'),e(1).image);
  assert.equal(d.querySelector('.ls-reason').textContent,'Reason 1');assert.equal(d.querySelector('.ls-target-label').textContent,'Target 1');
  await load();assert.equal(d.getElementById('stage').dataset.evidence,'2');assert.equal(d.querySelector('.ls-reason').textContent,'Reason 2');
  await new Promise(r=>setTimeout(r,1600));await load();assert.equal(d.getElementById('stage').dataset.evidence,'3');
  d.querySelector('[data-ls-zoom]').click();assert.equal(d.querySelector('.ls-screen-dialog img').getAttribute('src'),e(3).image);assert.ok(d.querySelector('[data-ls-zoom-action]').textContent.includes('Reason 3'));
  d.querySelector('[data-ls-close-screen]').click();assert.equal(d.querySelector('.ls-screen-dialog').open,false);
  s.evidence.push({...e(4),action:{action:'click',target:'b',status:'failed',reason:'planned',error:'blocked action'}});stage.update(s,4);await load();
  assert.equal(d.querySelector('.ls-reason').textContent,'blocked action');assert.equal(d.querySelector('.ls-marker:not([hidden])'),null);
  d.querySelector('[data-ls-zoom]').click();stage.update({...s,id:'other',runs:{act:9},evidence:[],personas:[],workflow:{source:{kind:'manual'},scope:{}}});assert.equal(d.querySelector('.ls-screen-dialog').open,false);assert.equal(d.querySelector('.ls-screen-dialog img').getAttribute('src'),null);assert.ok(!d.body.innerHTML.includes('/api/runs/8/'));
 }finally{stage?.dispose();dom.window.close();await server.close();}
});


test('after the run ended, people without a record are shown as no-record, not as still waiting',async()=>{
 const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'}),dom=new JSDOM('<section id="stage"></section>');let stage;
 try{
  const {mountLiveStage}=await server.ssrLoadModule('/src/mockup/LiveStage.ts');stage=mountLiveStage(dom.window.document.getElementById('stage'));
  const act=(screen)=>({path:[screen],events:[{turn:1,screen,action:'click',target:'다음',reason:'둘러봤어요'}],end:{result:'complete',screen}});
  const base={id:'one',runs:{act:8},personas:[1,2,3].map(id=>({id,attributes:{source:{},profile:{age:30,job_group:'worker'}}})),workflow:{source:{kind:'html'},scope:{}},evidence:[],results:[{id:1,persona_id:'P1',ask:null,act:act('S1')},{id:2,persona_id:'P2',ask:null,act:act('S1')}]};
  const d=dom.window.document,chip=(k)=>Number(d.querySelector(`.ls-stat[data-k="${k}"] b`)?.textContent??-1);
  // 실행 중이면 기록 없는 한 명은 아직 탐색 중·대기
  stage.update({...base,status:'running'});assert.equal(chip('run'),1);assert.equal(d.querySelector('.ls-stat[data-k="bad"]')?.textContent.includes('기록 없음')??false,false);
  // 실행이 끝났는데 한 명은 오류로 기록이 없다: 대기가 아니라 '기록 없음'
  stage.update({...base,status:'done'});
  assert.equal(chip('run'),0);
  assert.ok([...d.querySelectorAll('.ls-stat')].some(e=>e.textContent.includes('기록 없음')&&e.querySelector('b').textContent==='1'));
  assert.ok(d.querySelector('[data-ls-title]').textContent.includes('마쳤어요'));
  assert.ok(d.querySelector('[data-ls-sub]').textContent.includes('오류로 기록이 없는 1명'));
 }finally{stage?.dispose();dom.window.close();await server.close();}
});
