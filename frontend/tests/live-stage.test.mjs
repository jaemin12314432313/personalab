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
  d.querySelector('[data-ls-next]').click();await load();assert.equal(d.querySelector('.ls-people [aria-pressed="true"]').dataset.lsPerson,'2');assert.equal(d.querySelector('[data-ls-next]').disabled,true);
  assert.ok([...d.querySelectorAll('.ls-scroll-cue')].every(e=>e.hidden));d.querySelector('[data-ls-previous]').click();await load();assert.equal(d.querySelector('[data-ls-previous]').disabled,true);
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
