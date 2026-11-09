import {executionState} from './ExecutionState';
import { pageKey, siteMode, siteCoverage, siteCoverageMarkup } from './SiteCoverage';
import { studyTitle } from '../studio/model';
import { DEMO, personaId } from '../studio/model';
import type { Study, Result } from '../studio/model';
import { analyzeReport, observationBasis, checkHypothesis, dropLabel, outcome, outcomeLabel, RECORD_QUESTIONS, recordAnswer, screenTitle, sourceTitle } from './ReportModel';
import { downloadReport } from './ReportExport';
import './report.css';
import { printReport } from './ReportPrint';
import { portraitMarkup, displayAttributes } from './DisplayPersona';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
type Tab = 'overview' | 'records' | 'coverage' | 'interview';
type Message = {question:string; answer:string;mode?:'records'|'llm';evidence?:{log_id:number;screen_id:string;screen_label:string;quote?:string|null}[]};
export interface ReportOptions {
  independentInterview?:boolean;
  compact?:boolean;
  loadInterview?: (id:number)=>Promise<Message[] | {messages:Message[];llm_allowed:boolean}>;
  canUseLlm?: () => boolean;
  onTabChange?: (tab:Tab)=>void;
  askInterview?: (id:number,question:string,mode?:'records'|'llm')=>Promise<Message>;
  onReplay?: () => void;
  onNext?: () => void;
  canCreateNext?: () => boolean;
  nextLabel?: string;
  chats?: Record<string,Message[]>;
  onSelectPersona?: (id:number) => void;
  onChats?: (chats:Record<string,Message[]>) => void;
}
let instance = 0;
export function mountReport(host: HTMLElement, initial: Study, options: ReportOptions = {}) {
  const uid = `report-${++instance}`;
  let study = initial, model = analyzeReport(study), tab:Tab = 'overview';
  let finding = 0, person = model.findings[0]?.records[0]?.id || model.records[0]?.id || study.personas[0]?.id || 0;
  let screen = '', eventIndex = -1, filter = 'all';
  let findingPage=0,recordsPage=0,coveragePage=0,detailOpen=false;
  let chats:Record<string,Message[]> = options.chats || {}, draft:Record<string,string> = {};
  let identity=`${initial.id}:${initial.runs?.act||0}`,epoch=0,loadRequest=0,loading=0,asking=0,errorPerson=0,errorText='';
  const loaded=new Set<number>();
  const llmAllowed=new Map<number,boolean>();
  let interviewMode:'records'|'llm'='records';
  const allowsLlm=()=>Boolean(options.canUseLlm?.() && llmAllowed.get(person));
  const hasRecord=()=>Boolean(result()?.act);
  const result = () => study.results.find(r=>r.id===person);
  function resetEvidence() {
    const r = result(); screen = r?.act?.end.screen || r?.act?.path.at(-1) || study.screens[0]?.id || '';
    eventIndex = r?.act ? r.act.events.map(e=>e.screen===screen).lastIndexOf(true) : -1;
  }
  resetEvidence();
  /** AI 호출 없이 규칙으로 탐색한 기록은 실제 AI 페르소나의 판단처럼 보이지 않게 표시한다(서버가 남기는 이유 문장의 머리말로 구분). */
  const ruleBased = () => study.results.some(r => r.act?.events.some(e => e.reason?.startsWith('규칙 기반 탐색')));
  const RULE_NOTE = '이 기록은 AI 호출 없이 규칙으로 탐색한 체험용입니다. 눌러 볼 요소를 규칙으로 고른 것이라 실제 AI 페르소나의 판단이나 실제 사용자 반응이 아닙니다.';
  const baseNote = () => study.reportSource === 'local-demo' ? '실제 로컬 DB와 API 연결을 확인하는 가상 예시입니다. 원본 카드나 새 AI 추론을 사용하지 않습니다.' : study.reportSource === 'ui-mock' ? '화면 구성을 확인하기 위해 직접 만든 데이터입니다. 실제 실행 결과가 아닙니다.' : study.source === 'demo' ? '저장된 탐색 기록입니다. 새 AI 실행이나 실제 사용자 조사 결과가 아닙니다.' : study.evidence?.length ? '실제 브라우저의 화면·행동 기록과 AI 페르소나의 설명입니다. 실제 사람의 응답과 구분하세요.' : '화면 설명과 버튼 연결을 탐색한 AI 기록입니다. 실제 사용자 응답과 구분하세요.';
  const sourceNote = () => study.reportSource === 'ui-mock' ? baseNote() : ruleBased() ? RULE_NOTE : baseNote();
  function avatar(id:number, large=false) {
    const p = study.personas.find(p=>p.id===id);
    const at = study.id === DEMO.id ? DEMO.personas.findIndex(x=>x.id===id) : -1;
    return `<span class="rv-avatar ${large?'large':''} ${at>=0?'photo':''}" aria-hidden="true" ${at>=0?`style="background-position:${at*25}% center"`:''}>${at<0?esc((p?personaId(p):'AI').slice(-2)):''}</span>`;
  }
  const badge = (r?:Result) => `<span class="rv-badge ${outcome(r)}">${outcomeLabel(r)}</span>`;
  function personButtons(ids:number[], mode='person') {
    return ids.map(id=>{const p=study.personas.find(p=>p.id===id); return `<button type="button" class="rv-person-chip" data-rv-${mode}="${id}" ${mode==='chat-person'&&!study.results.find(r=>r.id===id)?.act?'disabled title="탐색 종료 기록이 없는 페르소나입니다."':''} data-rv-focus="${mode}-${id}" aria-pressed="${person===id}">${avatar(id)}<span>${esc(p?personaId(p):study.results.find(r=>r.id===id)?.persona_id)}</span></button>`;}).join('');
  }
  // 발견 → 인터뷰 → 발견으로 이어지는 연결
  function askFinding(f?:{records:{id:number}[]}){
    if(!f)return '';const target=f.records.find(r=>r.id===person&&study.results.find(x=>x.id===r.id)?.act)||f.records.find(r=>study.results.find(x=>x.id===r.id)?.act);
    return target?`<button type="button" class="btn solid rv-ask-finding" data-rv-interview="${target.id}" data-rv-focus="ask-finding">이 문제를 겪은 사람에게 물어보기 →</button>`:'';
  }
  function fromFinding(){
    const f=model.findings[finding];if(!f)return '';
    return `<div class="rv-from-finding"><span class="rv-eyebrow">리포트 발견 ${String(finding+1).padStart(2,'0')}</span><strong>${esc(screenTitle(study,f.screen))} · ${esc(dropLabel(f.code))}</strong>${options.independentInterview?'<a class="rv-text-link" href="#report">← 리포트의 이 발견으로 돌아가기</a>':'<button type="button" class="rv-text-link" data-rv-tab="overview" data-rv-focus="back-finding">← 이 발견으로 돌아가기</button>'}</div>`;
  }
  function heading() {
    if(tab==='interview') return `<header class="rv-heading rv-interview-heading"><div><span class="rv-eyebrow">PERSONA INTERVIEW</span><h1 id="${uid}-interview-title">그 선택의 이유를, 더 깊이.</h1><p>${esc(studyTitle(study))} · 같은 페르소나, 같은 탐색 기록</p></div><span class="rv-interview-label">1:1 INTERVIEW</span></header><div class="rv-source"><span>${esc(sourceTitle(study))}</span><p>${sourceNote()}</p></div>`;
    const completion=executionState(study);
    const top = model.findings[0];
    const stopped = top ? model.dropped.filter(r=>r.act.end.screen===top.screen).length : 0;
    const site=Boolean(study.workflow?.source.site_map)&&siteMode(study),c=siteCoverage(study);
    const headline = completion.partial?'일부만 저장된 실행 기록입니다.':!model.records.length ? '탐색 결과를 기다리고 있어요.' : top ? `${screenTitle(study,top.screen)}에서 ${stopped}명의 탐색이 멈췄어요.` : site ? `${c?.visited||0}개 페이지의 사용 경험을 살펴봤어요.` : model.system.length ? '탐색 한도에 도달한 기록을 확인하세요.' : `${model.complete.length}명이 목표 화면에 도달했어요.`;
    return `<header class="rv-heading"><div><span class="rv-eyebrow">${completion.partial?'PARTIAL EXECUTION RECORD':'UX RESEARCH REPORT'} · ${esc(studyTitle(study))}</span><h1>${esc(headline)}</h1><p>${esc(study.task || '등록된 화면의 UI·UX 탐색')}</p></div><div class="rv-toolbar">${options.onReplay?`<button type="button" class="btn" data-rv-replay ${model.records.length?'':'disabled'}>기록 재생 ▷</button>`:''}<details class="rv-export"><summary class="btn">내보내기 ↓</summary><div><button type="button" data-rv-print>인쇄 · PDF로 저장</button><button type="button" data-rv-export="md">보고서 · Markdown</button><button type="button" data-rv-export="json">원본 기록 · JSON</button></div></details></div></header>
    <div class="rv-source"><span>${esc(sourceTitle(study))}</span><p>${sourceNote()}</p></div><div class="rv-completion ${completion.partial?'is-partial':''}" role="status"><strong>${completion.partial?'부분 실행 기록 · 완료되지 않은 인원은 결과에 포함하지 않았어요.':completion.final?'전체 참여자의 종료 기록을 확인했어요.':'저장된 기록의 범위를 확인하세요.'}</strong><span>${completion.finished}/${completion.total}명 종료${completion.missing?` · 결과 없는 인원 ${completion.missing}명`:''}</span></div>
    <div class="rv-metrics" aria-label="탐색 결과 요약"><div><span>확인한 기록</span><strong>${model.records.length}<small> / ${model.total}명</small></strong></div>${site?`<div><span>실제 방문 페이지</span><strong>${c?.visited||0}<small>개</small></strong></div>`:`<div><span>목표 도달</span><strong>${model.complete.length}<small> / ${model.records.length}명</small></strong></div>`}<div><span>탐색 중단</span><strong>${model.dropped.length}<small>명</small></strong></div><div><span>${site?'관찰한 화면 상태':'방문한 화면'}</span><strong>${model.coverage.filter(c=>c.arrived).length}<small>${site?'개':` / ${study.screens.length}개`}</small></strong></div></div>${site?`<p class="rv-collection-note">연결 단계에서 구조를 수집한 ${c?.checked||0}개 페이지와 에이전트가 실제 방문한 ${c?.visited||0}개 페이지는 별도로 집계합니다.</p>`:''}
    ${model.system.length || model.pending.length ? `<div class="rv-partial" role="status">${model.system.length?`탐색 탐색 마침·한도 <b>${model.system.length}명</b> · `:''}${model.pending.length?`결과 없음 <b>${model.pending.length}명</b> · `:''}사용자 이탈과 구분해서 확인하세요.${study.status==='failed'?' 실행 상태: 확인 필요.':study.status==='running'?' 실행 중이며 결과가 추가될 수 있습니다.':''}</div>`:''}`;
  }
  function evidence() {
    const r=result(), p=study.personas.find(p=>p.id===person), s=study.screens.find(s=>s.id===screen);
    const event = r?.act?.events[eventIndex];
    const seen = Boolean(r?.act?.path.includes(screen));
    const capture=study.evidence?.find(e=>e.persona_id===person&&e.screen.id===screen&&(!event||e.turn===event.turn-1))||study.evidence?.find(e=>e.persona_id===person&&e.screen.id===screen);
    return `<section class="rv-evidence" aria-label="선택한 화면과 근거"><header><div><span class="rv-eyebrow">SCREEN & EVIDENCE</span><h2>${esc(screenTitle(study,screen))} <small>${esc(screen)}</small></h2></div><span class="rv-badge ${seen?'':'pending'}">${seen?'방문 기록 있음':'이 페르소나의 방문 기록 없음'}</span></header>
      <div class="rv-evidence-body">${capture?`<figure class="rv-browser-capture"><img src="${esc(capture.image)}" alt="${esc(capture.screen.label)} · 실제 탐색 중 캡처"><figcaption>브라우저 관찰 · ${esc(capture.screen.url||capture.screen.label)} · ${capture.turn+1}번째 화면${capture.turn===0&&capture.screen.exploration?.entry==='assigned'?' · 미방문 영역을 확인하기 위해 배정한 시작점':''}</figcaption></figure>`:`<div class="rv-screen"><div class="rv-screen-bar"><span>${esc(study.product.name)}</span><span>화면 구조</span></div>${s?.image?`<figure class="rv-registered-image"><img src="${esc(s.image)}" alt="${esc(s.label)} 등록 시안"><figcaption>사용자가 등록한 화면 시안 · 실제 앱 캡처 실행이 아닙니다.</figcaption></figure>`:""}<div class="rv-screen-content"><span class="rv-screen-id">${esc(screen)}</span><h3>${esc(s?.label || '등록 화면 없음')}</h3><p>${esc(s?.description || '등록된 화면 설명이 없습니다.')}</p><div class="rv-screen-buttons">${s?.elements.map(e=>`<div class="${event?.action==='click'&&event.target===e.text&&event.screen===screen?'selected':''}"><span>${esc(e.text)}</span><small>${e.to?`→ ${esc(screenTitle(study,e.to))}`:'이동 연결 없음'}</small></div>`).join('') || '<div class="rv-screen-end">등록된 이동 버튼 없음</div>'}</div></div><footer>${s?.image?'등록된 시안과 설명·버튼을 바탕으로 탐색한 화면 흐름입니다.':'등록된 설명·버튼을 정리한 미리보기<br>실제 스크린샷이나 시각 평가 결과가 아닙니다.'}</footer></div>`}
      <div class="rv-quote-panel"><div class="rv-identity">${avatar(person,true)}<div><strong>${esc(p?personaId(p):r?.persona_id || '기록 없음')}</strong><span>${p?`${p.attributes.profile.age}세 · ${esc(p.attributes.profile.job_group)}`:'프로필 정보 없음'}</span></div></div><span class="rv-eyebrow">${event?.reason&&seen?'이 화면에서 남긴 원문':'이 장면의 기록'}</span><blockquote>${!seen?'이 페르소나는 이 화면을 방문하지 않았습니다.':event?.reason?`“${esc(event.reason)}”`:outcome(r)==='system'&&screen===r?.act?.end.screen?'탐색 횟수 한도로 종료됐습니다. 불편을 나타내는 원문은 없습니다.':outcome(r)==='complete'&&screen===r?.act?.end.screen?'목표 화면에 도달했습니다. 이 화면에 대한 별도 발화는 없습니다.':event?.action==='click'?`“${esc(event.target)}” 버튼을 선택했습니다. 선택 이유 문장은 기록되지 않았습니다.`:'이 화면의 추가 발화가 기록되지 않았습니다.'}</blockquote><small>${study.reportSource==='local-demo'?'직접 구성한 로컬 점검 예시':study.reportSource==='ui-mock'?'직접 구성한 UI 예시 문장':'Synthetic User Response · 저장된 원문'}</small>${seen?`<button type="button" class="rv-text-link" data-rv-interview="${person}">이 페르소나와 인터뷰 →</button>`:''}</div></div>
      <div class="rv-timeline"><span>탐색 경로</span><div>${r?.act?.path.map((id,i)=>`<button type="button" data-rv-screen="${esc(id)}" data-rv-focus="screen-${i}" aria-pressed="${screen===id}"><small>${esc(id)}</small>${esc(screenTitle(study,id))}${i<r.act!.path.length-1?' <i>→</i>':''}</button>`).join('') || '<p>아직 경로가 없습니다.</p>'}</div></div>
      ${r?.act?.events.filter(e=>e.screen===screen).length!>1?`<div class="rv-turns">${r!.act!.events.map((e,i)=>e.screen===screen?`<button type="button" data-rv-event="${i}" aria-pressed="${i===eventIndex}">${e.turn}턴 · ${({click:'선택',fill:'입력',scroll:'스크롤',abandon:'중단'})[e.action]}</button>`:'').join('')}</div>`:''}</section>`;
  }
  function coverage() {
    return `<section class="rv-coverage"><div class="rv-section-heading"><div><span class="rv-eyebrow">EXPLORATION COVERAGE</span><h2>어디까지 확인했나요?</h2></div><p>${esc(observationBasis(study))}</p></div><div class="rv-coverage-grid">${model.coverage.map(({screen:s,arrived,stopped,system})=>`<button type="button" data-rv-coverage="${esc(s.id)}" data-rv-focus="coverage-${esc(s.id)}" class="${arrived?'':'unvisited'}"><span>${esc(s.id)} ${s.id===study.goal?'<b>목표</b>':''}</span><strong>${esc(s.label)}</strong><small>${arrived?`${arrived}명 방문`:'미확인'}${stopped?` · ${stopped}명 중단`:''}${system?` · ${system}명 한도 종료`:''}</small></button>`).join('')}</div></section>`;
  }
  function overview() {
    const active=model.findings[finding];
    return `<div class="rv-findings-layout"><section class="rv-findings"><div class="rv-section-heading"><div><span class="rv-eyebrow">KEY FINDINGS</span><h2>먼저 살펴볼 지점 <small>${model.findings.length}</small></h2></div></div><p class="rv-muted">같은 화면·중단 이유로 묶었어요.<br>관련 인원이 많은 순서입니다.</p><div class="rv-issue-list">${model.findings.map((f,i)=>`<button type="button" data-rv-finding="${i}" data-rv-focus="finding-${i}" aria-pressed="${i===finding}"><span class="rv-issue-top"><span>${String(i+1).padStart(2,'0')} / ${esc(screenTitle(study,f.screen))}</span><span>↗</span></span><strong>${esc(dropLabel(f.code))}</strong><span class="rv-issue-count">${f.records.length}<small> / ${model.records.length}명에서 기록</small></span><span class="rv-mini-bar" aria-hidden="true"><i style="width:${model.records.length?f.records.length/model.records.length*100:0}%"></i></span></button>`).join('') || '<div class="rv-empty-small">집계할 사용자 중단 기록이 없습니다. 목표 도달과 탐색 한도를 함께 확인하세요.</div>'}</div>
      ${active?`<div class="rv-related"><span class="rv-eyebrow">관련 페르소나</span><div>${personButtons(active.records.map(r=>r.id))}</div>${askFinding(active)}</div><div class="rv-hypothesis"><span>다음 확인 제안</span><p>${esc(checkHypothesis(active.code))}</p><small>원문에서 이어지는 검토 가설입니다.<br>수정 효과는 별도 테스트로 확인하세요.</small></div>`:''}</section>${evidence()}</div>${study.workflow?.source.site_map?siteCoverageMarkup(study,true):''}${coverage()}`;
  }
  function records() {
    const people=[...study.personas.map(p=>({id:p.id,label:personaId(p),profile:`${p.attributes.profile.age}세 · ${p.attributes.profile.job_group}`})),...study.results.filter(r=>!study.personas.some(p=>p.id===r.id)).map(r=>({id:r.id,label:r.persona_id,profile:'프로필 정보 없음'}))];
    const rows=people.filter(p=>filter==='all'||outcome(study.results.find(r=>r.id===p.id))===filter);
    return `<section class="rv-records"><div class="rv-section-heading"><div><h2>한 사람의 경로를 따라가 보세요.</h2><p>목표 도달, 탐색 중단, 시스템 종료를 구분했습니다.</p></div><label class="rv-filter">종료 상태 <select data-rv-filter><option value="all">전체 ${people.length}명</option>${(['complete','drop','system','pending'] as const).map(k=>`<option value="${k}" ${filter===k?'selected':''}>${({complete:'목표 도달',drop:'탐색 중단',system:'탐색 한도',pending:'결과 없음'})[k]}</option>`).join('')}</select></label></div><div class="rv-record-table"><table><thead><tr><th scope="col">페르소나</th><th scope="col">탐색 경로</th><th scope="col">종료 상태</th><th scope="col"><span class="sr-only">기록 선택</span></th></tr></thead><tbody>${rows.map(p=>{const r=study.results.find(r=>r.id===p.id);return `<tr class="${person===p.id?'selected':''}"><td><div class="rv-record-person">${avatar(p.id)}<div><strong>${esc(p.label)}</strong><small>${esc(p.profile)}</small></div></div></td><td><div class="rv-table-path">${r?.act?.path.map(id=>`<span title="${esc(screenTitle(study,id))}">${esc(id)}</span>`).join('<i>→</i>') || '경로 없음'}</div><small>${r?.act?esc(screenTitle(study,r.act.end.screen)):'결과를 받지 못했습니다.'}</small></td><td>${badge(r)}${outcome(r)==='drop'?`<small>${esc(dropLabel(r?.act?.end.drop_reason))}</small>`:''}</td><td><button type="button" class="rv-text-link" data-rv-record="${p.id}" data-rv-focus="record-${p.id}" aria-label="${esc(p.label)} 기록 보기">기록 보기 ↗</button></td></tr>`;}).join('') || '<tr><td colspan="4">이 상태의 페르소나가 없습니다.</td></tr>'}</tbody></table></div></section><div class="rv-record-evidence">${evidence()}</div>`;
  }
  function interview() {
    const p=study.personas.find(p=>p.id===person), r=result(), thread=chats[person]||[];
    return `<section class="rv-interview"><div class="rv-section-heading"><div><span class="rv-eyebrow">FOLLOW-UP</span><h2>한 사람의 경험에 집중하세요.</h2><p>탐색 당시의 화면과 원문을 바탕으로 질문을 이어갑니다.</p></div><span class="rv-badge">${interviewMode==='llm'&&allowsLlm()?'AI 인터뷰 · 토큰 사용':options.askInterview?'서버 저장 · 기록 기반':'기록 기반 · 데모'}</span></div><div class="rv-interview-layout"><aside class="rv-interview-context"><span class="rv-eyebrow">선택한 페르소나</span><div class="rv-identity">${avatar(person,true)}<div><strong>${esc(p?personaId(p):r?.persona_id||'기록 없음')}</strong><span>${p?`${p.attributes.profile.age}세 · ${esc(p.attributes.profile.job_group)}`:''}</span></div></div>${badge(r)}${fromFinding()}<p>${esc(r?.act?.path.map(id=>screenTitle(study,id)).join(' → ') || '탐색 기록 없음')}</p><button type="button" class="rv-text-link" data-rv-back-evidence>화면과 원문 보기 ↗</button><div class="rv-related"><span class="rv-eyebrow">다른 페르소나</span><div>${personButtons(study.personas.map(p=>p.id),'chat-person')}</div></div>${p?`<details class="rv-profile"><summary>페르소나 카드</summary><p>${esc(p.attributes.card_text)}</p></details>`:''}</aside><div class="rv-conversation" data-rv-conversation-person="${person}"><div class="rv-interview-controls"><label>답변 방식<select data-rv-mode ${asking?'disabled':''}><option value="records" ${interviewMode==='records'?'selected':''}>기록에서 답 찾기</option><option value="llm" ${allowsLlm()?'':'disabled'} ${interviewMode==='llm'&&allowsLlm()?'selected':''}>AI와 대화하기 · 토큰 사용</option></select></label>${thread.length?'<button type="button" class="rv-text-link" data-rv-chat-export>대화 내려받기 ↓</button>':''}</div>${!allowsLlm()?'<p class="rv-mode-note">현재는 저장된 기록으로 답합니다. 새 AI 답변은 이 실행의 모델 전송이 허용된 경우에 선택할 수 있습니다.</p>':''}<div class="rv-chat-intro"><span>대화의 기준</span><p>이 테스트에서 선택한 페르소나가 남긴 기록만 참조합니다. 보지 않은 화면이나 기록에 없는 경험을 만들어 답하지 않습니다.</p></div>${errorPerson===person?`<div class="rv-chat-error" role="alert">${esc(errorText)} <button type="button" class="rv-text-link" data-rv-retry>다시 불러오기</button></div>`:''}${Boolean(loading)&&loading===person?'<p class="rv-chat-loading" role="status">서버에 저장된 문답을 불러오고 있습니다.</p>':''}<div class="rv-messages" aria-live="polite" aria-label="기록 기반 후속 질문">${thread.map(m=>`<article class="rv-question"><span>내 질문</span><p>${esc(m.question)}</p></article><article class="rv-answer"><span>${esc(p?personaId(p):r?.persona_id)} · ${m.mode==='llm'?'로그를 근거로 생성한 AI 답변':'기록에서 찾은 답변'}</span><p>${esc(m.answer)}</p>${m.evidence?.length?`<div class="rv-answer-evidence">${m.evidence.map(ref=>`<button type="button" data-rv-citation="${esc(ref.screen_id)}" title="${esc(ref.quote||'이 화면의 탐색 근거 확인')}">근거 #${ref.log_id} · ${esc(ref.screen_id)} ${esc(ref.screen_label)} ↗</button>`).join('')}</div>`:''}</article>`).join('') || `<div class="rv-chat-empty"><strong>${hasRecord()?'기록에서 궁금했던 점이 있나요?':'탐색 기록이 아직 없습니다.'}</strong><p>${hasRecord()?'아래 질문으로 시작해 보세요.':'탐색을 마친 페르소나를 선택하면 대화를 시작할 수 있습니다.'}</p></div>`}</div><div class="rv-question-chips">${RECORD_QUESTIONS.map((q,i)=>`<button type="button" data-rv-question="${i}" ${asking||!hasRecord()||Boolean(loading)&&loading===person?'disabled':''}>${esc(q)} ↗</button>`).join('')}</div><form data-rv-form><label class="sr-only" for="${uid}-question">이 기록에 질문하기</label><textarea id="${uid}-question" data-rv-input ${asking||!hasRecord()||Boolean(loading)&&loading===person?'disabled':''} maxlength="500" rows="2" placeholder="예: 어느 화면까지 확인했나요?" required>${esc(draft[person]||'')}</textarea><button type="submit" class="btn solid" ${asking||!hasRecord()||Boolean(loading)&&loading===person?'disabled':''}>${Boolean(asking)&&asking===person?'답변을 기다리는 중…':interviewMode==='llm'&&allowsLlm()?'질문 보내기 ↑':'기록에서 답 찾기 ↑'}</button></form><p class="rv-chat-foot">${!hasRecord()?'이 페르소나의 탐색 기록이 있어야 인터뷰를 시작할 수 있습니다.':interviewMode==='llm'&&allowsLlm()?'카드와 해당 탐색 기록, 최근 문답을 모델에 보내 새 답변을 생성합니다. 토큰을 사용하며 원본 기록과 구분됩니다.':options.askInterview?'문답은 이 계정의 해당 실행에 서버 저장됩니다. 새 LLM 호출은 없습니다.':'새 LLM 호출 없이 기록을 조회합니다. 원본 결과는 바뀌지 않습니다.'}</p></div></div></section>`;
  }

  const excerpt=(text:string,max=190)=>text.length>max?text.slice(0,max)+'…':text;
  const reportTabs=():Tab[]=>options.compact?(options.independentInterview?['overview','records','coverage']:['overview','records','coverage','interview']):options.independentInterview?['overview','records']:['overview','records','interview'];
  function pager(kind:string,page:number,total:number,size:number){
    const count=Math.max(1,Math.ceil(total/size));
    return `<nav class="rv-pager" aria-label="${kind==='findings'?'발견':kind==='records'?'페르소나':'페이지 목록'} 페이지"><span>${total?`${page*size+1}–${Math.min((page+1)*size,total)} / ${total}`:'0개'}</span><button type="button" data-rv-page="${kind}:${page-1}" ${page<=0?'disabled':''} aria-label="이전 목록">←</button><button type="button" data-rv-page="${kind}:${page+1}" ${page>=count-1?'disabled':''} aria-label="다음 목록">→</button></nav>`;
  }
  function compactHeading(){
    const c=executionState(study),coverage=siteCoverage(study),chat=tab==='interview';
    return `<header class="rv-heading"><div><span class="rv-eyebrow">${chat?'PERSONA INTERVIEW':c.partial?'PARTIAL EXECUTION RECORD':'UX RESEARCH REPORT'}</span><h1 id="${uid}-interview-title">${chat?'1대1 인터뷰':esc(studyTitle(study))}</h1>${chat?`<p>${esc(studyTitle(study))}</p>`:''}</div><div class="rv-toolbar">${!chat&&options.onReplay?'<button type="button" class="btn" data-rv-replay>기록 재생 ▷</button>':''}${!chat?'<details class="rv-export"><summary class="btn">내보내기 ↓</summary><div><button type="button" data-rv-print>인쇄 · PDF로 저장</button><button type="button" data-rv-export="md">보고서 · Markdown</button><button type="button" data-rv-export="json">원본 기록 · JSON</button></div></details>':''}${!chat&&options.onNext?`<button type="button" class="btn" data-rv-next ${options.canCreateNext?.()===false?'disabled':''}>수정 회차 만들기 +</button>`:''}</div></header>
    <div class="rv-compact-meta"><span>${esc(sourceTitle(study))}</span><span>AI 페르소나 · 실제 사용자 응답과 구분</span><details><summary>해석 범위</summary><p>${sourceNote()} 체류 시간·시선·만족도는 측정하지 않았습니다.${coverage?` 구조 수집 ${coverage.checked}개와 실제 방문 ${coverage.visited}개는 별도 집계입니다. 발견한 목록 기준이며 사이트 전체 대비 비율이 아닙니다.`:''}</p></details></div>
    ${!chat?`<p class="rp-conclusion">${esc(model.findings[0]?`${screenTitle(study,model.findings[0].screen)}에서 ${model.findings[0].records.length}명이 멈췄어요${model.findings.length>1?` 외 ${model.findings.length-1}곳`:''}.`:c.partial?'일부만 저장된 기록이에요.':model.system.length?'탐색 한도까지 살펴본 기록이 있어요.':'사용자가 멈춘 곳은 확인되지 않았어요.')}</p>`:''}
    ${!chat?`<div class="rv-summary-line" role="status"><strong class="${c.partial?'is-partial':''}">${c.partial?'부분 실행 기록':c.final?'탐색 종료':'저장된 기록'}</strong><span>종료 <b>${c.finished}/${c.total}명</b>${c.total?`<small>${Math.round(c.finished/c.total*100)}%</small>`:''}</span><span>사용자 중단 <b>${model.dropped.length}명</b></span><span>${coverage?'방문 페이지':'방문 화면'} <b>${coverage?.visited??model.coverage.filter(x=>x.arrived).length}개</b></span>${model.system.length?`<span>탐색 마침·한도 <b>${model.system.length}명</b></span>`:''}${c.missing?`<span class="rv-missing">결과 없음 <b>${c.missing}명</b></span>`:''}</div>`:''}`;
  }
  function compactEvidence(){
    const r=result(),p=study.personas.find(p=>p.id===person),event=r?.act?.events[eventIndex],seen=Boolean(r?.act?.path.includes(screen));
    const capture=study.evidence?.find(e=>e.persona_id===person&&e.screen.id===screen&&(!event||e.turn===event.turn-1))||study.evidence?.find(e=>e.persona_id===person&&e.screen.id===screen);
    const registered=study.screens.find(s=>s.id===screen);
    const quote=!seen?'이 페르소나의 방문 기록이 없습니다.':event?.reason|| (outcome(r)==='system'?'탐색 횟수 한도로 종료됐습니다. 사용자 이탈로 집계하지 않습니다.':outcome(r)==='complete'?'목표 화면에 도달했습니다. 별도의 판단 문장은 기록되지 않았습니다.':'이 장면의 판단 문장은 기록되지 않았습니다.');
    return `<section class="rv-selected-evidence" aria-label="선택한 화면과 근거"><header><h2>${esc(screenTitle(study,screen))}</h2>${badge(r)}</header><button type="button" class="rv-compact-capture rv-screen-open" data-rv-detail aria-label="선택한 근거 화면 확대">${capture?`<img src="${esc(capture.image)}" alt="${esc(capture.screen.label)} · 실제 탐색 캡처">`:registered?.image?`<img src="${esc(registered.image)}" alt="${esc(registered.label)} · 등록 시안">`:`<div class="rv-compact-screen"><span>화면 설명 기반 기록</span><h3>${esc(registered?.label||'화면 기록 없음')}</h3><p>${esc(excerpt(registered?.description||'선택한 기록에서 화면을 확인하세요.',180))}</p></div>`}<span class="rv-screen-zoom">화면 확대 ↗</span></button><div class="rv-compact-quote"><div class="rv-identity">${avatar(person)}<div><strong>${esc(p?personaId(p):r?.persona_id||'기록 없음')}</strong><span>${p?`${p.attributes.profile.age}세 · ${esc(p.attributes.profile.job_group)}`:''}</span></div><span class="rv-excerpt-label">${event?.reason?'판단 발췌':'종료 기록'}</span></div><blockquote>${esc(excerpt(quote))}</blockquote><div class="rv-evidence-actions"><button type="button" class="rv-text-link" data-rv-detail>원문·경로 보기 ↗</button><button type="button" class="rv-text-link" data-rv-interview="${person}" ${r?.act?'':'disabled'}>1대1 인터뷰 →</button></div></div></section>`;
  }
  // 인사이트: 문제를 표로 훑고, 고른 문제의 근거(화면·말·사람)를 오른쪽 한 장에 보여 준다
  function impact(n:number){const share=model.records.length?n/model.records.length:0;return share>=.25?['높음','#d03b3b']:share>=.1?['중간','#c47a12']:['낮음','#8a867e'];}
  function who(r:{id:number;persona_id:string}){const p=study.personas.find(x=>x.id===r.id);if(!p)return esc(r.persona_id);const a=displayAttributes(p.attributes).profile;return `${esc(personaId(p))} · ${p.attributes.profile.age}세${a.sex?` · ${esc(a.sex)}`:''} · ${esc(p.attributes.profile.job_group)}${a.region?` · ${esc(a.region)}`:''}`;}
  function detailCard(f:(typeof model.findings)[number],i:number){
    const records=f.records as unknown as {id:number;persona_id:string;act:{events:{screen:string;reason?:string|null}[]}}[];
    const lead=records.find(r=>r.id===person)||records[0],shot=study.evidence?.find(e=>e.persona_id===lead.id&&e.screen.id===f.screen)||study.evidence?.find(e=>e.screen.id===f.screen);
    const registered=study.screens.find(s=>s.id===f.screen),image=shot?.image||registered?.image;
    const ev=[...lead.act.events].reverse().find(e=>e.screen===f.screen&&e.reason)||[...lead.act.events].reverse().find(e=>e.reason);
    const others=records.slice(0,8).map(r=>{const p=study.personas.find(x=>x.id===r.id);return `<button type="button" class="rp-chip" data-rv-person="${r.id}" data-rv-focus="rp-person-${r.id}" aria-pressed="${r.id===lead.id}" title="${who(r).replace(/<[^>]*>/g,'')}">${p?portraitMarkup(displayAttributes(p.attributes),'rp-chip-img'):''}<span>${esc(p?personaId(p):r.persona_id)}</span></button>`;}).join('');
    return `<aside class="rp-card" id="${uid}-issue-${i}" aria-label="선택한 문제의 근거"><span class="rp-eyebrow">선택한 문제 ${String(i+1).padStart(2,'0')}</span><h3>${esc(screenTitle(study,f.screen))}에서 ${records.length}명이 멈췄어요</h3><p class="rp-why"><span>이유</span>${esc(dropLabel(f.code))}</p>
      <div class="rp-shot">${image?`<img src="${esc(image)}" alt="${esc(screenTitle(study,f.screen))} 화면">`:'<span>저장된 캡처가 없어요</span>'}</div>
      ${ev?.reason?`<blockquote>“${esc(ev.reason)}”</blockquote>`:'<blockquote class="is-empty">이 화면에서 남긴 발화가 기록되지 않았어요.</blockquote>'}
      <p class="rp-who">${who(lead)}</p>${records.length>1?`<div class="rp-chips" aria-label="같은 곳에서 멈춘 사람">${others}</div>`:''}
      <div class="rp-fix"><b>이렇게 확인해 보세요</b><p>${esc(checkHypothesis(f.code))}</p></div>
      <div class="rp-actions"><button type="button" class="btn solid" data-rv-interview="${lead.id}">이 사람에게 물어보기 →</button><button type="button" class="btn" data-rv-record="${lead.id}">근거 보기</button></div></aside>`;
  }
  function compactOverview(){
    const empty=`<div class="rv-empty-small"><strong>사용자 중단 기록 없음</strong><p>${model.system.length?'탐색 한도로 끝난 기록이 있어요.':'저장된 종료 기록에서 중단은 확인되지 않았어요.'} UI·UX 문제 없음으로 해석하지 않습니다.</p></div>`;
    const revisionNo=study.workflow?.revision||1;
    const compare=revisionNo>1?`<a class="rp-compare" href="#compare"><b>이전 회차와 비교</b><span>같은 문제가 반복되는지, 사라졌는지, 새로 생겼는지 확인하세요 →</span></a>`:'';
    const active=Math.min(Math.max(finding,0),model.findings.length-1),total=Math.max(1,model.total);
    const rows=model.findings.map((f,i)=>{const [lv,color]=impact(f.records.length);return `<button type="button" class="rp-row" data-rv-finding="${i}" data-rv-focus="finding-${i}" aria-pressed="${i===active}"><span class="rp-no">${String(i+1).padStart(2,'0')}</span><span class="rp-what"><strong>${esc(screenTitle(study,f.screen))}에서 ${f.records.length}명이 멈췄어요</strong><small>${esc(dropLabel(f.code))}</small></span><span class="rp-sev" style="--s:${color}">${lv}</span><span class="rp-bar" aria-hidden="true"><i style="width:${Math.max(4,Math.round(f.records.length/total*100))}%"></i></span><b class="rp-n">${f.records.length}</b></button>`;}).join('');
    return `<div class="rp-wrap">${rows?`<div class="rp-filterbar"><span>문제 ${model.findings.length}개</span><em>영향받은 사람 많은 순</em></div><div class="rp-layout"><section class="rp-table" aria-label="문제 목록"><div class="rp-row rp-head" aria-hidden="true"><span></span><span>문제</span><span>영향 규모</span><span>영향받은 사람</span><span>인원</span></div>${rows}</section>${detailCard(model.findings[active],active)}</div>`:empty}${compare}</div>`;
  }
  function compactRecords(){
    const people=[...study.personas.map(p=>({id:p.id,label:personaId(p),profile:`${p.attributes.profile.age}세 · ${p.attributes.profile.job_group}`})),...study.results.filter(r=>!study.personas.some(p=>p.id===r.id)).map(r=>({id:r.id,label:r.persona_id,profile:''}))];
    const rows=people.filter(p=>filter==='all'||outcome(study.results.find(r=>r.id===p.id))===filter);recordsPage=Math.min(recordsPage,Math.max(0,Math.ceil(rows.length/6)-1));
    return `<div class="rv-findings-layout"><section class="rv-record-list"><label class="rv-filter">종료 상태<select data-rv-filter><option value="all">전체 ${people.length}명</option>${(['complete','drop','system','pending'] as const).map(k=>`<option value="${k}" ${filter===k?'selected':''}>${({complete:'목표 도달',drop:'탐색 중단',system:'탐색 한도',pending:'결과 없음'})[k]}</option>`).join('')}</select></label><div class="rv-person-records">${rows.slice(recordsPage*6,recordsPage*6+6).map(p=>`<button type="button" data-rv-record="${p.id}" data-rv-focus="record-${p.id}" aria-pressed="${person===p.id}"><span><strong>${esc(p.label)}</strong><small>${esc(p.profile)}</small></span>${badge(study.results.find(r=>r.id===p.id))}</button>`).join('')||'<p class="rv-muted">이 상태의 기록이 없습니다.</p>'}</div>${pager('records',recordsPage,rows.length,6)}</section>${compactEvidence()}</div>`;
  }
  function compactCoverage(){
    const c=siteCoverage(study),rows=c?c.pages:model.coverage.map(x=>({label:x.screen.label,url:x.screen.id,state:'loaded',visitors:Array.from({length:x.arrived}),screen:x.screen.id}));coveragePage=Math.min(coveragePage,Math.max(0,Math.ceil(rows.length/6)-1));
    return `<section class="rv-compact-coverage"><div class="rv-section-heading"><h2>확인 범위</h2><p>구조 수집과 실제 방문은 다릅니다.</p></div><div class="rv-record-table"><table><thead><tr><th>페이지</th><th>${c?'구조 수집':'등록 상태'}</th><th>실제 방문</th><th><span class="sr-only">근거 보기</span></th></tr></thead><tbody>${rows.slice(coveragePage*6,coveragePage*6+6).map((p,j)=>`<tr><td><strong>${esc(p.label)}</strong><small class="rv-url" title="${esc(p.url)}">${esc(p.url)}</small></td><td>${!c?'등록됨':p.state==='loaded'?'확인':p.state==='error'?'접근 실패':'미확인'}</td><td>${p.visitors.length?`${p.visitors.length}명`:'방문 없음'}</td><td>${p.visitors.length?c?`<button type="button" class="rv-text-link" data-rv-site="${coveragePage*6+j}">근거 보기 ↗</button>`:`<button type="button" class="rv-text-link" data-rv-coverage="${esc(p.url)}">근거 보기 ↗</button>`:''}</td></tr>`).join('')||'<tr><td colspan="4">확인 범위가 없습니다.</td></tr>'}</tbody></table></div>${pager('coverage',coveragePage,rows.length,6)}<p class="rv-muted">${c?.map.limit_reached?'수집 한도에서 멈춘 목록입니다. ':''}발견한 범위 기준이며 사이트 전체를 확인했다는 의미는 아닙니다.${c?.extras.length?` 목록 밖에서 추가로 방문한 주소 ${c.extras.length}개.`:''}</p></section>`;
  }
  // 신분증: 왼쪽에 한 사람의 카드, 오른쪽에 그 사람과의 문답. 답마다 출처(저장된 기록 / AI 생성)를 표시한다.
  const MEter:Record<string,number>={낮음:25,중간:55,높음:85};
  function idCard(){
    const p=study.personas.find(p=>p.id===person),r=result(),a=p?displayAttributes(p.attributes):null,label=p?personaId(p):r?.persona_id||'기록 없음';
    const path=r?.act?.path||[],total=Math.max(path.length,study.screens.length,1),end=r?.act?.end,dropped=end?.result==='drop';
    const segs=Array.from({length:total},(_,i)=>`<i class="${i<path.length?(dropped&&i===path.length-1?'x':''):'o'}"></i>`).join('');
    const last=r?.act?screenTitle(study,r.act.end.screen||path.at(-1)||''):'';
    const trait=(name:string,v:string)=>`<div class="id-trait"><span>${name}</span><i><b style="width:${MEter[v]??0}%"></b></i><em>${esc(v)}</em></div>`;
    return `<aside class="rv-interview-context id-card"><div class="id-top"><span>PERSONA CARD</span><span>${esc(label)}</span></div>
      <label class="rv-person-select">대화할 페르소나<select data-rv-select-person>${study.personas.map(p=>`<option value="${p.id}" ${person===p.id?'selected':''} ${study.results.find(r=>r.id===p.id)?.act?'':'disabled'}>${esc(personaId(p))} · ${p.attributes.profile.age}세 · ${esc(p.attributes.profile.job_group)}</option>`).join('')}</select></label>
      <div class="rv-identity id-who">${a?portraitMarkup(a,'id-portrait'):`<span class="id-portrait persona-no-photo">AI</span>`}<div><strong>${esc(label)}</strong><span>${p?`${p.attributes.profile.age}세${a?.profile.sex?` · ${esc(a.profile.sex)}`:''} · ${esc(p.attributes.profile.job_group)}${a?.profile.region?` · ${esc(a.profile.region)}`:''}`:''}</span></div></div>
      ${a?`<div class="id-traits">${trait('디지털 친숙도',String(a.traits.digital))}${trait('새 기능 친숙도',String(a.traits.novelty))}${trait('개인정보 우려',String(a.traits.privacy))}</div>`:''}
      <div class="id-path" aria-label="탐색 경로"><div class="id-segs">${segs}</div><small>${r?.act?`${esc(screenTitle(study,path[0]||''))} → ${esc(screenTitle(study,path.at(-1)||''))}${dropped?'에서 멈춤':' 도착'} · 기록 ${r.act.events.length}건`:'탐색 기록 없음'}</small></div>
      ${badge(r)}${fromFinding()}
      <div class="rv-interview-last"><span>마지막 화면</span><strong>${esc(last||'탐색 기록 없음')}</strong></div>
      <button type="button" class="rv-text-link" data-rv-detail>화면·원문 보기 ↗</button></aside>`;
  }
  function compactInterview(){
    const p=study.personas.find(p=>p.id===person),r=result(),thread=chats[person]||[],disabled=asking||!hasRecord()||Boolean(loading)&&loading===person;
    const face=p?portraitMarkup(displayAttributes(p.attributes),'id-face'):'';
    const answer=(m:Message)=>{
      const ai=m.mode==='llm';
      const refs=(m.evidence||[]).map(ref=>{const shot=study.evidence?.find(e=>e.persona_id===person&&e.screen.id===ref.screen_id);return `<button type="button" class="id-evc" data-rv-citation="${esc(ref.screen_id)}" title="${esc(ref.quote||'이 화면의 탐색 근거 확인')}">${shot?`<img src="${esc(shot.image)}" alt="">`:''}<span><b>${esc(ref.screen_id)} ${esc(ref.screen_label)}</b><small>근거 #${ref.log_id} · 장면 보기 ▶</small></span></button>`;}).join('');
      return `<article class="rv-question"><span>내 질문</span><p>${esc(m.question)}</p></article><article class="rv-answer ${ai?'is-ai':'is-record'}">${face}<div><span class="id-name">${esc(p?personaId(p):r?.persona_id)}</span><p class="id-text">${esc(m.answer)}</p><div class="id-meta"><span class="id-src ${ai?'ai':'rec'}">${ai?'AI 생성 · 실제 사람의 답변이 아니에요':'저장된 기록 조회'}</span></div>${refs?`<div class="rv-answer-evidence">${refs}</div>`:''}</div></article>`;
    };
    return `<section class="rv-interview rv-interview-layout id-grid">${idCard()}<div class="rv-conversation" data-rv-conversation-person="${person}">${allowsLlm()||thread.length?`<div class="rv-interview-controls">${allowsLlm()?`<label>답변 방식<select data-rv-mode ${asking?'disabled':''}><option value="records" ${interviewMode==='records'?'selected':''}>저장된 기록으로 답하기</option><option value="llm" ${interviewMode==='llm'?'selected':''}>AI와 대화 · 토큰 사용</option></select></label>`:''}${thread.length?'<button type="button" class="rv-text-link" data-rv-chat-export>대화 내려받기 ↓</button>':''}</div>`:''}${interviewMode==='llm'&&allowsLlm()?'<p class="rv-mode-warning">토큰 사용 · 카드·탐색 기록·최근 문답을 모델에 전송해 새 답변을 생성합니다.</p>':''}${errorPerson===person?`<div class="rv-chat-error" role="alert">${esc(errorText)} <button type="button" class="rv-text-link" data-rv-retry>다시 불러오기</button></div>`:''}${loading===person&&loading?'<p class="rv-chat-loading" role="status">문답 불러오는 중…</p>':''}<div class="rv-messages" aria-live="polite" aria-label="페르소나와의 대화">${thread.map(answer).join('')||`<div class="rv-chat-empty"><strong>${hasRecord()?'어떤 선택이 궁금하세요?':'탐색 종료 기록이 없습니다.'}</strong><p>이 사람의 탐색 기록에서 대화를 이어가세요.</p></div>`}</div>${!thread.length?`<div class="rv-question-chips">${RECORD_QUESTIONS.slice(0,2).map((q,i)=>`<button type="button" data-rv-question="${i}" ${disabled?'disabled':''}>${esc(q)}</button>`).join('')}</div>`:''}<form data-rv-form><label class="sr-only" for="${uid}-question">질문</label><textarea id="${uid}-question" data-rv-input ${disabled?'disabled':''} maxlength="500" rows="1" placeholder="이 선택의 이유를 물어보세요" required>${esc(draft[person]||'')}</textarea><button type="submit" class="btn solid" ${disabled?'disabled':''}>${asking===person&&asking?'답변 중…':'보내기 ↑'}</button></form></div></section>`;
  }
  function render(focus?:string) {
    const oldMessages=host.querySelector<HTMLElement>('.rv-messages'),oldPerson=host.querySelector<HTMLElement>('[data-rv-conversation-person]')?.dataset.rvConversationPerson;
    const chatScroll=oldMessages?.scrollTop||0,stickToBottom=!oldMessages||oldMessages.scrollHeight-chatScroll-oldMessages.clientHeight<40;
    const oldFocus=focus || (document.activeElement as HTMLElement)?.dataset?.rvFocus;
    host.innerHTML=`<div class="rv-root ${options.compact?'rv-compact':''}" data-report-tab="${tab}">${options.compact?compactHeading():heading()}<nav class="rv-tabs" role="tablist" aria-label="결과 보기 방식" ${options.independentInterview&&tab==='interview'?'hidden':''}>${reportTabs().map(t=>`<button type="button" role="tab" id="${uid}-tab-${t}" aria-selected="${tab===t}" aria-controls="${uid}-panel" tabindex="${tab===t?0:-1}" data-rv-tab="${t}" data-rv-focus="tab-${t}">${({overview:'문제와 제안',records:'페르소나별 근거',coverage:'확인 범위',interview:'1대1 인터뷰'})[t]}${t==='overview'?` <span>${model.findings.length}</span>`:''}</button>`).join('')}</nav><div id="${uid}-panel" role="tabpanel" aria-labelledby="${options.independentInterview&&tab==='interview'?uid+'-interview-title':uid+'-tab-'+tab}" tabindex="-1">${options.compact?(tab==='overview'?compactOverview():tab==='records'?compactRecords():tab==='coverage'?compactCoverage():compactInterview()):(tab==='overview'?overview():tab==='records'?records():interview())}</div><footer class="rv-footer" ${options.compact?'hidden':''}><div><strong>다음 수정은, 확인한 근거에서.</strong><p>${study.reportSource==='local-demo'?'이 예시는 로컬 DB 연결 점검용입니다.':study.reportSource==='ui-mock'?'이 예시는 UI 목데이터입니다.':'AI 탐색 결과는 실제 사용자 검증을 위한 단서입니다.'} 체류 시간·시선·만족도는 측정하지 않았습니다.</p></div>${options.onNext?`<button type="button" class="btn solid" data-rv-next ${options.canCreateNext?.()===false?'disabled title="현재 실행이 종료되면 수정 회차를 만들 수 있어요."':''}>${esc(options.nextLabel || '수정본 테스트 만들기')} →</button>`:''}</footer>${options.compact&&detailOpen?`<dialog class="rv-detail-dialog" aria-label="화면과 원문 상세"><header><strong>화면과 원문</strong><button type="button" class="btn" data-rv-close-detail>닫기 ×</button></header>${evidence()}</dialog>`:''}</div>`;
    if(options.compact&&tab==='interview'){const messages=host.querySelector<HTMLElement>('.rv-messages');if(messages)messages.scrollTop=oldPerson===String(person)&&!stickToBottom?chatScroll:messages.scrollHeight;}
    if(detailOpen){const dialog=host.querySelector<HTMLDialogElement>('.rv-detail-dialog');dialog?.showModal?.();dialog?.addEventListener('close',()=>{detailOpen=false;host.querySelector<HTMLElement>('[data-rv-detail]')?.focus({preventScroll:true});});}
    if(oldFocus) host.querySelector<HTMLElement>(`[data-rv-focus="${CSS.escape(oldFocus)}"]`)?.focus({preventScroll:true});
  }
  function selectPerson(id:number, nextTab?:Tab) {
    if(!study.personas.some(p=>p.id===id)&&!study.results.some(r=>r.id===id)) return;
    person=id; interviewMode='records'; finding=model.findings.findIndex(f=>f.records.some(r=>r.id===id)); options.onSelectPersona?.(id); if(nextTab) {tab=nextTab; options.onTabChange?.(tab);} resetEvidence(); render(); if(tab==='interview')void loadChats();
  }
  async function loadChats(force=false) {
    if(!options.loadInterview||!person||(!force&&(loaded.has(person)||loading===person)))return;
    const id=person,version=epoch,request=++loadRequest;loading=id;errorPerson=0;render();
    try {const messages=await options.loadInterview(id);if(epoch!==version||request!==loadRequest)return;chats={...chats,[id]:Array.isArray(messages)?messages:messages.messages};llmAllowed.set(id,!Array.isArray(messages)&&messages.llm_allowed);loaded.add(id);}
    catch(error){if(epoch===version&&request===loadRequest){errorPerson=id;errorText=error instanceof Error?error.message:'문답을 불러오지 못했습니다.';}}
    finally{if(epoch===version&&request===loadRequest){loading=0;render();}}
  }
  async function ask(question:string) {
    const text=question.trim().slice(0,500);if(!text||!hasRecord()||asking||Boolean(loading)&&loading===person)return;
    const id=person,version=epoch;errorPerson=0;
    try {
      let answer:Message;
      if(options.askInterview){asking=id;render();answer=await options.askInterview(id,text,interviewMode==='llm'&&allowsLlm()?'llm':'records');if(epoch!==version)return;}
      else answer={question:text,answer:recordAnswer(study,id,text)};
      chats={...chats,[id]:[...(chats[id]||[]),answer].slice(-50)};
      draft[id]='';loaded.add(id);options.onChats?.(chats);
    } catch(error){if(epoch===version){errorPerson=id;errorText=error instanceof Error?error.message:'질문을 저장하지 못했습니다.';}}
    finally {
      if(epoch===version){asking=0;render();const messages=host.querySelector<HTMLElement>('.rv-messages');if(messages)messages.scrollTop=messages.scrollHeight;host.querySelector<HTMLTextAreaElement>('[data-rv-input]')?.focus({preventScroll:true});}
    }
  }
  function click(e:MouseEvent) {
    const b=(e.target as Element).closest<HTMLElement>('button'); if(!b||!host.contains(b)||b.hasAttribute('disabled'))return;
    if(b.hasAttribute('data-rv-detail')){detailOpen=true;render();}
    else if(b.hasAttribute('data-rv-close-detail')){detailOpen=false;render();host.querySelector<HTMLElement>('[data-rv-detail]')?.focus({preventScroll:true});}
    else if(b.dataset.rvJump!==undefined){host.querySelector<HTMLElement>(`#${uid}-issue-${b.dataset.rvJump}`)?.scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}
    else if(b.dataset.rvPage){const[k,n]=b.dataset.rvPage.split(':');if(k==='findings')findingPage=Number(n);else if(k==='records')recordsPage=Number(n);else coveragePage=Number(n);render();}
    else if(b.dataset.rvSite!==undefined){const p=siteCoverage(study)?.pages[Number(b.dataset.rvSite)],evidence=study.evidence?.find(e=>p&&[pageKey(p.url),pageKey(p.final_url||p.url)].includes(pageKey(e.screen.url||'')));if(evidence){selectPerson(evidence.persona_id,'records');screen=evidence.screen.id;eventIndex=result()?.act?.events.map(e=>e.screen===screen).lastIndexOf(true)??-1;render();}}
    else if(b.dataset.rvTab){tab=b.dataset.rvTab as Tab;options.onTabChange?.(tab);render();if(tab==='interview')void loadChats();}
    else if(b.dataset.rvFinding!==undefined){finding=Number(b.dataset.rvFinding);selectPerson(model.findings[finding].records[0].id);}
    else if(b.dataset.rvPerson)selectPerson(Number(b.dataset.rvPerson));
    else if(b.dataset.rvRecord)selectPerson(Number(b.dataset.rvRecord),'records');
    else if(b.dataset.rvInterview){detailOpen=false;selectPerson(Number(b.dataset.rvInterview),'interview');}
    else if(b.dataset.rvChatPerson)selectPerson(Number(b.dataset.rvChatPerson));
    else if(b.dataset.rvScreen||b.dataset.rvCoverage){screen=b.dataset.rvScreen||b.dataset.rvCoverage!;if(b.dataset.rvCoverage){if(options.compact){tab='records';options.onTabChange?.(tab);}finding=-1;person=model.records.find(r=>r.act.path.includes(screen))?.id||person;}eventIndex=result()?.act?.events.map(e=>e.screen===screen).lastIndexOf(true)??-1;render();}
    else if(b.dataset.rvEvent!==undefined){eventIndex=Number(b.dataset.rvEvent);render();}
    else if(b.hasAttribute('data-rv-retry'))void loadChats(true);
    else if(b.hasAttribute('data-rv-back-evidence')){tab='records';options.onTabChange?.(tab);render();}
    else if(b.dataset.rvQuestion!==undefined)ask(RECORD_QUESTIONS[Number(b.dataset.rvQuestion)]);
    else if(b.dataset.rvCitation){const target=b.dataset.rvCitation;if(!result()?.act?.path.includes(target))return;screen=target;eventIndex=result()?.act?.events.map(e=>e.screen===screen).lastIndexOf(true)??-1;tab='records';options.onTabChange?.(tab);render();}
    else if(b.hasAttribute('data-rv-print'))printReport(study);
    else if(b.hasAttribute('data-rv-chat-export')){const blob=new Blob([JSON.stringify({test:study.product.name,run:study.runs?.act||null,persona:person,source:sourceTitle(study),messages:chats[person]||[]},null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`personalab-interview-${person}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
    else if(b.dataset.rvExport)downloadReport(study,b.dataset.rvExport==='json'?'json':'md');
    else if(b.hasAttribute('data-rv-replay'))options.onReplay?.();
    else if(b.hasAttribute('data-rv-next'))options.onNext?.();
  }
  const change=(e:Event)=>{const target=e.target as HTMLSelectElement;if(target.hasAttribute('data-rv-select-person')){selectPerson(Number(target.value));return;}if(target.hasAttribute('data-rv-mode')){interviewMode=target.value==='llm'&&allowsLlm()?'llm':'records';render();return;}if(target.hasAttribute('data-rv-filter')){filter=target.value;recordsPage=0;render();host.querySelector<HTMLSelectElement>('[data-rv-filter]')?.focus({preventScroll:true});}};
  const input=(e:Event)=>{const t=e.target as HTMLTextAreaElement;if(t.hasAttribute('data-rv-input'))draft[person]=t.value;};
  const submit=(e:SubmitEvent)=>{if((e.target as HTMLElement).hasAttribute('data-rv-form')){e.preventDefault();ask(draft[person]||'');}};
  const keydown=(e:KeyboardEvent)=>{const t=(e.target as Element).closest<HTMLElement>('[data-rv-tab]');if(!t||!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=reportTabs();const at=tabs.indexOf(tab);tab=tabs[e.key==='Home'?0:e.key==='End'?tabs.length-1:(at+(e.key==='ArrowRight'?1:tabs.length-1))%tabs.length];options.onTabChange?.(tab);render(`tab-${tab}`);if(tab==='interview')void loadChats();};
  host.addEventListener('click',click);host.addEventListener('change',change);host.addEventListener('input',input);host.addEventListener('submit',submit);host.addEventListener('keydown',keydown);render();
  return { selectPersona:selectPerson, showTab(next:Tab){tab=next;render();if(tab==='interview')void loadChats();}, update(next:Study){const nextIdentity=`${next.id}:${next.runs?.act||0}`,reset=identity!==nextIdentity;identity=nextIdentity;study=next;model=analyzeReport(study);finding=Math.min(finding,Math.max(0,model.findings.length-1));if(reset){epoch++;loadRequest++;loaded.clear();llmAllowed.clear();interviewMode='records';loading=0;asking=0;errorPerson=0;chats={};draft={};tab='overview';filter='all';findingPage=recordsPage=coveragePage=0;detailOpen=false;}if(reset||!study.personas.some(p=>p.id===person)||(model.records.length>0&&!study.results.find(r=>r.id===person)?.act)){person=model.findings[finding]?.records[0]?.id||model.records[0]?.id||study.personas[0]?.id||0;resetEvidence();}render();},
    dispose(){epoch++;loadRequest++;host.removeEventListener('click',click);host.removeEventListener('change',change);host.removeEventListener('input',input);host.removeEventListener('submit',submit);host.removeEventListener('keydown',keydown);host.innerHTML='';} };
}