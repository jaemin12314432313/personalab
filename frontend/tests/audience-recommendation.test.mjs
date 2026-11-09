import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true,hmr:false},appType:'custom'});
const {mountAudienceBuilder,emptyAudience}=await server.ssrLoadModule('/src/mockup/AudienceBuilder.ts');
const {newStudy}=await server.ssrLoadModule('/src/studio/model.ts');
test.after(()=>server.close());
async function until(fn){for(let i=0;i<150;i++){if(fn())return;await new Promise(r=>setTimeout(r,10));}throw new Error('Audience UI timed out');}
const cards=Array.from({length:6},(_,i)=>({id:401+i,panel_id:7,source_persona_id:`P${i}`,profile_hash:'',attributes:{profile:{age:[24,35,48,67,29,53][i],sex:i%2?'여':'남',job_group:i%2?'사무·관리':'자영업',region:'서울'},traits:{digital:['높음','낮음','중간'][i%3],privacy:'중간'},card_text:'공개 요약 프로필',source:{library_entry_id:401+i}}}));
async function environment(fn){
 const dom=new JSDOM('<div id="host"></div>',{url:'http://localhost/#personas'}),host=dom.window.document.getElementById('host'),study=newStudy();
 let key='own-study',applied,fail=false,late;
 const calls=[],oldFetch=globalThis.fetch,oldMatch=globalThis.matchMedia;
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};globalThis.matchMedia=()=>({matches:true});
 globalThis.fetch=async(url,options={})=>{const body=options.body?JSON.parse(options.body):undefined;calls.push({url,body});
  if(url.endsWith('/audience/facets'))return new Response(JSON.stringify({max_selection:100,total:6,jobs:['자영업','사무·관리'],regions:['서울'],digital:['높음','중간','낮음']}));
  if(url.endsWith('/audience/search'))return new Response(JSON.stringify({total:6,duplicates_excluded:49,items:cards.slice(body.offset,body.offset+body.limit)}));
  if(url.endsWith('/audience/recommend')){if(late)return new Promise(resolve=>{late.resolve=resolve;});if(fail)return new Response(JSON.stringify({detail:'추천 연결 실패'}),{status:503});return new Response(JSON.stringify({total:6,requested_count:body.count,items:cards.slice(0,body.count)}));}
  const id=Number(String(url).split('/').pop());return new Response(JSON.stringify(cards.find(p=>p.id===id)));
 };
 const builder=mountAudienceBuilder(host,{get:()=>study,key:()=>key,ready:()=>true,draft:a=>{study.audienceDraft=a;},apply:async a=>{applied=a;study.personas=cards.filter(p=>a.entry_ids.includes(p.id)).map(p=>({id:p.id,attributes:p.attributes}));study.workflow={scope:{audience:a}};delete study.audienceDraft;},notify:()=>{}});
 const d=dom.window.document,click=q=>d.querySelector(q).click(),input=(id,value)=>{const n=d.getElementById(id);n.value=value;n.dispatchEvent(new dom.window.Event('input',{bubbles:true}));};
 try{builder.sync();builder.showPage('personas');await until(()=>!builder.state().loading&&d.querySelectorAll('.ab-person').length===4);await fn({d,host,study,calls,builder,click,input,get applied(){return applied;},fail:()=>{fail=true;},defer:()=>late={},changeKey:()=>{key='other-study';builder.refresh();}});}
 finally{builder.dispose();globalThis.fetch=oldFetch;if(oldMatch===undefined)delete globalThis.matchMedia;else globalThis.matchMedia=oldMatch;dom.window.close();}
}

test('recommendation is the default and exact profiles can be replaced and saved',async()=>{
 await environment(async env=>{const {d,host,study,calls,builder,click,input}=env;
  assert.equal(d.getElementById('audienceManual').hidden,true);assert.ok(!host.textContent.includes('중복 원천'));assert.equal(builder.state().selected,0);
  assert.equal(host.querySelector('.ab-compose').parentElement,host.querySelector('.ab-results-column').parentElement);
  assert.equal(d.getElementById('audienceCount').closest('.ab-conditions').tagName,'FIELDSET');
  const jobs=host.querySelector('.ab-filter-select');jobs.open=true;await until(()=>jobs.open);jobs.dispatchEvent(new d.defaultView.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(jobs.open,false);assert.equal(d.activeElement,jobs.querySelector('summary'));
  jobs.open=true;d.getElementById('audienceCount').click();assert.equal(jobs.open,false);
  input('audienceDescription','예약을 직접 관리하는 자영업자');input('audienceCount','3');click('[data-audience-action="auto"]');await until(()=>builder.state().selected===3&&!builder.state().loading);
  assert.equal(d.querySelectorAll('.ab-review-person').length,3);assert.equal(d.getElementById('audienceManual').hidden,true);assert.ok(d.getElementById('audienceComposition').textContent.includes('낮음'));
  click('[data-audience-replace="401"]');await until(()=>!builder.state().loading&&!study.audienceDraft.entry_ids.includes(401));
  // 교체는 후보 목록을 열지 않고, 같은 조건의 다른 사람으로 바로 바뀐다
  assert.equal(study.audienceDraft.entry_ids.length,3);assert.ok(study.audienceDraft.entry_ids.includes(402)&&study.audienceDraft.entry_ids.includes(403));assert.equal(new Set(study.audienceDraft.entry_ids).size,3);assert.equal(d.getElementById('audienceManual').hidden,true);
  assert.equal(d.querySelector('[data-audience-remove]'),null);assert.equal(await builder.save(),true);assert.deepEqual(env.applied.entry_ids,[404,402,403]);assert.equal(env.applied.requested_count,3);assert.ok(!calls.some(c=>/runs|panel\/generate/.test(c.url)));
 });
});

test('shortfall never silently replaces an existing group or relaxes conditions',async()=>{
 await environment(async({d,study,builder,click,input,calls})=>{
  input('audienceDescription','사용자 맥락');input('audienceCount','2');click('[data-audience-action="auto"]');await until(()=>builder.state().selected===2&&!builder.state().loading);
  input('audienceCount','10');click('[data-audience-action="auto"]');await until(()=>!builder.state().loading&&d.querySelector('[data-audience-action="accept-available"]'));
  assert.deepEqual(study.audienceDraft.entry_ids,[401,402]);assert.ok(d.getElementById('audienceShortfall').textContent.includes('6명만'));
  click('[data-audience-action="accept-available"]');assert.equal(builder.state().selected,6);assert.equal(d.getElementById('audienceCount').value,'6');assert.equal(study.audienceDraft.requested_count,6);
  const reco=calls.filter(c=>c.url.endsWith('/audience/recommend'));assert.equal(reco.length,2);assert.deepEqual(reco[1].body.filters,emptyAudience().filters);
 });
});

test('recommendation failure and replacement cancellation preserve choices; changed conditions require review',async()=>{
 await environment(async({d,study,builder,click,input,fail})=>{
  input('audienceDescription','사용자 맥락');input('audienceCount','2');click('[data-audience-action="auto"]');await until(()=>builder.state().selected===2&&!builder.state().loading);
  click('[data-audience-replace="401"]');await until(()=>!builder.state().loading&&!study.audienceDraft.entry_ids.includes(401));const afterReplace=[...study.audienceDraft.entry_ids];assert.equal(afterReplace.length,2);assert.ok(afterReplace.includes(402));
  fail();click('[data-audience-action="auto"]');await until(()=>!builder.state().loading&&d.getElementById('audienceError').textContent.includes('추천 연결 실패'));assert.deepEqual(study.audienceDraft.entry_ids,afterReplace);
  input('audienceAgeMin','35');assert.equal(await builder.save(),false);assert.ok(d.getElementById('audienceError').textContent.includes('참여 조건이 바뀌었어요'));assert.equal(builder.state().selected,2);
 });
});

test('unsaved recommended profiles restore after refresh and late responses cannot overwrite another study',async()=>{
 await environment(async({study,builder,input,click,d,defer,changeKey})=>{
  input('audienceDescription','사용자 맥락');input('audienceCount','6');click('[data-audience-action="auto"]');await until(()=>builder.state().selected===6&&!builder.state().loading);
  builder.refresh();await until(()=>!builder.state().loading&&d.querySelectorAll('.ab-review-person').length===6);assert.ok(d.getElementById('audienceSelectedList').textContent.includes('67세'));
  const delayed=defer();click('[data-audience-action="auto"]');await until(()=>delayed.resolve);study.audienceDraft=emptyAudience();study.personas=[];changeKey();await until(()=>!builder.state().loading);
  delayed.resolve(new Response(JSON.stringify({total:6,requested_count:6,items:cards})));await new Promise(r=>setTimeout(r,20));assert.equal(builder.state().selected,0);
 });
});


test('full region names preserve old selected filters and submit the real canonical condition',async()=>{
 await environment(async({d,study,builder,calls,click,input})=>{
  study.audienceDraft={...emptyAudience(),description:'지역 조건 검증',filters:{...emptyAudience().filters,regions:['서울']}};
  builder.refresh();builder.showPage('personas');await until(()=>!builder.state().loading&&d.querySelector('[data-audience-filter="regions"]'));
  const region=d.querySelector('[data-audience-filter="regions"]');assert.equal(region.value,'서울특별시');assert.equal(region.checked,true);assert.ok(region.closest('label').textContent.includes('서울특별시'));
  assert.equal(region.closest('details').dataset.audienceFacet,'regions');
  input('audienceCount','2');click('[data-audience-action="auto"]');await until(()=>builder.state().selected===2&&!builder.state().loading);
  assert.deepEqual(calls.filter(c=>c.url.endsWith('/audience/recommend')).at(-1).body.filters.regions,['서울특별시']);
  assert.ok(d.querySelector('.ab-review-person').textContent.includes('서울특별시'));
  assert.deepEqual(study.audienceDraft.filters.regions,['서울특별시']);
 });
});
