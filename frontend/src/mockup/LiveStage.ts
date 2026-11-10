import type { Study, BrowserEvidence } from '../studio/model';
import { DROP_LABELS } from '../studio/model';
import { outcome } from './ReportModel';
import { portraitMarkup, displayAttributes } from './DisplayPersona';
import './live-stage.css';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const actionName=(e?:BrowserEvidence)=>e?.action.status==='failed'?'실행 차단':e?({click:'클릭',fill:'입력',scroll:'스크롤',abandon:'탐색 중단',complete:'목표 도달',stop:e.action.drop_reason==='MAX_TURNS'?'횟수까지':'탐색 종료'}[e.action.action||'']||'화면 관찰'):'기록 대기';
// 타임라인 마커 색: 클릭·입력·중단·목표·횟수까지를 한눈에 구분한다(세션 재생기의 이벤트 마커와 같은 읽는 법)
const markerKind=(e:BrowserEvidence,last:boolean,result?:string)=>e.action.status==='failed'?'fail':e.action.action==='abandon'?'stop':(e.action.action==='complete'||(last&&result==='complete'))?'goal':e.action.action==='stop'?'sys':e.action.action==='fill'?'fill':'step';
const imageSource=(value?:string)=>value&&(/^(data:image\/(jpeg|png|webp);base64,|\/api\/runs\/\d+\/evidence\/\d+\/image(?:\?|$))/.test(value))?value:'';
const IMAGE_WAIT_MS=7000,REPLAY_MS=1500;
type Frame={node:HTMLButtonElement;image:HTMLImageElement;buffer:HTMLImageElement;requested:string;record?:BrowserEvidence;pending?:BrowserEvidence;loading:boolean;error:boolean;token:number;timer?:ReturnType<typeof setTimeout>};
export function mountLiveStage(host:HTMLElement){
 let study:Study|null=null,key='',selected=0,person=0,follow=true,automatic=true,playing=false,disposed=false,logAll=true,replayScope:'person'|'all'='all';
 let replayTimer:ReturnType<typeof setTimeout>|undefined,liveTimer:ReturnType<typeof setTimeout>|undefined;
 const frames=new Map<number,Frame>();
 host.classList.add('ls-compact');
 host.innerHTML=`<header class="ls-toolbar"><div class="ls-heading"><h2 data-ls-title>지금 <span class="ls-ul">탐색</span>하고 있어요</h2><p data-ls-sub></p></div><span data-ls-count></span><div class="ls-follow-controls"><button type="button" class="btn sm" data-ls-zoom aria-label="선택한 화면 확대">크게 보기</button><button type="button" class="btn sm" data-ls-all hidden>전체 실행 따라가기</button><button type="button" class="btn sm" data-ls-follow aria-pressed="true">실시간 따라가는 중</button></div></header><div class="ls-progress" role="progressbar" aria-label="탐색 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div><div class="ls-stats" role="status" aria-label="진행 현황"></div><div class="ls-workspace"><div class="ls-observation"><div class="ls-people" role="group" aria-label="화면을 볼 페르소나"></div><p class="ls-hint">사람을 누르면 그 사람의 화면으로 바뀌고, 아래 점을 누르면 그 순간으로 돌아가요. 지나간 기록은 자동으로 저장돼요.</p><div class="ls-deck" role="region" aria-label="실제 탐색 화면 3D 뷰어"><div class="ls-floor" aria-hidden="true"></div><div class="ls-frames"></div></div><div class="ls-caption"><span id="browserEvidenceLabel"></span></div><div class="ls-history"><div class="ls-playback" role="group" aria-label="저장된 행동 재생"><button type="button" data-ls-previous aria-label="이전 행동">←</button><button type="button" data-ls-play aria-pressed="false">재생 ▷</button><button type="button" data-ls-next aria-label="다음 행동">→</button><span data-ls-position></span></div><div class="ls-timeline" id="browserEvidenceSteps" role="group" aria-label="선택한 페르소나의 행동 기록"></div></div></div><aside class="ls-inspector"><div class="ls-person-summary"><span class="ls-portrait" data-ls-portrait></span><div><strong data-ls-identity></strong><span data-ls-profile></span></div></div><div class="ls-detail" aria-live="polite"><span class="ls-action"></span><strong class="ls-target-label"></strong><p class="ls-reason"></p><button type="button" class="ls-text-button" data-ls-reason>자세히 ↗</button></div><div class="ls-activity" role="status"><span class="ls-live-dot" aria-hidden="true"></span><strong data-ls-status></strong><button type="button" class="ls-text-button" data-ls-retry hidden>이미지 다시 불러오기 ↻</button></div><div class="ls-logbox"><div class="ls-logtabs" role="group" aria-label="기록 보기"><button type="button" data-ls-logmode="person" aria-pressed="true">이 사람</button><button type="button" data-ls-logmode="all" aria-pressed="false">전체 실시간</button></div><ol class="ls-log"></ol></div></aside></div><dialog class="ls-reason-dialog" aria-label="저장된 판단 원문"><header><strong>저장된 판단 원문</strong><button type="button" class="btn sm" data-ls-close>닫기 ×</button></header><p data-ls-full-reason></p><small>AI 페르소나의 기록 · 실제 사용자 응답과 구분하세요.</small></dialog><dialog class="ls-screen-dialog" aria-label="탐색 화면 확대"><header><strong data-ls-zoom-label></strong><button type="button" class="btn sm" data-ls-close-screen>닫기 ×</button></header><img alt="선택한 실제 탐색 화면"><p data-ls-zoom-action></p></dialog>`;
 { // 무대 배치: 사람 소개 → 화면 → 말풍선을 한 장에 모으고, 오른쪽에는 '방금 일어난 일'만 남긴다
  const q=(s:string)=>host.querySelector<HTMLElement>(s)!,doc=host.ownerDocument;
  const card=doc.createElement('section');card.className='ls-stage-card';
  q('.ls-person-summary').classList.add('ls-who');
  card.append(q('.ls-person-summary'),q('.ls-deck'),q('.ls-detail'),q('.ls-activity'));
  q('.ls-hint').after(card);
  const title=doc.createElement('h3');title.className='ls-feed-title';title.textContent='방금 일어난 일';q('.ls-inspector').prepend(title);
 }
 const el=<T extends HTMLElement=HTMLElement>(s:string)=>host.querySelector<T>(s)!;
 const events=()=>[...new Map((study?.evidence||[]).map(e=>[e.id,e])).values()].sort((a,b)=>a.id-b.id);
 const eligible=()=>events().filter(e=>automatic||e.persona_id===person);
 function latest(){const e=eligible().at(-1);if(e){selected=e.id;person=e.persona_id;}}
 function followNext(){
  if(liveTimer||!follow||disposed||!eligible().some(e=>e.id>selected))return;
  liveTimer=setTimeout(()=>{liveTimer=undefined;if(!follow||disposed)return;const f=frames.get(person);if(f?.loading){followNext();return;}if(f?.error)return;const next=eligible().find(e=>e.id>selected);if(next){selected=next.id;person=next.persona_id;draw();}},REPLAY_MS);
 }
 const personLabel=(id:number)=>study?.personas.find(p=>p.id===id)?.attributes.source.persona_id||`P${id}`;
 function stop(){playing=false;clearTimeout(replayTimer);replayTimer=undefined;}
 function releaseFrames(){clearTimeout(liveTimer);liveTimer=undefined;for(const dialog of host.querySelectorAll<HTMLDialogElement>('dialog')){if(dialog.open)dialog.close?.();}el<HTMLImageElement>('.ls-screen-dialog img').removeAttribute('src');el('[data-ls-zoom-label]').textContent='';el('[data-ls-zoom-action]').textContent='';for(const frame of frames.values()){clearTimeout(frame.timer);frame.buffer.onload=null;frame.buffer.onerror=null;frame.token++;}frames.clear();el('.ls-frames').replaceChildren();}
 function ensureFrame(id:number){
  let f=frames.get(id);if(f)return f;
  const node=host.ownerDocument.createElement('button');node.type='button';node.className='ls-frame';node.dataset.lsFrame=String(id);node.dataset.lsPerson=String(id);
  node.innerHTML='<span class="ls-frame-top"><i aria-hidden="true"></i><strong></strong><small></small></span><span class="ls-viewport"><img class="ls-current-image" alt=""><img class="ls-image-buffer" alt="" hidden aria-hidden="true"><span class="ls-placeholder">첫 화면을 준비하고 있어요</span><span class="ls-image-status" role="status" hidden></span><i class="ls-target-box" aria-hidden="true" hidden></i><i class="ls-pointer" aria-hidden="true" hidden></i><i class="ls-marker" aria-hidden="true" hidden></i><span class="ls-scroll-cue" aria-hidden="true" hidden>↓<small>스크롤</small></span></span><span class="ls-frame-bottom"></span>';
  const image=node.querySelector<HTMLImageElement>('.ls-current-image')!,buffer=node.querySelector<HTMLImageElement>('.ls-image-buffer')!;
  const preview=imageSource(study?.workflow?.source.preview);if(preview)image.src=preview;else image.hidden=true;
  f={node,image,buffer,requested:'',loading:false,error:false,token:0};frames.set(id,f);el('.ls-frames').append(node);return f;
 }
 function loadFrame(f:Frame,record?:BrowserEvidence){
  const src=imageSource(record?.image)||imageSource(study?.workflow?.source.preview);f.pending=record;
  if(!src)return;
  if(f.image.getAttribute('src')===src){if(f.requested!==src){f.token++;clearTimeout(f.timer);f.buffer.onload=null;f.buffer.onerror=null;f.requested=src;}f.record=record;f.loading=false;f.error=false;return;}
  if(f.requested===src)return;
  f.requested=src;f.loading=true;f.error=false;const token=++f.token,identity=key;
  const valid=()=>!disposed&&f.loading&&key===identity&&frames.get(Number(f.node.dataset.lsFrame))===f&&f.token===token;
  const fail=()=>{if(!valid())return;clearTimeout(f.timer);f.loading=false;f.error=true;draw();};
  const loaded=async()=>{
   if(!valid())return;
   try{if(f.buffer.decode)await f.buffer.decode();}catch{fail();return;}
   if(!valid())return;
   clearTimeout(f.timer);f.image.src=src;f.image.hidden=false;f.record=f.pending;f.loading=false;f.error=false;f.node.classList.remove('ls-image-arrived');void f.node.offsetWidth;f.node.classList.add('ls-image-arrived');draw();
  };
  f.buffer.onload=()=>{void loaded();};f.buffer.onerror=fail;clearTimeout(f.timer);f.timer=setTimeout(fail,IMAGE_WAIT_MS);f.buffer.src=src;
  if(f.buffer.complete&&f.buffer.naturalWidth>0)void loaded();
 }
 function mark(f:Frame,record:BrowserEvidence|undefined,center:boolean){
  const target=record?.screen.elements.find(e=>e.id===record.action.target),rect=target?.rect,viewport=record?.screen.viewport;
  const marker=f.node.querySelector<HTMLElement>('.ls-marker')!,pointer=f.node.querySelector<HTMLElement>('.ls-pointer')!,box=f.node.querySelector<HTMLElement>('.ls-target-box')!,scroll=f.node.querySelector<HTMLElement>('.ls-scroll-cue')!;
  const kind=record?.action.action,visible=Boolean(center&&!f.loading&&!f.error&&record&&record.action.status!=='failed'&&f.record?.id===record.id);
  marker.hidden=true;pointer.hidden=true;box.hidden=true;scroll.hidden=!(visible&&kind==='scroll');
  if(viewport){f.node.style.setProperty('--ls-ratio',String(viewport.width/viewport.height));f.node.querySelector<HTMLElement>('.ls-viewport')!.style.aspectRatio=`${viewport.width} / ${viewport.height}`;}
  if(!visible||!rect||!viewport||!['click','fill'].includes(kind||''))return;
  const x=(rect.x+rect.width/2)/viewport.width*100,y=(rect.y+rect.height/2)/viewport.height*100;
  if(x<0||x>100||y<0||y>100||rect.width<=0||rect.height<=0)return;
  marker.hidden=false;pointer.hidden=false;box.hidden=false;marker.style.left=pointer.style.left=`${x}%`;marker.style.top=pointer.style.top=`${y}%`;marker.dataset.action=kind;
  Object.assign(box.style,{left:`${rect.x/viewport.width*100}%`,top:`${rect.y/viewport.height*100}%`,width:`${rect.width/viewport.width*100}%`,height:`${rect.height/viewport.height*100}%`});box.dataset.action=kind;
  if(marker.dataset.event!==String(record!.id)){marker.dataset.event=String(record!.id);marker.classList.remove('is-touching');void marker.offsetWidth;marker.classList.add('is-touching');}
 }
 function draw(){
  if(!study||disposed)return;
  const all=events();
  person ||= study.personas[0]?.id||0;
  if(!selected){const first=automatic?(study.status==='running'?all[0]:all.at(-1)):all.filter(e=>e.persona_id===person).at(-1);if(first){selected=first.id;person=first.persona_id;}}
  const active=all.find(e=>e.id===selected&&e.persona_id===person)||all.filter(e=>e.persona_id===person).at(-1);selected=active?.id||0;
  host.dataset.viewport=study.workflow?.scope.viewport==='mobile'?'mobile':'desktop';host.dataset.follow=String(follow);host.dataset.playing=String(playing);
  const ids=study.personas.map(p=>p.id);if(!ids.length)ids.push(0);const activeIndex=Math.max(0,ids.indexOf(person));
  const controls=el<HTMLButtonElement>('[data-ls-follow]');controls.setAttribute('aria-pressed',String(follow));controls.textContent=follow?(study.status==='running'?automatic?'● 실시간 따라가는 중':'● 이 사람을 실시간으로':'마지막 기록'):'최신 화면으로 →';el('[data-ls-all]').hidden=automatic||study.status!=='running';
  { const rs=(study.results||[]).filter(r=>r.act),n=study.personas.length;
    const done=rs.filter(r=>outcome(r)==='complete').length,stopped=rs.filter(r=>outcome(r)==='drop').length,wrapped=rs.filter(r=>outcome(r)==='system').length,missing=Math.max(0,n-rs.length),ended=(study.status==='done'||study.status==='failed')&&rs.length>0,going=ended?0:missing,lost=ended?missing:0;
    const chip=(label:string,value:number,kind:string)=>`<div class="ls-stat" data-k="${kind}"><b>${value}</b><span>${label}</span></div>`;
    const m=chip('탐색 중·대기',going,'run')+chip('끝까지 간 사람',done,'good')+chip('중간에 멈춘 사람',stopped,'bad')+chip('탐색 마침',wrapped,'end')+(lost?chip('기록 없음',lost,'bad'):'');
    const box=el('.ls-stats');if(box.innerHTML!==m)box.innerHTML=m; }
  const terminal=(study.results||[]).filter(r=>r.act).length;el('[data-ls-count]').textContent=`${terminal} / ${study.personas.length}명 종료`;
  { const total=study.personas.length,pct=total?Math.round(terminal/total*100):0,lostPeople=(study.status==='done'||study.status==='failed')&&terminal>0?Math.max(0,total-terminal):0,finished=total>0&&(terminal>=total||lostPeople>0);
    el('[data-ls-title]').innerHTML=finished?'탐색을 <span class="ls-ul">마쳤어요</span>':study.status==='running'?'지금 <span class="ls-ul">탐색</span>하고 있어요':'저장된 <span class="ls-ul">탐색</span> 기록';
    const rs2=(study.results||[]).filter(r=>r.act),good=rs2.filter(r=>outcome(r)==='complete').length,bad=rs2.filter(r=>outcome(r)==='drop').length;
    el('[data-ls-sub]').textContent=`${study.product?.name||study.name||'테스트'} · ${total}명 중 ${terminal}명이 끝냈어요${good?` · 목표 도달 ${good}명`:''}${bad?` · 중간에 멈춘 ${bad}명`:''}${lostPeople?` · 오류로 기록이 없는 ${lostPeople}명`:''}`;
    const bar=el('.ls-progress');bar.setAttribute('aria-valuenow',String(pct));bar.querySelector<HTMLElement>('i')!.style.width=`${pct}%`; }
  const peopleMarkup=study.personas.map(p=>{const mine=all.filter(e=>e.persona_id===p.id),last=mine.at(-1),ended=(study!.results||[]).find(r=>r.id===p.id)?.act;const ticks=mine.map((e,i)=>`<b class="is-${markerKind(e,i===mine.length-1,ended?.end.result)}"></b>`).join('');return `<button type="button" data-ls-person="${p.id}" aria-pressed="${person===p.id}"><strong>${esc(personLabel(p.id))}</strong><i class="ls-ticks" aria-hidden="true">${ticks}</i><small>${ended?ended.end.drop_reason==='MAX_TURNS'?'횟수까지':ended.end.result==='complete'?'목표 도달':'탐색 종료':last?actionName(last):'기록 대기'}</small></button>`;}).join('');
  if(el('.ls-people').innerHTML!==peopleMarkup)el('.ls-people').innerHTML=peopleMarkup;
  for(const[id,f]of frames)if(!ids.includes(id)){clearTimeout(f.timer);f.token++;f.node.remove();frames.delete(id);}
  ids.forEach((id,i)=>{
   const record=id===person?active:all.filter(e=>e.persona_id===id).at(-1),f=ensureFrame(id);loadFrame(f,record);
   let distance=i-activeIndex;if(ids.length>2){if(distance>ids.length/2)distance-=ids.length;if(distance<-ids.length/2)distance+=ids.length;}
   const center=id===person||id===0,hidden=Math.abs(distance)>2;f.node.style.setProperty('--offset',String(distance));f.node.style.setProperty('--depth',`${-Math.abs(distance)*240}px`);f.node.style.setProperty('--angle',`${distance*-36}deg`);f.node.style.opacity=hidden?'0':center?'1':'.66';f.node.style.zIndex=String(10-Math.abs(distance));f.node.style.visibility=hidden?'hidden':'visible';f.node.tabIndex=hidden?-1:0;f.node.setAttribute('aria-pressed',String(center));f.node.setAttribute('aria-label',`${personLabel(id)} ${record?'관찰 화면':'기록 대기'} 선택`);
   f.node.querySelector('strong')!.textContent=personLabel(id);f.node.querySelector('small')!.textContent=f.loading?'캡처 불러오는 중':record?actionName(record):'기록 대기';
   if(center)f.image.id='browserEvidenceImage';else f.image.removeAttribute('id');
   f.image.alt=f.record?`${personLabel(id)}가 관찰한 ${f.record.screen.label}`:'연결 시점의 시작 화면 · 실행 캡처 대기';
   f.node.querySelector<HTMLElement>('.ls-placeholder')!.hidden=Boolean(f.image.getAttribute('src'));
   const note=f.node.querySelector<HTMLElement>('.ls-image-status')!;note.hidden=!(f.loading||f.error||record?.screen.capture_ready===false);note.textContent=f.error?'이미지 연결 지연 · 이전 캡처 유지':f.loading?'다음 캡처를 불러오는 중 · 이전 화면 유지':'로딩 중 저장된 캡처';
   f.node.querySelector('.ls-frame-bottom')!.textContent=f.record?f.record.screen.label:'연결한 시작 화면 · 탐색 캡처 대기';mark(f,f.record,center);
  });
  const frame=frames.get(person),shown=frame?.record;
  host.dataset.evidence=String(shown?.id||0);
  const waiting=eligible().filter(e=>e.id>selected).length;host.dataset.pending=String(waiting);
  if(follow&&waiting)controls.title=`아직 보지 못한 기록 ${waiting}개가 순서대로 재생돼요`;else controls.removeAttribute('title');
  el('#browserEvidenceLabel').textContent=shown?`${shown.screen.label}${frame?.loading?' · 캡처 불러오는 중':''}`:'연결한 시작 화면 · 첫 행동 기록을 기다리고 있어요';
  el('[data-ls-status]').textContent=playing?'저장된 기록 재생 중':frame?.error?'캡처 연결 지연':frame?.loading?'다음 캡처 불러오는 중':follow&&waiting?'행동별 실제 캡처 재생':study.status==='running'?follow?'다음 행동을 기다리는 중':'선택한 기록 관찰 중':'저장된 실행 기록';
  el('[data-ls-retry]').hidden=!frame?.error;
  el('.ls-action').textContent=actionName(shown);el('.ls-target-label').textContent=shown?.screen.elements.find(e=>e.id===shown.action.target)?.text||(shown?.action.action==='scroll'?'아래로 스크롤':'');
  const fullReason=shown?.action.error||shown?.action.reason||(shown?.action.action==='complete'?'설정한 완료 지점에 도달했습니다.':shown?.action.drop_reason?DROP_LABELS[shown.action.drop_reason]||shown.action.drop_reason:shown?'추가 판단 기록이 없습니다.':'행동과 이유가 저장되면 여기에 표시됩니다.');
  el('.ls-reason').textContent=fullReason.length>180?fullReason.slice(0,180)+'…':fullReason;
  el('[data-ls-full-reason]').textContent=fullReason;el<HTMLButtonElement>('[data-ls-reason]').hidden=!shown?.action.reason&&!shown?.action.error;
  const profile=study.personas.find(p=>p.id===person);el('[data-ls-portrait]').innerHTML=profile?portraitMarkup(displayAttributes(profile.attributes),'ls-portrait-img'):'';el('[data-ls-identity]').textContent=personLabel(person);el('[data-ls-profile]').textContent=profile?`${profile.attributes.profile.age}세 · ${profile.attributes.profile.job_group}`:'';
  const timeline=el('.ls-timeline'),items=all.filter(e=>e.persona_id===person);const endResult=(study!.results||[]).find(r=>r.id===person)?.act?.end.result;const markup=items.map((e,i)=>`<button type="button" class="ls-m is-${markerKind(e,i===items.length-1,endResult)}" data-n="${e.turn+1}" title="${esc(`${e.turn+1}번째 · ${actionName(e)}`)}" data-ls-evidence="${e.id}" aria-pressed="${shown?.id===e.id}"><span>${String(e.turn+1).padStart(2,'0')}</span> ${esc(actionName(e))}</button>`).join('');if(timeline.innerHTML!==markup)timeline.innerHTML=markup;
  const log=el('.ls-log'),shownItems=logAll?[...all].reverse().slice(0,60):items;
  host.querySelectorAll<HTMLElement>('[data-ls-logmode]').forEach(b=>b.setAttribute('aria-pressed',String((b.dataset.lsLogmode==='all')===logAll)));
  const logMarkup=shownItems.map(e=>`<li class="${shown?.id===e.id?'on':''}${e.action.action==='abandon'?' stop':''}"><button type="button" data-ls-log="${e.id}" aria-pressed="${shown?.id===e.id}">${(()=>{const lp=study!.personas.find(p=>p.id===e.persona_id);return lp?portraitMarkup(displayAttributes(lp.attributes),'ls-log-portrait'):'';})()}<b>${logAll?esc(personLabel(e.persona_id)):String(e.turn+1).padStart(2,'0')}</b><span><small>${esc(personLabel(e.persona_id))} · ${esc(e.screen.label)}</small><em>${esc(actionName(e))}</em>${e.action.reason?`<q>${esc(e.action.reason)}</q>`:''}</span></button></li>`).join('')||'<li class="empty">첫 행동이 저장되면 이유와 함께 여기에 쌓여요.</li>';
  if(log.innerHTML!==logMarkup){const keep=log.scrollTop;log.innerHTML=logMarkup;const on=log.querySelector<HTMLElement>('li.on');if(on&&!logAll)log.scrollTop=Math.max(0,on.offsetTop-log.clientHeight/2);else log.scrollTop=logAll?0:keep;}
  const at=all.findIndex(e=>e.id===selected),mine=all.filter(e=>e.persona_id===person),mineAt=mine.findIndex(e=>e.id===selected);el<HTMLButtonElement>('[data-ls-previous]').disabled=mineAt<=0;el<HTMLButtonElement>('[data-ls-next]').disabled=mineAt<0||mineAt>=mine.length-1;el<HTMLButtonElement>('[data-ls-play]').disabled=!all.length;el('[data-ls-play]').textContent=playing?'멈추기 Ⅱ':'처음부터 다시 보기 ▷';el('[data-ls-play]').setAttribute('aria-pressed',String(playing));{const pos=el('[data-ls-position]');pos.textContent=mine.length?`${personLabel(person)} · ${Math.max(0,mineAt)+1}/${mine.length}번째`:all.length?'이 사람의 기록 대기':'기록 대기';pos.title=all.length?`전체 기록 ${at+1}/${all.length} 중`:'';}
  el<HTMLButtonElement>('[data-ls-zoom]').disabled=!shown;
  const screenDialog=el<HTMLDialogElement>('.ls-screen-dialog');if(screenDialog.open&&shown){screenDialog.querySelector('img')!.src=frame!.image.src;el('[data-ls-zoom-label]').textContent=shown.screen.label;el('[data-ls-zoom-action]').textContent=`${personLabel(person)} · ${actionName(shown)} · ${fullReason}`;}
  followNext();
 }
 function move(delta:number,scope:'person'|'all'='all'){const all=events().filter(e=>scope==='all'||e.persona_id===person),at=all.findIndex(e=>e.id===selected),next=all[Math.max(0,Math.min(all.length-1,at+delta))];if(next){selected=next.id;person=next.persona_id;follow=false;automatic=false;draw();}}
 function schedule(){clearTimeout(replayTimer);if(!playing||disposed)return;replayTimer=setTimeout(()=>{if(frames.get(person)?.loading){schedule();return;}if(frames.get(person)?.error){stop();draw();return;}const all=events().filter(e=>replayScope==='all'||e.persona_id===person),at=all.findIndex(e=>e.id===selected);if(at>=all.length-1){stop();draw();return;}move(1,replayScope);schedule();},REPLAY_MS);}
 function click(event:Event){const b=(event.target as HTMLElement).closest<HTMLButtonElement>('button');if(!b||b.disabled)return;
  if(b.hasAttribute('data-ls-zoom')){stop();follow=false;el<HTMLDialogElement>('.ls-screen-dialog').showModal();draw();return;}
  else if(b.hasAttribute('data-ls-close-screen')){el<HTMLDialogElement>('.ls-screen-dialog').close();return;}
  else if(b.hasAttribute('data-ls-reason')){stop();follow=false;automatic=false;draw();el<HTMLDialogElement>('.ls-reason-dialog').showModal();return;}
  else if(b.hasAttribute('data-ls-close')){el<HTMLDialogElement>('.ls-reason-dialog').close();return;}
  else if(b.dataset.lsPerson!==undefined){stop();person=Number(b.dataset.lsPerson);selected=0;follow=true;automatic=false;}
  else if(b.dataset.lsEvidence){stop();selected=Number(b.dataset.lsEvidence);follow=false;automatic=false;}
  else if(b.dataset.lsLog){stop();selected=Number(b.dataset.lsLog);const ev=events().find(e=>e.id===selected);if(ev)person=ev.persona_id;follow=false;automatic=false;}
  else if(b.dataset.lsLogmode){logAll=b.dataset.lsLogmode==='all';}
  else if(b.hasAttribute('data-ls-follow')){stop();follow=!follow;if(follow)latest();}
  else if(b.hasAttribute('data-ls-all')){stop();automatic=true;follow=true;latest();}
  else if(b.hasAttribute('data-ls-previous')){stop();move(-1,'person');return;}
  else if(b.hasAttribute('data-ls-next')){stop();move(1,'person');return;}
  else if(b.hasAttribute('data-ls-play')){if(playing)stop();else{replayScope=automatic?'all':'person';const list=events().filter(e=>replayScope==='all'||e.persona_id===person);playing=true;follow=false;automatic=false;if(list.length&&list.at(-1)?.id===selected){selected=list[0].id;person=list[0].persona_id;}schedule();}}
  else if(b.hasAttribute('data-ls-retry')){const f=frames.get(person);if(f){f.requested='';f.error=false;}}
  else return;draw();
 }
 host.addEventListener('click',click);
 return {update(next:Study,selectedId?:number){const nextKey=`${next.id}:${next.runs?.act||0}`;if(key!==nextKey){stop();key=nextKey;selected=0;person=0;follow=true;automatic=true;releaseFrames();}study=next;if(selectedId){stop();selected=selectedId;person=next.evidence?.find(e=>e.id===selectedId)?.persona_id||0;follow=false;automatic=false;}host.hidden=!next.workflow||!['web','html'].includes(next.workflow.source.kind||'');draw();},replay(){if(events().length){stop();follow=false;automatic=false;selected=events()[0].id;person=events()[0].persona_id;playing=true;draw();schedule();}},dispose(){disposed=true;stop();releaseFrames();host.removeEventListener('click',click);host.replaceChildren();}};
}
