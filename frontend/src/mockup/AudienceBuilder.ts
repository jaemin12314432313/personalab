import {regionOptions} from './RegionNames';
import {portraitMarkup,displayAttributes} from './DisplayPersona';
import * as api from '../api/studio';
import type {AudienceDefinition, Study} from '../studio/model';
import './audience.css';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const emptyAudience=():AudienceDefinition=>({description:'',context:'',filters:{query:'',age_min:null,age_max:null,jobs:[],regions:[],digital:[]},entry_ids:[]});
const PAGE_SIZE=4, REVIEW_SIZE=6, RESTORE_BATCH=4;

export function mountAudienceBuilder(host:HTMLElement,options:{get:()=>Study;key:()=>string;ready:()=>boolean;draft:(a:AudienceDefinition)=>void;apply:(a:AudienceDefinition)=>Promise<void>;notify:(text:string,error?:boolean)=>void;changed?:()=>void}){
 let key='',generation=0,loading=false,saving=false,facets:api.AudienceFacets|undefined;
 let mapPick=0; // 분포 화면에서 누른 사람
 let candidates:api.LibraryPersona[]=[],known=new Map<number,api.LibraryPersona>(),selected=new Set<number>();
 let total=0,offset=0,appliedFilters='',error='',status='',manualOpen=false,replaceId:number|null=null,reviewLimit=REVIEW_SIZE;
 let pendingShortfall:api.AudienceRecommendation|undefined;
 let audience=emptyAudience(),desiredCount=30,currentPage:'people'|'personas'='people';
 const locked=()=>Boolean(options.get().runs?.act||options.get().runs?.ask);
 const valid=(g:number,k:string)=>generation===g&&options.key()===k;
 const filterKey=()=>JSON.stringify(audience.filters);
 const filtersDirty=()=>filterKey()!==appliedFilters;
 function capture(){
  const val=(id:string)=>host.querySelector<HTMLInputElement>(`#${id}`)?.value||'';
  const values=(field:string)=>[...host.querySelectorAll<HTMLInputElement>(`[data-audience-filter="${field}"]:checked`)].map(i=>i.value);
  desiredCount=Number(val('audienceCount'));audience.description=val('audienceDescription');audience.context=val('audienceContext');
  audience.filters={query:val('audienceQuery').trim(),age_min:val('audienceAgeMin')===''?null:Number(val('audienceAgeMin')),age_max:val('audienceAgeMax')===''?null:Number(val('audienceAgeMax')),jobs:values('jobs'),regions:values('regions'),digital:values('digital')};
  audience.entry_ids=[...selected];audience.requested_count=Number.isInteger(desiredCount)&&desiredCount>0&&desiredCount<=(facets?.max_selection||100)?desiredCount:undefined;
 }
 function persist(){capture();options.draft(structuredClone(audience));}
 function checkFilters(){const f=audience.filters;if([f.age_min,f.age_max].some(n=>n!==null&&(!Number.isInteger(n)||n<0||n>120)))throw new Error('나이는 0~120 사이의 정수로 입력하세요.');if(f.age_min!==null&&f.age_max!==null&&f.age_min>f.age_max)throw new Error('최소 나이는 최대 나이보다 작아야 해요.');}
 function checkCount(){if(!Number.isInteger(desiredCount)||desiredCount<1||desiredCount>(facets?.max_selection||100))throw new Error(`인원은 1~${facets?.max_selection||100}명으로 입력하세요.`);}
 function facetValue(field:'jobs'|'regions'|'digital'){const values=audience.filters[field];return values.length===0?'전체':values.length===1?values[0]:`${values[0]} 외 ${values.length-1}개`;}
 function chips(field:'jobs'|'regions'|'digital',label:string,values:string[]){
  const choices=values.length?values.map(v=>`<label><input type="checkbox" data-audience-filter="${field}" value="${esc(v)}" ${audience.filters[field].includes(v)?'checked':''}><span>${esc(v)}</span></label>`).join(''):'등록된 조건이 없어요.';
  if(field==='digital')return `<fieldset class="ab-facet ab-facet-inline"><legend>${label}<span data-audience-selection="${field}">${esc(facetValue(field))}</span></legend><div>${choices}</div></fieldset>`;
  return `<details class="ab-facet ab-filter-select" data-audience-facet="${field}"><summary><span class="ab-filter-name">${label}</span><span class="ab-filter-value" data-audience-selection="${field}">${esc(facetValue(field))}</span></summary><div aria-label="${label} 선택 항목">${choices}</div></details>`;
 }
 function showPage(page:'people'|'personas'){
  currentPage=page;host.dataset.page=page;
  for(const selector of ['.ab-definition','.ab-persona-browser','.ab-selection','.ab-source-notice']){const node=host.querySelector<HTMLElement>(selector);if(node)node.hidden=selector==='.ab-definition'?page!=='people':page!=='personas';}
 }
 function validateDescription(){
  capture();if(audience.description.trim()){error='';const alert=host.querySelector<HTMLElement>('#audienceError');if(alert){alert.textContent='';alert.hidden=true;}return true;}
  error='어떤 사용자를 위한 테스트인지 한두 문장으로 적어주세요.';render();host.querySelector<HTMLElement>('#audienceDescription')?.focus();return false;
 }
 function render(){
  const a=audience,f=a.filters;
  host.innerHTML=`<p id="audienceError" class="ab-error" role="alert" ${error?'':'hidden'}>${esc(error)}</p><div class="ab-layout">
   <section class="ab-definition" id="audienceDefinition" tabindex="-1"><h2>대상 사용자 설명</h2><div class="ab-description-fields">
    <label class="label" for="audienceDescription">어떤 사용자를 위한 제품인가요? <span class="ab-required">필수</span><textarea class="textarea" id="audienceDescription" required maxlength="1000" rows="3" placeholder="예: 매장 운영과 예약 관리를 혼자 맡는 자영업자">${esc(a.description)}</textarea></label>
    <label class="label" for="audienceContext">어떤 상황에서 사용하나요? <span>선택</span><textarea class="textarea" id="audienceContext" maxlength="1000" rows="2" placeholder="예: 손님 응대 사이에 휴대폰으로 예약을 확인해요">${esc(a.context)}</textarea></label>
    </div><p class="ab-note">이 설명은 탐색 맥락으로 사용해요. 다음 단계에서 참여 조건과 인원을 정합니다.</p>
   </section>
   <div class="ab-persona-browser">
    <section class="ab-compose"><div class="ab-compose-heading"><h2>참여 조건과 인원</h2><span class="ab-source-label">AI 페르소나</span></div><p class="ab-context">${esc(a.description||'대상 사용자 설명을 먼저 작성해 주세요.')}</p><p class="ab-note">설명은 탐색 맥락이며, 참여 조건은 직접 정해주세요.</p>
     <fieldset class="ab-conditions"><legend class="sr-only">참여 조건과 인원</legend><p id="audienceCriteriaState" class="ab-criteria-state"></p>
      <div class="ab-condition-basics"><div class="ab-age"><label for="audienceAgeMin">나이<input class="input" type="number" min="0" max="120" id="audienceAgeMin" value="${f.age_min??''}" placeholder="최소"></label><span>—</span><label for="audienceAgeMax"><span class="sr-only">최대 나이</span><input class="input" type="number" min="0" max="120" id="audienceAgeMax" value="${f.age_max??''}" placeholder="최대"></label></div><label class="ab-count-field" for="audienceCount">참여 인원<div><input class="input" id="audienceCount" type="number" min="1" max="${facets?.max_selection||100}" value="${desiredCount}"><span>명</span></div></label></div>
      <div class="ab-condition-facets">${chips('jobs','직무·생활',facets?.jobs||[])}${chips('regions','거주 지역',facets?.regions||[])}${chips('digital','디지털 친숙도',facets?.digital||[])}</div>
      <label class="label" for="audienceQuery">프로필에 포함된 단어 <span>선택</span><input class="input" id="audienceQuery" maxlength="200" value="${esc(f.query)}" placeholder="예: 예약 온라인"></label><p class="ab-note">입력한 단어가 모두 있는 프로필을 찾아요. 조건은 자동으로 넓히지 않아요.</p>
      <div class="ab-compose-footer"><button class="ab-text-button" type="button" data-audience-action="reset">조건 초기화</button><button type="button" class="btn solid" data-audience-action="auto">${loading?'구성을 확인하고 있어요…':selected.size?'다시 추천받기 →':'구성 추천받기 →'}</button></div>
     </fieldset>
    </section>
    <div class="ab-results-column"><section class="ab-review" id="audienceCandidatesSection" tabindex="-1"><div class="ab-results-heading"><div><h2>이번 테스트의 참여 구성</h2></div><button type="button" class="ab-text-button" data-audience-action="manual">직접 선택하기 ↗</button></div>
        <aside class="ab-selection"><div class="ab-group-count">참여 인원 <b id="audienceSelectedCount">${selected.size}</b>명</div><div id="audienceComposition"></div><p id="audienceSaveState" class="ab-save-state"></p><button type="button" class="ab-clear" data-audience-action="clear">선택 비우기</button><button type="button" class="btn solid ab-apply" data-audience-action="apply">${saving?'저장 중…':'이 구성으로 저장'}</button></aside><section id="audienceMap" class="ab-map" aria-label="참여자 분포"></section><p id="audienceStatus" role="status">${esc(status)}</p><div id="audienceShortfall"></div><details class="ab-roster" id="audienceRoster"><summary id="audienceRosterSummary">참여자 전체 목록 보기</summary><div id="audienceSelectedList" class="ab-review-grid"></div></details>
    </section>
    <section class="ab-manual" id="audienceManual" ${manualOpen?'':'hidden'}><div class="ab-manual-heading"><div><span class="ab-eyebrow">${replaceId?'REPLACE ONE PERSON':'EXPLORE PROFILES'}</span><h3 id="audienceManualTitle" tabindex="-1">${replaceId?'대신 참여할 사람을 골라주세요.':'필요한 시선을 직접 추가하세요.'}</h3><p id="audienceResultsCount"></p></div><button type="button" class="ab-text-button" data-audience-action="close-manual">${replaceId?'교체 취소':'후보 닫기'} ×</button></div>
     <div id="audienceCandidates" class="ab-candidate-grid"></div><nav class="ab-pagination" aria-label="페르소나 후보 페이지"><button type="button" class="btn" data-audience-action="previous" ${offset===0?'hidden':''}>← 이전 후보</button><span>${total?`${offset+1}–${Math.min(offset+candidates.length,total)} / ${total}명`:'후보 없음'}</span><button type="button" class="btn" data-audience-action="more" ${offset+candidates.length>=total?'hidden':''}>다음 후보 →</button></nav>
    </section></div>
   </div>
  </div><p class="ab-source-notice">AI 합성 프로필을 표시용으로 요약했습니다. 사진은 가상 AI 대표 이미지이며 여러 페르소나가 공유할 수 있어요. 원천: <a href="https://huggingface.co/datasets/nvidia/Nemotron-Personas-Korea" target="_blank" rel="noreferrer">NVIDIA Nemotron-Personas-Korea</a> · <a href="https://creativecommons.org/licenses/by/4.0/deed.ko" target="_blank" rel="noreferrer">CC BY 4.0</a>, <a href="https://stat.kisdi.re.kr/" target="_blank" rel="noreferrer">한국미디어패널조사(KISDI)</a>. 사진은 별도로 생성한 AI 대표 이미지입니다.</p>`;
  renderSelection();renderCandidates();renderShortfall();
  if(!options.ready())host.querySelector('#audienceStatus')!.textContent='서버 연결을 확인하고 있어요. 대상 사용자 설명은 먼저 작성할 수 있어요.';
  host.querySelectorAll<HTMLInputElement|HTMLButtonElement>('input,textarea,button').forEach(el=>el.disabled=el.disabled||locked()||saving||(loading&&!['audienceDescription','audienceContext'].includes(el.id)));
  host.querySelectorAll<HTMLButtonElement>('[data-audience-action="search"],[data-audience-action="auto"],[data-audience-action="more"],[data-audience-action="previous"]').forEach(b=>b.disabled=locked()||saving||loading||!options.ready());
  updateApply();showPage(currentPage);
 }
 function updateApply(){const b=host.querySelector<HTMLButtonElement>('[data-audience-action="apply"]');if(b)b.disabled=locked()||loading||saving||!selected.size||!options.ready()||filtersDirty();}

 // ---- 분포 화면: 점 하나가 한 사람, 색은 연령대. 점을 누르면 그 사람의 정보가 옆에 나온다 ----
 const LEVEL={낮음:.18,중간:.5,높음:.82} as Record<string,number>;
 const level=(v:unknown)=>typeof v==='number'?Math.max(.05,Math.min(.95,v>1?v/100:v)):LEVEL[String(v)]??.5;
 const ageGroup=(age:number)=>!Number.isFinite(age)?'나이 미등록':age>=60?'60대 이상':`${Math.floor(age/10)*10}대`;
 const SWATCH=['#1b1916','#4568d8','#8aa7ee','#d3a84b','#2f8f5b','#b9b09f'];
 function renderMap(){
  const box=host.querySelector<HTMLElement>('#audienceMap');if(!box)return;
  const chosen=[...selected].map(id=>known.get(id)).filter((p):p is api.LibraryPersona=>Boolean(p));
  if(chosen.length<2){box.innerHTML='';return;}
  const rows=chosen.map(p=>({p,a:displayAttributes(p.attributes)}));
  const groups=[...new Set(rows.map(r=>ageGroup(r.a.profile.age)))].sort();
  const color=(g:string)=>SWATCH[Math.max(0,groups.indexOf(g))%SWATCH.length];
  if(!rows.some(r=>r.p.id===mapPick))mapPick=rows[0].p.id;
  // 같은 값에 겹치지 않도록 사람 번호로 정해진 만큼만 흩뜨린다
  const jitter=(id:number,k:number)=>((Math.sin(id*12.9898+k*78.233)*43758.5453)%1+1)%1-.5;
  const dots=rows.map(r=>{const x=level(r.a.traits.digital)+jitter(r.p.id,1)*.16,y=level(r.a.traits.privacy)+jitter(r.p.id,2)*.16,g=ageGroup(r.a.profile.age);
   return `<button type="button" class="ab-dot${r.p.id===mapPick?' on':''}" data-audience-dot="${r.p.id}" style="left:${(Math.max(.03,Math.min(.97,x))*100).toFixed(1)}%;bottom:${(Math.max(.03,Math.min(.97,y))*100).toFixed(1)}%;--c:${color(g)}" aria-label="${esc(r.p.source_persona_id)} · ${esc(g)}" aria-pressed="${r.p.id===mapPick}"></button>`;}).join('');
  const legend=groups.map(g=>`<span class="ab-key"><i style="background:${color(g)}"></i>${esc(g)} ${rows.filter(r=>ageGroup(r.a.profile.age)===g).length}명</span>`).join('');
  const bars=groups.map(g=>{const n=rows.filter(r=>ageGroup(r.a.profile.age)===g).length;return `<div class="ab-share"><span>${esc(g)}</span><div><i style="width:${(n/rows.length*100).toFixed(0)}%;background:${color(g)}"></i></div><b>${n}명 · ${Math.round(n/rows.length*100)}%</b></div>`;}).join('');
  const cur=rows.find(r=>r.p.id===mapPick)!,a=cur.a;
  const bar=(label:string,v:unknown)=>`<div class="ab-trait"><span>${label}</span><div><i style="width:${Math.round(level(v)*100)}%"></i></div><b>${esc(v||'미등록')}</b></div>`;
  const rankOf=(key:string)=>{const mine=level(a.traits[key]);const below=rows.filter(r=>level(r.a.traits[key])<mine).length;return Math.round((1-below/rows.length)*100);};
  box.innerHTML=`<div class="ab-map-head"><div><h3>${rows.length}명이 이렇게 퍼져 있어요</h3><p>점 하나가 한 사람이에요. 색은 연령대이고, 점을 누르면 그 사람의 정보가 옆에 나와요.</p></div><div class="ab-keys">${legend}</div></div>
   <div class="ab-map-body"><div class="ab-plot-wrap"><span class="ab-axis y">↑ 개인정보 우려</span><div class="ab-plot" role="group" aria-label="디지털 친숙도와 개인정보 우려로 본 참여자 분포"><i class="g v"></i><i class="g v2"></i><i class="g h"></i><i class="g h2"></i>${dots}</div><span class="ab-axis x">디지털 친숙도 →</span></div>
   <aside class="ab-dot-detail" aria-live="polite"><div class="ab-dot-id">${portraitMarkup(a)}<div><strong>${esc(cur.p.source_persona_id)}</strong><span class="ab-chip" style="--c:${color(ageGroup(a.profile.age))}">${esc(ageGroup(a.profile.age))}</span></div></div>
   <p class="ab-dot-line">${esc([`${a.profile.age}세`,a.profile.sex,a.profile.job_group,a.profile.region].filter(Boolean).join(' · '))}</p>
   ${bar('디지털 친숙도',a.traits.digital)}${bar('개인정보 우려',a.traits.privacy)}
   <p class="ab-rank">이 구성에서 디지털 친숙도는 상위 ${rankOf('digital')}%, 개인정보 우려는 상위 ${rankOf('privacy')}%예요.</p>
   <div class="ab-dot-card"><span>AI에게 전달되는 설명</span><p>${esc(a.card_text)}</p></div>
   <button type="button" class="btn" data-audience-map-replace="${cur.p.id}" ${locked()?'disabled':''}>이 사람 교체</button></aside></div>
   <div class="ab-shares" aria-label="연령대별 인원">${bars}</div>`;
 }
 function renderSelection(){
  host.querySelector('#audienceSelectedCount')!.textContent=String(selected.size);
  const chosen=[...selected].map(id=>known.get(id)).filter((p):p is api.LibraryPersona=>Boolean(p));
  const ages=chosen.map(p=>p.attributes.profile.age).filter(n=>Number.isFinite(n));
  const digital=new Map<string,number>();for(const p of chosen){const v=String(displayAttributes(p.attributes).traits.digital||'미등록');digital.set(v,(digital.get(v)||0)+1);}
  const jobs=new Set(chosen.map(p=>p.attributes.profile.job_group).filter(Boolean));
  host.querySelector('#audienceComposition')!.innerHTML=selected.size?`<dl class="ab-composition-stats"><div><dt>연령</dt><dd>${ages.length?`${Math.min(...ages)}–${Math.max(...ages)}세`:'확인 중'}</dd></div><div><dt>직무·생활</dt><dd>${jobs.size}개 유형</dd></div></dl><div class="ab-digital-breakdown"><span>디지털 친숙도</span>${['낮음','중간','높음','미등록'].filter(v=>digital.has(v)).map(v=>`<p><span>${v}</span><b>${digital.get(v)}명</b></p>`).join('')}</div><p class="ab-note">조건 안에서 다양한 시선을 구성해요. 실제 사용자 분포와 다를 수 있어요.</p>`:'';
  const ids=[...selected];
  // 참여자 전체 카드는 기본으로 접어 둔다. 점을 눌러 한 명씩 보고 교체할 수 있어 긴 목록은 필요할 때만 연다. 선택이 없을 땐 안내 문구가 보이도록 펼친다
  const roster=host.querySelector<HTMLDetailsElement>('#audienceRoster');
  if(roster){const wasEmpty=roster.classList.contains('is-empty');roster.classList.toggle('is-empty',!ids.length);if(!ids.length)roster.open=true;else if(wasEmpty)roster.open=false;host.querySelector('#audienceRosterSummary')!.textContent=`참여자 ${ids.length}명 전체 목록 보기`;}
  host.querySelector('#audienceSelectedList')!.innerHTML=ids.length?ids.slice(0,reviewLimit).map(id=>{
   const p=known.get(id),a=p?displayAttributes(p.attributes):undefined;
   return `<article class="ab-review-person ab-selected-person"><div class="ab-review-profile">${a?portraitMarkup(a):'<span class="ab-initial">AI</span>'}<div><strong>${a?`${a.profile.age}세 · ${esc(a.profile.job_group||'사용자')}`:'선택한 프로필을 확인하고 있어요.'}</strong><small>${esc(a?.profile.region||'')}</small></div></div>${a?`<div class="ab-review-traits"><span>디지털 친숙도 <b>${esc(a.traits.digital||'미등록')}</b></span><span>개인정보 우려 <b>${esc(a.traits.privacy||'미등록')}</b></span></div><details><summary>프로필 요약 보기</summary><p>${esc(a.card_text)}</p></details>`:''}<div class="ab-review-controls"><button type="button" data-audience-replace="${id}" ${locked()?'disabled':''}>교체 ↗</button></div></article>`;
  }).join('')+(ids.length>reviewLimit?`<button class="btn ab-review-more" data-audience-action="review-more" type="button">나머지 ${ids.length-reviewLimit}명 더 보기 ↓</button>`:''):'<div class="ab-empty ab-recommend-empty"><strong>어떤 시선이 모일지 확인해보세요.</strong><p>왼쪽에서 조건과 인원을 정한 뒤 추천받으세요.<br>확인 후 필요한 사람만 교체할 수 있어요.</p></div>';
  const f=audience.filters,conditions=[f.age_min!==null||f.age_max!==null?`${f.age_min??'최소'}–${f.age_max??'최대'}세`:'',...f.jobs,...f.regions,...f.digital.map(v=>`친숙도 ${v}`),f.query?`단어: ${f.query}`:''].filter(Boolean);
  for(const field of ['jobs','regions','digital'] as const){const label=host.querySelector(`[data-audience-selection="${field}"]`);if(label)label.textContent=facetValue(field);}
  host.querySelector('#audienceCriteriaState')!.textContent=conditions.length?conditions.join(' · '):'조건 제한 없음';
  host.querySelector('#audienceSaveState')!.textContent=locked()?'실행한 회차의 구성입니다. 수정 회차를 만들면 바꿀 수 있어요.':filtersDirty()?'조건이 바뀌었어요. 다시 추천받거나 조건에 맞는 후보를 확인하세요.':isDirty()?'다음을 누르면 선택한 구성이 저장됩니다.':options.get().personas.length?'이 테스트에 저장된 구성입니다.':'구성을 확인한 뒤 다음으로 이동하세요.';
  const clear=host.querySelector<HTMLButtonElement>('[data-audience-action="clear"]');if(clear)clear.hidden=!selected.size;
  renderMap();updateApply();options.changed?.();
 }
 function renderCandidates(){
  host.querySelector('#audienceResultsCount')!.textContent=loading?'조건에 맞는 프로필을 찾고 있어요.':`현재 조건에서 ${total}명 확인 가능`;
  host.querySelector('#audienceCandidates')!.innerHTML=candidates.length?candidates.map(p=>{const a=displayAttributes(p.attributes),picked=selected.has(p.id);return `<article class="ab-person ${picked?'is-selected':''}"><div class="ab-person-head">${portraitMarkup(a)}<span><strong>${a.profile.age}세 · ${esc(a.profile.job_group||'직무 미등록')}</strong><small>${esc(a.profile.region||'지역 미등록')} · 디지털 친숙도 ${esc(a.traits.digital||'미등록')}</small></span><button type="button" data-audience-pick="${p.id}" aria-pressed="${picked}" aria-label="${esc(p.source_persona_id)} ${replaceId?picked?'이미 참여 중':'이 사람으로 교체':picked?'선택 해제':'선택'}" ${locked()||loading||saving||(replaceId&&picked)?'disabled':''}>${picked?'✓':'+'}</button></div><details><summary>프로필 요약 보기</summary><p>${esc(a.card_text)}</p></details></article>`;}).join(''):loading?'<div class="ab-empty">페르소나를 불러오고 있어요.</div>':'<div class="ab-empty"><strong>현재 조건에 맞는 프로필이 없어요.</strong><p>보유 데이터에서 찾을 수 있는 조건을 다시 정해주세요. 없는 사용자를 만들어 채우지 않아요.</p></div>';
 }
 function renderShortfall(){
  const r=pendingShortfall;host.querySelector('#audienceShortfall')!.innerHTML=r?`<div class="ab-shortfall" role="status"><strong>${r.total?`요청한 ${r.requested_count}명 중 ${r.total}명만 구성할 수 있어요.`:'현재 조건에 맞는 프로필이 없어요.'}</strong><p>조건을 넓히거나 인원을 줄여주세요. 추천을 받기 전의 선택은 유지했어요.</p>${r.total?`<button class="btn" type="button" data-audience-action="accept-available">가능한 ${r.total}명으로 구성하기 →</button>`:''}</div>`:'';
 }
 function isDirty(){const saved=options.get().workflow?.scope.audience;return Boolean(options.get().audienceDraft)&&JSON.stringify(options.get().audienceDraft)!==JSON.stringify(saved||emptyAudience());}
 async function search(more=false,_automatic=false,previous=false){
  if(loading||saving||locked())return;
  capture();checkFilters();const requestFilters=structuredClone(audience.filters),changed=appliedFilters!==filterKey();if(changed){more=false;previous=false;}
  const g=++generation,k=key;loading=true;error='';render();
  try{
   const nextOffset=previous?Math.max(0,offset-PAGE_SIZE):more?offset+PAGE_SIZE:0;
   const result=await api.searchAudience(requestFilters,nextOffset,PAGE_SIZE);if(!valid(g,k))return;
   if(changed&&selected.size){selected.clear();audience.entry_ids=[];status='새 조건으로 후보를 확인했어요. 추천받거나 필요한 시선을 추가해 주세요.';options.draft(structuredClone(audience));}
   appliedFilters=JSON.stringify(requestFilters);total=result.total;offset=nextOffset;candidates=result.items;for(const p of result.items)known.set(p.id,p);
  }catch(e){if(valid(g,k))error=e instanceof Error?e.message:'검색하지 못했어요. 기존 선택을 유지했어요.';}
  finally{if(valid(g,k)){loading=false;render();}}
 }
 function acceptRecommendation(result:api.AudienceRecommendation){
  for(const p of result.items)known.set(p.id,p);selected=new Set(result.items.map(p=>p.id));audience.entry_ids=[...selected];audience.requested_count=desiredCount;appliedFilters=filterKey();pendingShortfall=undefined;reviewLimit=REVIEW_SIZE;manualOpen=false;replaceId=null;
  options.draft(structuredClone(audience));status=`조건에 맞는 ${selected.size}명의 구성을 만들었어요. 함께할 시선을 확인해 주세요.`;error='';
 }
 async function recommend(){
  if(loading||saving||locked())return;capture();checkFilters();checkCount();pendingShortfall=undefined;
  const g=++generation,k=key,filters=structuredClone(audience.filters),count=desiredCount;loading=true;error='';render();
  try{
   const result=await api.recommendAudience(filters,count);if(!valid(g,k))return;
   if(!Array.isArray(result.items)||result.requested_count!==count)throw new Error('구성 응답을 확인하지 못했어요. 기존 선택을 유지했어요.');
   total=result.total;
   if(result.items.length<count){pendingShortfall=result;status='';error=result.total?`현재 조건에는 ${result.total}명만 있어요. 가능한 인원으로 구성하거나 조건을 바꿔주세요.`:'현재 조건에 맞는 프로필이 없어요. 보유하지 않은 특성을 임의로 채우지 않아요.';}
   else acceptRecommendation(result);
  }catch(e){if(valid(g,k))error=e instanceof Error?e.message:'구성을 추천하지 못했어요. 기존 선택을 유지했어요.';}
  finally{if(valid(g,k)){loading=false;render();}}
 }
 async function load(){
  if(!options.ready()||locked())return;
  const g=++generation,k=key;loading=true;render();
  try{
   const value=await api.audienceFacets();if(!valid(g,k))return;facets={...value,regions:regionOptions(value.regions)};
   const missing=[...selected].filter(id=>!known.has(id));
   for(let i=0;i<missing.length;i+=RESTORE_BATCH){const rows=await Promise.all(missing.slice(i,i+RESTORE_BATCH).map(api.getLibraryPersona));if(!valid(g,k))return;for(const p of rows)if(p?.id)known.set(p.id,p);}
  }catch(e){if(valid(g,k))error=e instanceof Error?e.message:'조건과 저장된 프로필을 불러오지 못했어요.';}
  finally{if(valid(g,k)){loading=false;render();}}
  if(valid(g,k)&&facets)await search();
 }
 function sync(){
  const next=options.key();if(next===key){if(host.childElementCount)renderSelection();return;}
  key=next;generation++;loading=false;saving=false;error='';status='';facets=undefined;known=new Map();candidates=[];total=0;offset=0;manualOpen=false;replaceId=null;pendingShortfall=undefined;reviewLimit=REVIEW_SIZE;
  const s=options.get();audience=structuredClone(s.audienceDraft||s.workflow?.scope.audience||emptyAudience());audience.filters.regions=regionOptions(audience.filters.regions);desiredCount=audience.requested_count||s.count||30;
  for(const p of s.personas){const id=p.attributes.source.library_entry_id;if(id)known.set(id,{id,panel_id:p.attributes.source.library_panel_id||0,source_persona_id:p.attributes.source.persona_id||`P${p.id}`,profile_hash:'',attributes:p.attributes});}
  if(!s.audienceDraft&&!audience.entry_ids.length)audience.entry_ids=[...known.keys()];selected=new Set(audience.entry_ids);appliedFilters=filterKey();render();if(options.ready())void load();
 }
 async function save():Promise<boolean>{
  if(locked())return true;if(loading||saving)return false;
  const startedKey=options.key();let focusId='audienceCandidatesSection';
  try{
   capture();checkFilters();checkCount();
   if(filtersDirty())throw new Error('참여 조건이 바뀌었어요. 다시 추천받거나 조건에 맞는 후보를 확인해 주세요.');
   if(!selected.size)throw new Error('구성을 추천받거나 직접 선택으로 한 명 이상 추가해 주세요.');
   if(!audience.description.trim()){focusId='audienceDescription';throw new Error('어떤 사용자를 위한 테스트인지 한두 문장으로 적어주세요.');}
   const g=++generation,k=key;saving=true;error='';render();
   try{await options.apply(structuredClone(audience));if(!valid(g,k))return false;status='선택한 페르소나와 대상 사용자 설정을 저장했어요.';error='';return true;}
   finally{if(valid(g,k)){saving=false;render();}}
  }catch(e){
   if(options.key()!==startedKey)return false;error=e instanceof Error?e.message:'구성을 저장하지 못했어요.';render();const target=host.querySelector<HTMLElement>('#'+focusId);target?.focus({preventScroll:true});target?.scrollIntoView({block:'center',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return false;
  }
 }
 function focusManual(){host.querySelector<HTMLElement>('#audienceManualTitle')?.focus({preventScroll:true});host.querySelector<HTMLElement>('#audienceManual')?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
 async function click(event:Event){
  const startedKey=options.key(),b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b||b.disabled||loading||saving||locked())return;
  try{
   const replacement=Number(b.dataset.audienceReplace);
   if(replacement){
     // 교체는 같은 조건의 다른 사람으로 바로 바꾼다(아래에 후보 목록을 따로 열지 않는다)
     capture();if(filtersDirty())throw new Error('조건을 바꿨어요. 새 조건으로 구성을 먼저 확인해 주세요.');
     const g=++generation,k=key;loading=true;error='';render();
     try{
      const filters=structuredClone(audience.filters);
      const first=await api.searchAudience(filters,0,PAGE_SIZE);if(!valid(g,k))return;
      const span=Math.max(1,first.total-PAGE_SIZE+1),start=Math.floor(Math.random()*span);
      const pool=[...(start?(await api.searchAudience(filters,start,PAGE_SIZE)).items:first.items),...first.items];if(!valid(g,k))return;
      const pick=pool.find(p=>!selected.has(p.id));
      if(!pick){error='같은 조건에서 바꿀 다른 프로필이 없어요. 조건을 넓혀 보세요.';}
      else{known.set(pick.id,pick);selected=new Set([...selected].map(v=>v===replacement?pick.id:v));status='다른 사람으로 바꿨어요.';persist();}
     }catch(e){if(valid(g,k))error=e instanceof Error?e.message:'교체하지 못했어요. 기존 선택을 유지했어요.';}
     finally{if(valid(g,k)){loading=false;render();}}
     return;
    }
   const id=Number(b.dataset.audiencePick);
   if(id){
    capture();if(replaceId&&b.dataset.audiencePick){if(selected.has(id))return;selected=new Set([...selected].map(v=>v===replaceId?id:v));replaceId=null;manualOpen=false;status='선택한 사람으로 교체했어요.';}
    else if(selected.has(id))selected.delete(id);else if(selected.size<(facets?.max_selection||100))selected.add(id);else{options.notify('선택 가능한 인원을 넘었어요.',true);return;}
    persist();render();host.querySelector<HTMLElement>(replaceId? '#audienceCandidatesSection':b.dataset.audiencePick?`[data-audience-replace="${id}"]`:'#audienceCandidatesSection')?.focus({preventScroll:true});return;
   }
   const action=b.dataset.audienceAction;if(!action)return;
   if(action==='auto'){await recommend();return;}
   if(action==='manual'){capture();manualOpen=true;replaceId=null;render();await search();if(options.key()===startedKey)focusManual();return;}
   if(action==='close-manual'){capture();replaceId=null;manualOpen=false;render();host.querySelector<HTMLButtonElement>('[data-audience-action="manual"]')?.focus();return;}
   if(action==='search'||action==='more'||action==='previous'){manualOpen=true;await search(action==='more',false,action==='previous');return;}
   if(action==='reset'){capture();audience.filters=emptyAudience().filters;pendingShortfall=undefined;options.draft(structuredClone(audience));render();return;}
   if(action==='clear'){selected.clear();pendingShortfall=undefined;persist();render();return;}
   if(action==='accept-available'&&pendingShortfall){desiredCount=pendingShortfall.items.length;acceptRecommendation(pendingShortfall);render();return;}
   if(action==='review-more'){capture();reviewLimit+=REVIEW_SIZE;render();return;}
   if(action==='apply')await save();
  }catch(e){if(options.key()!==startedKey)return;error=e instanceof Error?e.message:'처리하지 못했어요.';render();}
 }
 const closeFilters=(except?:Element)=>host.querySelectorAll<HTMLDetailsElement>('.ab-filter-select[open]').forEach(d=>{if(d!==except)d.open=false;});
 const toggle=(event:Event)=>{const target=event.target as HTMLDetailsElement;if(target.matches?.('.ab-filter-select')&&target.open)closeFilters(target);};
 const outside=(event:Event)=>{if(!(event.target as Element)?.closest?.('.ab-filter-select'))closeFilters();};
 const filterKeys=(event:KeyboardEvent)=>{if(event.key==='Escape'){const open=host.querySelector<HTMLDetailsElement>('.ab-filter-select[open]');if(open){closeFilters();open.querySelector<HTMLElement>('summary')?.focus();event.stopPropagation();}}};
 const mapClick=(event:Event)=>{const t=event.target as HTMLElement;const dot=t.closest<HTMLElement>('[data-audience-dot]');if(dot){mapPick=Number(dot.dataset.audienceDot);renderMap();return;}
  const rb=t.closest<HTMLButtonElement>('[data-audience-map-replace]');if(rb&&!rb.disabled){const fake=document.createElement('button');fake.dataset.audienceReplace=rb.dataset.audienceMapReplace;void click({target:fake} as unknown as Event);}};
 host.addEventListener('click',click);host.addEventListener('click',mapClick);host.addEventListener('toggle',toggle,true);host.addEventListener('keydown',filterKeys);host.ownerDocument.addEventListener('click',outside);
 const input=(event:Event)=>{
  if(locked()||saving||(loading&&!['audienceDescription','audienceContext'].includes((event.target as HTMLElement).id)))return;
  pendingShortfall=undefined;persist();renderSelection();renderShortfall();
 };host.addEventListener('input',input);
 return {sync,isDirty,save,showPage,validateDescription,state:()=>({selected:selected.size,description:audience.description.trim(),dirty:isDirty(),loading,saving}),refresh:()=>{key='';sync();},dispose:()=>{generation++;key='';host.removeEventListener('click',click);host.removeEventListener('click',mapClick);host.removeEventListener('input',input);host.removeEventListener('toggle',toggle,true);host.removeEventListener('keydown',filterKeys);host.ownerDocument.removeEventListener('click',outside);host.replaceChildren();}};
}
