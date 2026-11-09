import { siteCoverage } from './SiteCoverage';
import type { Study, ObservedScreen } from '../studio/model';
import { reachable } from '../studio/model';
import { browserSource } from './WorkflowView';

const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const raster=(v?:string|null)=>v&&/^data:image\/(jpeg|png|webp);base64,/.test(v)?v:'';
const roleName:Record<string,string>={banner:'상단',navigation:'주요 메뉴',main:'본문',complementary:'보조 정보',contentinfo:'하단'};
export interface SourceCheckState {phase:'idle'|'loading'|'error';error?:string}
export type RecognitionTab='pages'|'checks'|'structure';
export interface RecognitionSelection {tab?:RecognitionTab;page?:number;stateId?:string}
const PAGE_SIZE=6;
export function explorationBlock(study:Study){
 const source=study.workflow?.source,job=source?.exploration;
 if(source?.inspection?.capture_ready===false)return '시작 화면이 아직 로딩 중이에요. 캡처를 다시 확인해 주세요.';
 if(!job)return '';
 if(['queued','running','pausing'].includes(job.status))return '구조 탐색이 끝나면 다음 단계로 이동할 수 있어요.';
 if(['paused','limited','failed'].includes(job.status)&&study.workflow?.scope.reviewed_exploration_id!==job.id)return '미확인 범위를 살펴보고 이어서 탐색하거나, 확인한 범위로 진행을 선택하세요.';
 return '';
}
export function explorationProgress(study:Study){
 const j=study.workflow?.source.exploration;if(!j)return null;
 if(j.mode==='snapshot'){const done=(j.pages_checked||0)+(j.pages_failed||0),total=Math.min(j.pages_found||0,j.budget.pages);return {label:'이번 화면 수집',done,total,percent:j.status==='done'?100:total?Math.min(99,Math.floor(done/total*100)):null};}
 const pages=j.phase==='pages'||!j.states,attempts=j.attempts||0,done=pages?(j.pages_checked||0)+(j.pages_failed||0):attempts,total=pages?j.pages_found||0:attempts+(j.pending_actions||0);
 return {label:pages?'발견한 페이지 확인':'발견한 조작 경로 확인',done,total,percent:j.status==='done'?100:total?Math.min(99,Math.floor(done/total*100)):null};
}
type Check={title:string;text:string;action:string;level:'attention'|'note'};

export function sourceNeedsReconnect(study:Study){return Boolean(browserSource(study)&&study.workflow?.source.viewport&&study.workflow.source.viewport!==study.workflow.scope.viewport);}
export function sourceReview(study:Study,selectedId=''){
 const source=study.workflow?.source,web=browserSource(study),meta=source?.inspection;
 const screen:ObservedScreen|undefined=web?(source?.observed_screen||study.screens[0]):study.screens.find(s=>s.id===selectedId)||study.screens[0];
 const elements=screen?.elements||[],links=elements.filter(e=>web?Boolean(e.href):Boolean(e.to)),image=raster(web?source?.preview:screen?.image),checks:Check[]=[];
 const add=(title:string,text:string,action:string,level:'attention'|'note'='attention')=>checks.push({title,text,action,level});
 if(screen){
  if(!image)add('화면 이미지 없음',web?'시작 화면의 캡처가 저장되지 않았어요.':'등록한 시안 이미지가 없어 문구와 연결만 확인할 수 있어요.',web?'다시 연결해 원본 화면이 보이는지 확인하세요.':'시각적인 확인이 필요하면 화면 이미지를 등록하세요.');
  if(!elements.length)add('조작 요소를 찾지 못했어요',web?'현재 화면에서 버튼이나 입력란을 읽지 못했어요.':'이 화면에는 이동 버튼이 등록되지 않았어요.',web?'로딩 중이거나 접근이 제한된 화면인지 미리보기를 확인하세요.':'화면 편집에서 버튼과 다음 화면을 연결하세요.');
  if(web&&!screen.description?.trim())add('화면 문구를 읽지 못했어요','본문 내용이 관찰 목록에 없어요.','미리보기가 원하는 화면인지 확인하세요.');
  if(meta?.capture_ready===false)add('시작 화면이 아직 로딩 중이에요','페이지의 첫 표시가 끝나기 전에 캡처됐을 수 있어요.','캡처 새로고침으로 시작 화면만 다시 확인하세요.');
  if(meta?.elements_truncated)add('일부 조작 요소만 읽었어요',`시작 화면의 조작 요소 ${meta.element_count}개 중 ${elements.length}개를 첫 관찰 목록에 담았어요.`,'한 번의 관찰에서 전달하는 요소 수의 제한입니다. 연결된 페이지와 메뉴의 구조 탐색은 별도로 계속됩니다.','note');
  if(meta?.frame_count)add('별도로 삽입된 화면이 있어요',`내장된 화면 영역 ${meta.frame_count}개의 내부 버튼과 입력란은 읽지 못했어요.`,'해당 영역이 핵심 기능이라면 그 화면의 원본 주소를 따로 연결하세요.');
  if(meta?.blocked_request_count)add('일부 요청을 제한했어요',`허용 범위 밖의 요청 ${meta.blocked_request_count}건이 제한됐어요. 화면 일부가 원본과 다를 수 있어요.`,'원본과 미리보기가 다를 때 확인할 참고 사항입니다. 제한된 요청이 있다는 것만으로 사이트 연결 실패는 아닙니다.','note');
  if(meta?.unloaded_image_count)add('불러오지 못한 이미지가 있어요',`이미지 ${meta.unloaded_image_count}개가 로드되지 않았어요.`,'지연 로딩이나 이미지 자체의 오류일 수 있습니다. 다른 화면의 탐색은 계속할 수 있어요.','note');
  if(meta?.dialog_count)add('열린 팝업이 있어요',`팝업 ${meta.dialog_count}개가 열린 상태로 연결됐어요.`,'원하는 시작 상태인지 미리보기를 확인하세요.','note');
  if(sourceNeedsReconnect(study))add('화면 크기가 달라졌어요','캡처는 이전 크기예요. 선택한 화면 크기와 실제 탐색 자료가 달라요.','왼쪽에서 화면을 다시 연결하면 다음 단계로 이동할 수 있어요.');
  if(source?.viewport==='mobile'&&meta?.layout_viewport&&meta.layout_viewport.width>meta.viewport.width)add('모바일에서 축소된 화면이에요','문서의 폭이 모바일 화면보다 넓어요.','미리보기에서 글자 크기와 가로 넘침을 확인하세요.','note');
  if(!web){const unreachable=study.screens.filter(s=>!reachable(study.screens,s.id));if(unreachable.length)add('연결되지 않은 시안이 있어요',`시작 화면에서 연결되지 않은 화면 ${unreachable.length}개가 있어요.`,'화면 편집에서 이동 경로를 연결하세요.');}
 }
 const coverage=siteCoverage(study);
 if(coverage?.errors)add('열지 못한 페이지가 있어요',`발견한 페이지 중 ${coverage.errors}개는 응답 오류나 접근 제한으로 읽지 못했어요.`,'페이지 목록에서 해당 주소를 확인하세요.');
 if(coverage?.map.limit_reached&&!source?.exploration)add('페이지 조사가 한도에서 멈췄어요',`이번 구조 조사는 최대 ${coverage.map.max_pages}페이지와 시간 한도를 적용했어요.`,'미확인 페이지는 검사 완료로 집계하지 않습니다. 필요한 페이지를 별도 시작점으로 연결할 수 있어요.');
 const probe=source?.site_map?.mode==='snapshot'||source?.exploration?.mode==='snapshot'?undefined:source?.preflight;
 const exploring=Boolean(source?.exploration&&['queued','running','pausing'].includes(source.exploration.status));
 if(probe?.limited&&!exploring)add('사전 탐색에서 남겨 둔 경로가 있어요',`${probe.states.length}개 화면을 확인했으며 탐색 시간·깊이·분기 한도에서 멈췄어요.`,'아래 실제 탐색 경로와 미확인 항목을 확인하세요. 제품 전체를 검증한 것으로 집계하지 않습니다.');
 if(probe?.status==='unavailable')add('사전 탐색을 완료하지 못했어요',probe.error||'버튼을 누른 뒤의 화면을 확인하지 못했어요.','주소의 접근 범위를 확인하고 다시 연결하세요.');
 const allMenus=probe?.navigation||[];
 const primaryMenus=allMenus.some(n=>n.kind==='global')?allMenus.filter(n=>n.kind==='global'):allMenus;
 const missingMenus=allMenus.filter(n=>n.status!=='visited');
 if(missingMenus.length&&!exploring)add('아직 들어가 보지 못한 메뉴가 있어요',missingMenus.slice(0,7).map(n=>(n.parent?n.parent+' / ':'')+n.label).join(' · ')+(missingMenus.length>7?` 외 ${missingMenus.length-7}개`:''),'메뉴별 확인 상태에서 미확인 항목을 확인하세요. 방문한 장면만 탐색 결과에 포함합니다.');
 const uncertain=probe?.transitions.filter(t=>['blocked','unconfirmed','unreplayed'].includes(t.status)||Boolean(t.restricted_requests))||[];
 if(uncertain.length)add('동작 결과를 확인하지 못한 경로가 있어요',`${uncertain.length}개 경로는 제한 요청·응답 지연·다시 재현되지 않은 상태로 남았어요.`,'사전 탐색 기록에서 대상 버튼을 확인하세요. 이를 제품 오류로 확정하지 않습니다.');
 const allHints=coverage?.pages.flatMap(p=>(p.issues||[]).map(i=>({...i,page:p.label,url:p.url})))||[];
 const hints=allHints.filter(h=>h.code!=='H1_MISSING');
 const technicalHints=allHints.filter(h=>h.code==='H1_MISSING');
 return {source,web,meta,screen,elements,links,image,checks,coverage,hints,technicalHints,probe,attention:checks.filter(c=>c.level==='attention'),notes:checks.filter(c=>c.level==='note'),checkCount:checks.length+hints.length};
}

export function sourceRecognitionMarkup(study:Study,state:SourceCheckState={phase:'idle'},selectedId=''){
 const r=sourceReview(study,selectedId),{source,web,meta,image,checks}=r;
 // 수정 회차는 새 앱·웹처럼 연결 대기로 시작한다. 이전 회차 캡처는 '이전 화면 그대로 연결'을 눌렀을 때만 가져온다
 const awaiting=Boolean(source?.needs_reconnect)&&state.phase!=='loading';
 const screen=awaiting?undefined:r.screen;
 const status=state.phase==='loading'?'읽는 중':state.phase==='error'?(screen?'이전 연결 보관':'연결 실패'):!screen?'연결 대기':sourceNeedsReconnect(study)?'다시 연결 필요':r.attention.length?'일부 확인 필요':web?'시작 화면 연결됨':'등록 자료';
 const header=`<header class="ri-heading"><div><span class="wf-eyebrow">STARTING SCREEN</span><h2>연결한 시작 화면</h2></div><span class="ri-status ${r.attention.length?'is-partial':''}">${esc(status)}</span></header>`;
 if(state.phase==='loading')return `${header}<div class="ri-loading" role="status"><span class="ri-spinner" aria-hidden="true"></span><h3>시작 화면을 연결하고 있어요.</h3><p>원하는 화면이 열리는지 먼저 확인합니다. 연결 후에는 연결된 페이지의 구조와 이미지만 빠르게 가져와요.</p><span>시작 화면 확인 → 연결 완료 → 구조 탐색 진행 · 페르소나 실행과 별도</span></div>`;
 const error=state.phase==='error'?`<div class="ri-error" role="alert"><strong>화면을 연결하지 못했어요.</strong><p>${esc(state.error)}</p><small>${screen?'아래는 이전에 연결한 화면입니다. 기존 자료는 유지했어요.':'주소나 파일을 확인하고 다시 연결해 주세요.'}</small></div>`:'';
 if(!screen)return `${header}${error}<div class="ri-empty"><div class="ri-wireframe" aria-hidden="true"><i></i><b></b><span></span><span></span><em></em></div><h3>시작 화면 미리보기</h3><p>화면을 연결하면 여기서 확인할 수 있어요.</p></div>`;
 const size=meta?`${meta.viewport.width} × ${meta.viewport.height}`:'';
 const captureLabel=web?`${(source?.viewport||study.workflow?.scope.viewport)==='mobile'?'모바일 브라우저':'데스크톱 브라우저'} · ${size||'브라우저 캡처'}`:'직접 등록한 시안';
 return `${header}${error}<div class="ri-source"><h3>${esc(web?source?.title||screen.label:screen.label)}</h3><small>${esc(screen.url||source?.url||source?.entry||'등록된 화면')}</small>${!image?`<small class="ri-capture-meta">${esc(captureLabel)}</small>`:''}</div>
 ${!web?`<label class="ri-screen-select">등록한 화면<select class="select" id="sourceScreenSelect">${study.screens.map(s=>`<option value="${esc(s.id)}" ${s.id===screen.id?'selected':''}>${esc(s.label)}${study.screens[0].id===s.id?' · 시작':''}</option>`).join('')}</select></label>`:''}
 ${web?`<button type="button" class="ri-refresh-capture" data-capture-refresh ${study.runs?.act||study.runs?.ask?'disabled':''}>캡처 새로고침 ↻</button>`:''}
 ${image?`<figure class="ri-capture"><button type="button" data-source-zoom aria-label="${esc(screen.label)} 화면 크게 보기"><img src="${esc(image)}" alt="${esc(screen.label)} ${web?'연결 시점 캡처':'등록 이미지'}"><span>크게 보기 ↗</span></button><figcaption><span>${web?'시작 화면 캡처':'등록한 이미지'}</span><span>${esc(captureLabel)}</span></figcaption></figure>`:'<div class="ri-no-image">확인할 화면 이미지가 없습니다.</div>'}
 <div class="ri-review-brief ${r.attention.length?'is-partial':''}"><div><strong>${sourceNeedsReconnect(study)?'선택한 크기로 다시 연결해 주세요.':r.attention.length?'확인되지 않은 범위가 있어요.':web?'시작 화면이 연결됐어요.':'원하는 시작 화면이 맞나요?'}</strong><p>${r.attention.length?'일부 요소나 화면은 읽지 못했어요. 다음 페이지에서 확인 범위를 살펴보세요.':web?'다음 페이지에서 연결 범위와 구조 탐색 진행을 확인하세요.':'등록한 이미지와 설명을 확인해 주세요. 이미지에서 구조를 자동 추론한 결과가 아닙니다.'}</p></div></div>`;
}


function snapshotJobMarkup(study:Study){
 const job=study.workflow!.source.exploration!,map=study.workflow!.source.site_map,locked=Boolean(study.runs?.act||study.runs?.ask),active=['queued','running','pausing'].includes(job.status);
 const remaining=map?.pages.filter(p=>p.state==='pending').length||0,progress=explorationProgress(study),canContinue=remaining>0&&job.status==='done';
 const names={queued:'화면 수집을 준비하고 있어요',running:'화면 이미지를 가져오고 있어요',pausing:'이미지를 저장하고 멈추는 중',paused:'화면 수집을 잠시 멈췄어요',limited:'이번 수집 범위를 확인했어요',done:'화면 이미지를 모았어요',failed:'화면을 가져오지 못했어요'};
 const action=active?'pause':job.status==='done'&&!canContinue?'start':'resume';
 return `<section class="ex-job snapshot-job ${active?'is-active':''}" aria-label="화면 이미지 수집 진행"><div class="ex-job-top"><div><span class="wf-eyebrow">SCREEN COLLECTION</span><h3 role="status">${names[job.status]}</h3><p>${active?'연결된 주소의 구조와 캡처를 가져옵니다. 버튼 클릭과 입력은 실행 단계에서 진행해요.':job.status==='done'?`수집한 화면으로 다음 단계에 진행할 수 있어요.${remaining?` 아직 수집하지 않은 주소 ${remaining}개는 필요할 때 더 가져오세요.`:''}`:'저장한 화면은 유지합니다. 이어서 수집하거나 현재 화면으로 진행하세요.'}</p></div>${!locked?`<button type="button" data-exploration-action="${action}" ${job.status==='pausing'||sourceNeedsReconnect(study)?'disabled':''}>${active?job.status==='pausing'?'저장 중…':'잠시 멈추기':canContinue?'더 수집 →':job.status==='done'?'다시 수집':'이어서 수집 →'}</button>`:''}</div>${active&&progress?`<div class="ex-progress"><div><strong>${progress.label}</strong><span>${progress.percent===null?'주소 파악 중':progress.percent+'%'}${progress.total?` · ${progress.done} / ${progress.total}`:''}</span></div><div class="ex-progress-track" role="progressbar" aria-label="이번 화면 수집" aria-valuemin="0" aria-valuemax="100" ${progress.percent===null?'':`aria-valuenow="${progress.percent}"`}><i style="width:${progress.percent||0}%"></i></div><small>이번 수집 대상 기준입니다. 사이트 전체의 완료율은 아닙니다.</small></div>`:''}<dl><div><dt>발견한 주소</dt><dd>${job.pages_found}</dd></div><div><dt>수집한 이미지</dt><dd>${job.states}</dd></div><div><dt>미수집 주소</dt><dd>${remaining}${job.pages_failed?`<small> · 접근 실패 ${job.pages_failed}</small>`:''}</dd></div></dl>${!locked&&!active&&job.status!=='done'?`<div class="ex-review-scope"><p>저장한 화면과 미수집 범위를 확인해 주세요.</p>${study.workflow?.scope.reviewed_exploration_id===job.id?'':`<button type="button" data-exploration-review>확인한 범위로 진행 →</button>`}</div>`:''}<footer><span>구조·이미지 수집 · 클릭·입력 없음 · 토큰 사용 없음</span><button type="button" data-exploration-show>수집한 이미지 보기 ↓</button></footer></section>`;
}

export function explorationMarkup(study:Study){
 if(!browserSource(study))return '';
 if(study.workflow?.source.exploration?.mode==='snapshot')return snapshotJobMarkup(study);
 const job=study.workflow?.source.exploration,locked=Boolean(study.runs?.act||study.runs?.ask),stale=sourceNeedsReconnect(study);
 if(!job)return locked?'':`<section class="ex-job"><div><span class="wf-eyebrow">SITE EXPLORATION</span><h3>메뉴와 연결된 화면도 살펴볼까요?</h3><p>별도 작업으로 진행하고 결과를 저장합니다. LLM 토큰을 사용하지 않아요.</p></div><button type="button" data-exploration-action="start" ${stale?'disabled':''}>구조 탐색 시작 →</button></section>`;
 const active=['queued','running','pausing'].includes(job.status);
 const names={queued:'탐색 대기 중',running:'사이트 구조를 살펴보고 있어요',pausing:'기록을 저장하고 멈추는 중',paused:'탐색을 잠시 멈췄어요',limited:job.reason==='unconfirmed_paths'?'확인하지 못한 경로가 남아 있어요':'이번 탐색 한도까지 확인했어요',done:'발견한 경로의 탐색을 마쳤어요',failed:'구조 탐색이 중단됐어요'};
 const text=job.status==='done'?'발견하고 접근 가능한 범위의 결과예요. 모든 기능의 정상 동작이나 사용성을 보장하지 않습니다.':job.status==='limited'&&job.reason==='unconfirmed_paths'?'반복 확인에 실패한 경로를 미확인으로 보관했어요. 다시 확인하거나 현재 확인한 범위로 진행할 수 있어요.':job.status==='limited'?'저장한 경로부터 이어서 탐색할 수 있어요. 이어 탐색하면 이번 조사 예산이 늘어납니다.':job.reason==='server_restart'?'서버가 재시작되어 기록을 보존했어요. 이어서 탐색을 눌러 재개하세요.':active?'페이지를 닫아도 탐색은 서버에서 계속됩니다. 탐색 결과를 확인한 뒤 다음 단계로 이동하세요.':'확인한 화면과 남은 경로를 보존했어요. 재현되지 않는 경로는 미확인으로 표시합니다.';
 const action=active?'pause':job.status==='done'?'start':'resume';
 const progress=explorationProgress(study),reviewed=study.workflow?.scope.reviewed_exploration_id===job.id;
 const label=active?(job.status==='pausing'?'저장 중…':'잠시 멈추기'):job.status==='done'?'새로 탐색':'이어서 탐색 →';
 return `<section class="ex-job ${active?'is-active':''}" aria-label="사이트 구조 탐색 진행"><div class="ex-job-top"><div><span class="wf-eyebrow">SITE EXPLORATION · ${job.phase==='pages'?'페이지 조사':job.phase==='screens'?'화면 전환 탐색':'저장된 결과'}</span><h3 role="status">${names[job.status]}</h3><p>${esc(job.error||text)}</p></div>${!locked?`<button type="button" data-exploration-action="${action}" ${job.status==='pausing'||stale?'disabled':''}>${label}</button>`:''}</div>${progress?`<div class="ex-progress"><div><strong>${progress.label}</strong><span>${progress.percent===null?'범위 파악 중':progress.percent+'%'}${progress.total?` · ${progress.done} / ${progress.total}`:''}</span></div><div class="ex-progress-track" role="progressbar" aria-label="${progress.label}" aria-valuemin="0" aria-valuemax="100" ${progress.percent===null?'':`aria-valuenow="${progress.percent}"`}><i style="width:${progress.percent||0}%"></i></div><small>현재 발견한 범위 기준입니다. 새 경로를 찾으면 진행률이 조정될 수 있어요.</small></div>`:''}<dl><div><dt>발견한 주소</dt><dd>${job.pages_found}</dd></div><div><dt>구조 확인</dt><dd>${job.pages_checked}${job.pages_failed?`<small> · 접근 실패 ${job.pages_failed}</small>`:''}</dd></div><div><dt>열어 본 화면 상태</dt><dd>${job.states}</dd></div><div><dt>남은 조작 경로</dt><dd>${job.pending_actions}</dd></div></dl>${!locked&&!active&&job.status!=='done'?`<div class="ex-review-scope"><p>${reviewed?'현재 확인한 범위를 확인했어요. 다음 단계로 이동할 수 있습니다.':'남은 경로가 있어요. 이어서 탐색하거나 현재 확인한 범위로 진행하세요.'}</p>${reviewed?'':`<button type="button" data-exploration-review>확인한 범위로 진행 →</button>`}</div>`:''}<footer><span>이번 예산 ${job.budget.states}화면 · ${Math.round(job.budget.seconds/60)}분 · 토큰 사용 없음${locked?' · 실행 당시 자료 보관':''}</span><button type="button" data-exploration-show>확인한 화면 보기 ↓</button></footer></section>`;
}

export function sourceDetailsMarkup(study:Study,state:SourceCheckState={phase:'idle'},selectedId='',selection:RecognitionSelection={}){
 const r=sourceReview(study,selectedId),{source,web,meta,screen,elements,links,coverage,checks,hints}=r;
 if(!screen||state.phase==='loading')return '';
 const probe=source?.site_map?.mode==='snapshot'||source?.exploration?.mode==='snapshot'?undefined:source?.preflight;
 const snapshotMode=source?.site_map?.mode==='snapshot'||source?.exploration?.mode==='snapshot';
 const capturedPages=coverage?.pages.filter(p=>p.state!=='pending')||[],imageCount=capturedPages.filter(p=>raster(p.image)).length;
 const hasProbe=Boolean(probe?.states.length);
 const tab=selection.tab||(r.attention.length&&!hasProbe&&!source?.exploration?'checks':'pages');
 const tabs:[RecognitionTab,string,number][]=[['pages',snapshotMode?'화면 이미지':hasProbe?'살펴본 화면':web?'페이지 목록':'등록한 시안',snapshotMode?imageCount:hasProbe?probe!.states.length:coverage?.pages.length??(web?1:study.screens.length)],['checks',r.attention.length?'확인할 부분':'연결 참고',r.checkCount],['structure','인식 상세',elements.length]];
 const partial=r.attention.length>0;
 const summary=snapshotMode?`${imageCount}개 화면 이미지를 수집했어요. 실제 클릭과 사용 흐름 확인은 실행 단계에서 진행합니다.`:hasProbe?`${probe!.states.length}개 화면 상태를 직접 열어보고, ${probe!.transitions.filter(t=>t.status==='changed').length}개 화면 전환을 확인했어요.`:web?(coverage?`발견한 ${coverage.pages.length}개 페이지 중 ${coverage.checked}개에서 문서 구조를 읽었어요.`:source?.exploration?'시작 화면을 연결했어요. 아래에서 구조 탐색 진행 상황과 저장한 결과를 확인하세요.':'시작 화면을 확인했어요. 구조 탐색을 시작하면 메뉴와 연결된 화면도 살펴봅니다.'):`등록한 ${study.screens.length}개 시안의 문구와 이동 연결을 확인하세요.`;
 let content='';
 if(tab==='pages'&&snapshotMode){
  const total=Math.max(1,Math.ceil(capturedPages.length/PAGE_SIZE)),page=Math.max(0,Math.min(selection.page||0,total-1));
  const pending=coverage?.pages.filter(p=>p.state==='pending')||[];
  content=`${capturedPages.length?`<div class="pf-state-grid snapshot-grid">${capturedPages.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map((p,i)=>`<article class="pf-state-card"><button type="button" class="pf-thumb snapshot-image" data-snapshot-url="${esc(p.url)}" aria-label="${esc(p.label)} 화면 크게 보기" ${raster(p.image)?'':'disabled'}>${raster(p.image)?`<img src="${esc(p.image)}" alt="연결된 페이지 캡처 · ${esc(p.label)}" loading="lazy"><span>크게 보기 ↗</span>`:`<span>${p.state==='error'?'접근하지 못한 화면':'캡처를 저장하지 못했어요'}</span>`}</button><div><span class="pf-state-number">${String(page*PAGE_SIZE+i+1).padStart(2,'0')} · ${p.state==='loaded'?p.capture_ready===false?'로딩 중 캡처':'구조 확인':'접근 실패'}</span><h3>${esc(p.label)}</h3><code>${esc(p.url)}</code></div></article>`).join('')}</div>`:'<p class="sr-panel-note" role="status">연결된 주소의 화면 이미지를 가져오고 있어요.</p>'}${total>1?`<nav class="sr-pagination" aria-label="수집한 화면 이미지 목록"><span>${capturedPages.length}개 중 ${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE,capturedPages.length)}</span><div><button type="button" data-recognition-page="${page-1}" ${page===0?'disabled':''}>← 이전</button><span>${page+1} / ${total}</span><button type="button" data-recognition-page="${page+1}" ${page+1===total?'disabled':''}>다음 →</button></div></nav>`:''}${pending.length?`<details class="ri-section"><summary>아직 수집하지 않은 주소 <span>${pending.length}개</span></summary><p class="ri-note">수집된 이미지로 진행하거나 위에서 더 수집할 수 있어요.</p><ul class="ri-files">${pending.slice(0,30).map(p=>`<li>${esc(p.label)} · ${esc(p.url)}</li>`).join('')}${pending.length>30?`<li>외 ${pending.length-30}개</li>`:''}</ul></details>`:''}`;
 }else if(tab==='pages'&&hasProbe){
  const states=probe!.states,total=Math.max(1,Math.ceil(states.length/PAGE_SIZE));
  const selectedIndex=selection.stateId?states.findIndex(s=>s.id===selection.stateId):-1;
  const page=selectedIndex>=0?Math.floor(selectedIndex/PAGE_SIZE):Math.max(0,Math.min(selection.page||0,total-1));
  const allMenus=probe!.navigation||[],menus=allMenus.some(n=>n.kind==='global')?allMenus.filter(n=>n.kind==='global'):allMenus;
  const visitedMenus=menus.filter(n=>n.status==='visited'&&n.state_id);
  const subMenus=allMenus.some(n=>n.kind==='global')?allMenus.filter(n=>n.kind==='section'):[];
  const menuReview=menus.length?`<section class="pf-menu-review" aria-label="주요 메뉴 확인 범위"><header><div><h3>주요 메뉴를 어디까지 살펴봤나요?</h3><p>발견한 메뉴 기준입니다. 이름을 누르면 실제로 들어간 장면으로 이동해요.</p></div><span>${visitedMenus.length} / ${menus.length}개 메뉴 확인</span></header><div class="pf-menu-items" role="group" aria-label="메뉴별 탐색 기록">${menus.map(n=>`<button type="button" data-recognition-state="${esc(n.state_id||'')}" aria-pressed="${Boolean(n.state_id&&selection.stateId===n.state_id)}" ${n.status==='visited'&&n.state_id?'':'disabled'}><strong>${esc(n.label)}</strong><span>${n.status==='visited'&&n.state_id?'확인함':n.status==='unconfirmed'?'결과 미확인':'아직 미확인'}</span></button>`).join('')}</div>${subMenus.length?`<details class="pf-secondary-menus"><summary>하위 메뉴·선택 영역 <span>${subMenus.filter(n=>n.status==='visited').length} / ${subMenus.length}개 확인</span></summary><div class="pf-menu-items">${subMenus.map(n=>`<button type="button" data-recognition-state="${esc(n.state_id||'')}" aria-pressed="${Boolean(n.state_id&&selection.stateId===n.state_id)}" ${n.status==='visited'&&n.state_id?'':'disabled'}><strong>${esc(n.parent?n.parent+' / '+n.label:n.label)}</strong><span>${n.status==='visited'&&n.state_id?'확인함':'미확인'}</span></button>`).join('')}</div></details>`:''}</section>`:'';
  const route=[...states].sort((a,b)=>b.path.length-a.path.length)[0];
  const compactRoute:{label:string;count:number}[]=[];for(const label of route?.path||[]){const last=compactRoute.at(-1);if(last?.label===label)last.count++;else compactRoute.push({label,count:1});}
  const statusName={changed:'다음 화면 확인',unchanged:'표시 변화 없음',blocked:'요청 제한',unconfirmed:'결과 미확인',unreplayed:'경로 재현 안 됨'};
  content=`<div class="pf-summary"><div><strong>버튼을 눌러 살펴본 기록</strong><p>사전 탐색이 실제로 연 화면이에요. 페르소나의 사용성 평가와 인터뷰는 다음 단계에서 진행합니다.</p></div><span>${probe!.limited?'일부 경로 미확인':'준비한 범위 탐색 종료'}</span></div>${menuReview}${route?.path.length?`<div class="pf-route"><span>확인한 경로 예시</span><div><b>시작 화면</b>${compactRoute.map(step=>`<i>→</i><b>${esc(step.label)}${step.count>1?` × ${step.count}`:''}</b>`).join('')}</div></div>`:''}<div class="pf-state-grid">${states.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map((s,i)=>`<article class="pf-state-card ${selection.stateId===s.id?'pf-selected':''}" data-preflight-state="${esc(s.id)}" tabindex="-1"><div class="pf-thumb">${raster(s.image)?`<img src="${esc(s.image)}" alt="사전 탐색 중 실제 캡처 · ${esc(s.label)}" loading="lazy">`:'<span>캡처 없음 · 관찰 기록 확인</span>'}</div><div><span class="pf-state-number">${String(page*PAGE_SIZE+i+1).padStart(2,'0')} · ${s.path.length?'화면 전환 확인':'시작 화면'}</span><h3>${esc(s.label)}</h3><p>${s.path.length?`“${esc(s.path.at(-1))}” 선택 후`:'연결한 주소에서 처음 열린 화면'}</p><details><summary>화면에서 읽은 내용</summary><p>${esc(s.excerpt)}</p></details></div></article>`).join('')}</div>${total>1?`<nav class="sr-pagination" aria-label="사전 탐색 화면 목록"><span>${states.length}개 중 ${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE,states.length)}</span><div><button type="button" data-recognition-page="${page-1}" ${page===0?'disabled':''}>← 이전</button><span>${page+1} / ${total}</span><button type="button" data-recognition-page="${page+1}" ${page+1===total?'disabled':''}>다음 →</button></div></nav>`:''}<details class="pf-transition-list"><summary>시도한 경로와 결과 <span>${probe!.transitions.length}개</span></summary><ul>${probe!.transitions.map(t=>`<li><div><strong>${esc(t.action.split('\n')[0])}</strong><small>${t.path.map(v=>esc(v)).join(' → ')}</small></div><span>${statusName[t.status]}</span></li>`).join('')}</ul><p class="sr-panel-note">같은 분기의 다른 경로를 확인하기 위해 시작 상태를 복원하고 다시 누를 수 있어요. 화면 변화가 없었다는 기록만으로 버튼 오류라고 판단하지 않습니다. 합성 값으로 입력을 채웠으며 실제 계정으로 로그인하지 않았습니다.</p></details>`;
 }else if(tab==='pages'){
  const pages=coverage?.pages||(!web?study.screens.map(s=>({url:s.id,label:s.label,state:'registered',issues:[]})): [{url:screen.url||source?.url||source?.entry||'',label:screen.label,state:'loaded',issues:[]}]);
  const total=Math.max(1,Math.ceil(pages.length/PAGE_SIZE)),page=Math.max(0,Math.min(selection.page||0,total-1));
  content=`<div class="sr-page-list" role="table" aria-label="확인한 페이지 목록"><div class="sr-page-head" role="row"><span role="columnheader">${web?'페이지':'등록 시안'}</span><span role="columnheader">연결 확인</span></div>${pages.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE).map((p,i)=>`<div class="sr-page-row" role="row"><div role="cell"><span class="sr-page-number">${String(page*PAGE_SIZE+i+1).padStart(2,'0')}</span><div><strong>${esc(p.label)}</strong><code>${esc(p.url)}</code></div></div><span role="cell" class="sr-page-badge ${p.state==='loaded'||p.state==='registered'?'':'is-unread'}">${p.state==='loaded'?'구조 읽음':p.state==='registered'?'사용자 등록':p.state==='error'?'열지 못함':'아직 읽지 못함'}</span></div>`).join('')}</div>${total>1?`<nav class="sr-pagination" aria-label="페이지 목록 나눠 보기"><span>${pages.length}개 중 ${page*PAGE_SIZE+1}–${Math.min((page+1)*PAGE_SIZE,pages.length)}</span><div><button type="button" data-recognition-page="${page-1}" ${page===0?'disabled':''}>← 이전</button><span>${page+1} / ${total}</span><button type="button" data-recognition-page="${page+1}" ${page+1===total?'disabled':''}>다음 →</button></div></nav>`:''}<p class="sr-panel-note">${web?'문서 구조를 읽은 상태예요. 실제 클릭과 입력은 다음 단계에서 페르소나가 실행합니다.':'사용자가 등록한 자료입니다. 실제 앱에서 동작을 확인한 결과는 아닙니다.'}</p>`;
 }else if(tab==='checks'){
  content=`<div class="sr-check-columns ${hints.length?'':'sr-only-limits'}" style="--sr-check-columns:${Math.max(1,Math.min(3,checks.length))}"><section><h3>${r.attention.length?'확인되지 않은 범위와 연결 참고':'연결은 완료됐어요. 아래는 탐색 참고 사항입니다.'} <span>${checks.length}</span></h3>${checks.length?`<div class="sr-check-list">${checks.map(c=>`<article class="sr-check-item ${c.level==='note'?'sr-check-note':''}"><h4>${esc(c.title)}</h4><p>${esc(c.text)}</p><small>${esc(c.action)}</small></article>`).join('')}</div>`:'<div class="sr-clear-note">현재 연결에서 별도의 인식 제한은 보고되지 않았어요. 원본 화면과 미리보기가 같은지 확인해 주세요.</div>'}</section>${hints.length?`<section><h3>페이지에서 발견한 확인 항목 <span>${hints.length}</span></h3><p class="sr-panel-note">문서에서 자동으로 찾은 확인 제안이에요. 실제 사용성 문제로 확정한 결과는 아닙니다.</p>${hints.length?`<ul class="sr-hint-list">${hints.slice(0,6).map(h=>`<li><strong>${esc(h.label)}${h.count>1?` · ${h.count}개`:''}</strong><span>${esc(h.page)}</span></li>`).join('')}</ul>${hints.length>6?`<details class="sr-more-hints"><summary>나머지 ${hints.length-6}개 확인 항목 보기</summary><ul class="sr-hint-list">${hints.slice(6).map(h=>`<li><strong>${esc(h.label)}</strong><span>${esc(h.page)}</span></li>`).join('')}</ul></details>`:''}`:'<div class="sr-clear-note">이번 구조 조사에서 별도 항목을 찾지 못했어요. 모든 버튼이 정상 동작한다는 의미는 아닙니다.</div>'}</section>`:''}</div>`;
 }else{
  const kind=(e:ObservedScreen['elements'][number])=>e.navigation?'메뉴':e.role==='tab'?'탭':e.kind==='summary'?'펼치기':e.href?'링크':e.kind==='select'?'선택':e.kind==='input'||e.kind==='textarea'?'입력':e.kind==='button'?'버튼':'요소';
  const inputCount=elements.filter(e=>['input','textarea','select'].includes(e.kind||'')).length;
  const capture=meta?.captured_at?new Date(meta.captured_at):null;
  const when=capture&&!Number.isNaN(capture.getTime())?capture.toLocaleString('ko-KR'):'';
  content=`<div class="sr-structure-intro"><div><strong>${meta?.element_count??elements.length}<small>발견한 조작 요소</small></strong><strong>${elements.length}<small>이번에 읽은 요소</small></strong><strong>${inputCount}<small>읽힌 입력·선택</small></strong></div><p>${meta?.elements_truncated?`전체 ${meta.element_count}개 중 ${elements.length}개를 읽었어요. 이 목록에 없는 요소는 현재 행동 판단에 전달되지 않습니다.`:'시작 화면에서 읽은 요소입니다. 다른 페이지의 전체 요소 수를 합친 값이 아닙니다.'}${when?` 연결 시각: ${esc(when)}.`:''}</p></div>
  <div class="sr-technical-grid"><details class="ri-section"><summary>메뉴와 화면 문구 <span>시작 화면</span></summary>${meta?.landmarks.length?`<div class="ri-regions">${meta.landmarks.map(l=>`<span>${esc(roleName[l.role]||l.role)}${l.label?` · ${esc(l.label)}`:''}</span>`).join('')}</div>`:''}${meta?.headings.length?`<ul class="ri-headings">${meta.headings.map(h=>`<li>${esc(h.text||'제목 없음')}</li>`).join('')}</ul>`:`<p class="ri-excerpt">${esc(screen.description?.slice(0,700)||'등록된 설명이 없습니다.')}</p>`}${!web?'<p class="ri-note">등록한 설명과 연결입니다. 이미지에서 구조를 자동 추론한 결과가 아닙니다.</p>':''}</details>
  <details class="ri-section"><summary>버튼과 입력란 <span>${elements.length}개 읽음</span></summary><ul class="ri-elements">${elements.map(e=>`<li><span>${kind(e)}</span><strong>${esc(e.text)}</strong></li>`).join('')||'<li>읽어온 요소가 없습니다.</li>'}</ul></details>
  <details class="ri-section"><summary>시작 화면의 이동 링크 <span>${links.length}개</span></summary><p class="ri-note">링크가 있다는 것과 도착 페이지를 읽었다는 것은 달라요. 도착 페이지 상태는 페이지 목록에서 확인하세요.</p><ul class="ri-links">${links.map(e=>`<li><strong>${esc(e.text)}</strong><code>${esc(web?e.href:study.screens.find(s=>s.id===e.to)?.label||e.to)}</code></li>`).join('')||'<li>명시적인 이동 링크를 찾지 못했어요.</li>'}</ul></details>
  ${r.technicalHints.length?`<details class="ri-section"><summary>문서 작성 방식 참고 <span>${r.technicalHints.length}개</span></summary><p class="ri-note">제목 태그 구성에 대한 참고 사항입니다. 화면 전환이나 사용성이 실패했다는 뜻은 아닙니다.</p><ul class="ri-files">${r.technicalHints.map(h=>`<li>${esc(h.page)} · 대표 제목 태그(H1) 없음</li>`).join('')}</ul></details>`:''}
  ${source?.site_map?`<details class="ri-section"><summary>연결된 주소 목록 <span>${source.site_map.pages.length}개</span></summary><ul class="ri-files">${source.site_map.pages.map(p=>`<li>${esc(p.label)} · ${esc(p.url)}</li>`).join('')}</ul></details>`:''}
  ${meta?.html_documents.length?`<details class="ri-section"><summary>업로드한 HTML 파일 <span>${meta.html_documents.length}개</span></summary><ul class="ri-files">${meta.html_documents.map(path=>`<li>${esc(path)}</li>`).join('')}</ul></details>`:''}</div>`;
 }
 return `<div class="sr-root"><header class="sr-heading"><div><span class="wf-eyebrow">CONNECTION REVIEW</span><h2>${snapshotMode?'연결한 화면 이미지':hasProbe?'먼저 살펴본 화면과 흐름':'어디까지 연결됐는지 확인하세요.'}</h2><p>${esc(summary)}</p></div><span class="sr-scope-label">${partial?'추가 확인 필요':snapshotMode?'구조·이미지 수집':hasProbe?'탐색 기록':web?'시작 화면 연결됨':'등록 자료 확인'}</span></header><div id="explorationJob" tabindex="-1">${explorationMarkup(study)}</div><nav class="sr-tabs" role="tablist" aria-label="연결 확인 항목">${tabs.map(([id,label,n])=>`<button type="button" role="tab" id="sr-tab-${id}" data-recognition-tab="${id}" aria-selected="${tab===id}" aria-controls="sr-panel" tabindex="${tab===id?0:-1}">${label}${id!=='structure'?`<span>${n}</span>`:''}</button>`).join('')}</nav><div class="sr-panel" id="sr-panel" role="tabpanel" aria-labelledby="sr-tab-${tab}" tabindex="0">${content}</div><footer class="sr-footer">${snapshotMode?'링크로 발견한 같은 사이트의 화면 이미지를 수집합니다. 로그인 뒤 화면이나 버튼으로만 열리는 상태는 실제 실행 단계에서 확인합니다.':web?'연결 범위는 같은 사이트에서 발견한 페이지 기준입니다. 로그인 뒤 화면·다른 사이트·탐색 한도를 넘은 경로는 남아 있을 수 있어요. 사전 탐색 결과는 실제 페르소나 경험과 구분합니다.':'등록된 시안과 문구를 표시합니다. 설치 앱의 동작이나 이미지 속 구조를 자동으로 검증한 결과가 아닙니다.'}${coverage?.map.excluded_count?` 대상 밖 링크 ${coverage.map.excluded_count}개는 제외됐어요.`:''}${state.phase==='error'?' 현재 내용은 이전에 성공한 연결 자료입니다.':''}</footer></div>`;
}
