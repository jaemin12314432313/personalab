import { mountReport } from './ReportView';
import { mockReportStudy } from './ReportFixture';
import { DEMO, DROP_LABELS } from '../studio/model';
import { brandMarkup } from './Brand';
import { mountLandingMotion } from './LandingMotion';

export const LANDING_ANCHORS = ['how', 'features', 'results', 'sources', 'roadmap', 'faq'];
export function updateMarketingAuth(root: HTMLElement, signedIn: boolean, appPath = '') {
  const login = root.querySelector<HTMLAnchorElement>('[data-landing-login]');
  const entry = root.querySelector<HTMLAnchorElement>('[data-landing-entry]');
  if (login) { login.hidden = signedIn; login.style.display = signedIn ? 'none' : ''; login.href = `${appPath}#login`; }
  root.querySelectorAll<HTMLAnchorElement>('[data-landing-start]').forEach(a=>{a.href=`${appPath}#${signedIn?'workspace':'register'}`;});
  if (entry) { entry.textContent = signedIn ? '내 워크스페이스 →' : '회원가입 →'; entry.href = `${appPath}#${signedIn ? 'workspace' : 'register'}`; }
}
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const arrow = '<span aria-hidden="true">→</span>';
const sourceLabel = '<span class="lp-demo-label">저장된 AI 데모</span>';
const actText = (id: string) => DEMO.results.find(r => r.persona_id === id)?.act?.events.find(e => e.action === 'abandon')?.reason || '';
const reason = (code?: string | null) => code ? DROP_LABELS[code] || code : '—';
const screenName = (id: string) => DEMO.screens.find(s => s.id === id)?.label || id;
const brand = brandMarkup;
const underline = (text: string) => `<span class="lp-underlined">${text}<svg aria-hidden="true" viewBox="0 0 300 18" preserveAspectRatio="none"><path pathLength="1" d="M3 11 Q85 1 153 8 T296 6"/><path pathLength="1" d="M21 16 Q150 8 277 13"/></svg></span>`;

function pathList(id: string) {
  const events = DEMO.results.find(r => r.persona_id === id)?.act?.events || [];
  return `<ol class="lp-path-list">${events.map(e => `<li class="${e.action === 'abandon' ? 'stopped' : ''}"><span>${esc(e.screen)}</span><div><strong>${esc(screenName(e.screen))}</strong><small>${e.action === 'click' ? `${esc(e.target)} 선택` : `${esc(reason(e.drop_reason))} · 중단`}</small></div></li>`).join('')}</ol>`;
}

function landingRecord(id: string) {
  const r = DEMO.results.find(r => r.persona_id === id)!;
  const p = DEMO.personas.find(p => p.id === r.id)!;
  return `<div class="lp-record-meta"><strong>${esc(id)} <span>${p.attributes.profile.age}세 직장인</span></strong><span>한 사람의 탐색을 따라가 보세요</span></div><div class="lp-record-quotes lp-ux-record"><div><span class="lp-small-label">어디를 살펴봤나요?</span>${pathList(id)}</div><div><span class="lp-method act">그 순간 남긴 이유</span><blockquote>“${esc(actText(id))}”</blockquote><span class="lp-record-tag">${esc(reason(r.act?.end.drop_reason))}</span></div></div>`;
}

function personaRows() {
  return DEMO.personas.map(p => {
    const r = DEMO.results.find(r => r.id === p.id)!;
    return `<button class="lp-person-row" type="button" data-public-persona="${esc(r.persona_id)}"><span class="lp-person-id">${esc(r.persona_id)}</span><span><strong>${p.attributes.profile.age}세 · ${esc(p.attributes.profile.job_group)}</strong><small>이 페르소나의 탐색 기록 보기</small></span><span class="lp-row-arrow">${arrow}</span></button>`;
  }).join('');
}

function resultTable() {
  return `<table class="lp-result-table"><thead><tr><th scope="col">페르소나</th><th scope="col">탐색 경로</th><th scope="col">중단 이유</th></tr></thead><tbody>${DEMO.results.map(r => `<tr><td><button type="button" data-public-persona="${esc(r.persona_id)}">${esc(r.persona_id)} ${arrow}</button></td><td>${(r.act?.path || []).map((id, i) => `${i ? '<i>→</i>' : ''}<span>${esc(id)}</span>`).join('')}</td><td>${esc(reason(r.act?.end.drop_reason))}</td></tr>`).join('')}</tbody></table>`;
}

function productPreview() {
  return `<div class="lp-product-demo"><div class="lp-product-bar"><strong>PersonaLab <span>/ ${esc(DEMO.name)}</span></strong>${sourceLabel}</div>
    <div class="lp-demo-tabs" role="tablist" aria-label="UI·UX 테스트 미리보기"><button type="button" id="lp-tab-intro" role="tab" aria-selected="true" aria-controls="lp-pane-intro" data-landing-tab="intro">01 대상 화면</button><button type="button" id="lp-tab-panel" role="tab" aria-selected="false" aria-controls="lp-pane-panel" tabindex="-1" data-landing-tab="panel">02 페르소나</button><button type="button" id="lp-tab-results" role="tab" aria-selected="false" aria-controls="lp-pane-results" tabindex="-1" data-landing-tab="results">03 탐색 기록</button><button type="button" id="lp-tab-interview" role="tab" aria-selected="false" aria-controls="lp-pane-interview" tabindex="-1" data-landing-tab="interview">04 1대1 인터뷰</button></div>
    <div id="lp-pane-intro" class="lp-preview-pane lp-preview-editor" role="tabpanel" aria-labelledby="lp-tab-intro"><aside class="lp-preview-nav"><span>테스트 살펴보기</span><div class="selected">화면과 연결</div><div>페르소나 패널</div><div>탐색 기록</div><div>결과 확인</div></aside><div class="lp-preview-main"><span class="lp-small-label">어떤 경험을 살펴볼까요?</span><h3>처음 만나는 일정메이트</h3><p class="lp-preview-sub">처음 진입한 화면부터 가입을 마치는 흐름입니다.</p><div class="lp-screen-inventory">${DEMO.screens.map((s, i) => `<div><span>${esc(s.id)}</span><strong>${esc(s.label)}</strong><small>${i < 2 ? '데모에서 도달' : '미탐색'}</small></div>`).join('')}</div></div><aside class="lp-preview-guide"><span class="lp-small-label">이 데모가 살펴본 흐름</span><h4>첫 진입부터<br>회원가입까지</h4><p>등록 화면 ${DEMO.screens.length}개 중 AI 패널이 도달한 화면과 멈춘 지점을 확인하세요.</p><div class="lp-guide-rule"></div><p><b>넓게 살펴보고, 깊게 확인하고.</b><br>주요 사용 흐름을 살펴보고, 특히 궁금한 화면과 경험에 집중하세요.</p></aside></div>
    <div id="lp-pane-panel" class="lp-preview-pane lp-preview-panel" role="tabpanel" aria-labelledby="lp-tab-panel" hidden><div class="lp-preview-main"><span class="lp-small-label">같은 화면을 보는 서로 다른 시선</span><h3>누구의 경험을 살펴볼까요?</h3><div class="lp-inline-facts"><span>저장된 패널 <strong>${DEMO.personas.length}명</strong></span><span>프로필 <strong>27–34세 직장인</strong></span></div><div class="lp-preview-persons">${personaRows()}</div></div><aside class="lp-preview-guide"><span class="lp-small-label">페르소나의 배경</span><h4>이용 습관까지,<br>함께 살펴봅니다.</h4><p>엔진은 공개 페르소나와 조사 응답을 연결해 배경과 앱 이용 특성을 카드에 반영합니다.</p><p class="lp-preview-note">현재 미리보기는 저장된 데모 5명입니다. 실제 조사 참여자의 응답과 구분됩니다.</p></aside></div>
    <div id="lp-pane-results" class="lp-preview-pane lp-preview-results" role="tabpanel" aria-labelledby="lp-tab-results" hidden><div class="lp-preview-main"><span class="lp-small-label">탐색 기록에서 발견한 지점</span><h3>회원가입에서 5명이 멈췄습니다.</h3><p class="lp-preview-sub">페르소나를 누르면 탐색 경로와 중단 이유를 볼 수 있어요.</p>${resultTable()}</div><aside class="lp-preview-guide"><span class="lp-small-label">가장 많은 중단 이유</span><h4>개인정보 요구</h4><strong class="lp-count-emphasis">4<span> / 5명</span></strong><p>가입 이후 화면은 이 기록만으로 판단할 수 없습니다. 살펴본 범위를 함께 확인하세요.</p><a class="lp-text-link" href="#sample">전체 기록 살펴보기 ${arrow}</a></aside></div>
    <div id="lp-pane-interview" class="lp-preview-pane lp-preview-interview" role="tabpanel" aria-labelledby="lp-tab-interview" hidden><div class="lp-preview-main"><span class="lp-small-label">같은 페르소나, 같은 탐색 기록</span><h3>그 선택의 이유를 물어보세요.</h3><div class="lp-interview-example"><div><span>내 질문</span><p>회원가입에서 왜 멈췄나요?</p></div><div><span>P938 · 저장된 원문</span><p>“${esc(actText('P938'))}”</p><small>근거 · S02 회원가입 · 탐색 중단</small></div></div></div><aside class="lp-preview-guide"><span class="lp-small-label">근거를 확인하는 대화</span><h4>발견에서<br>다음 질문으로.</h4><p>답변의 근거를 누르면 당시의 화면과 경로로 돌아갑니다. 인물별 대화는 해당 테스트에 연결됩니다.</p><button type="button" class="lp-text-link" data-sample-interview>인터뷰 예시 열기 →</button></aside></div>
    <div class="lp-demo-foot"><span>화면 설명과 버튼 연결을 바탕으로 한 저장된 탐색 기록입니다.</span><a href="#sample">로그인 없이 결과 보기 ${arrow}</a></div></div>`;
}

function landingHtml() {
  return `<header class="topbar lp-topbar"><a class="logo" href="#landing">${brand}</a><nav class="topnav" aria-label="메인 메뉴"><a href="#how">어떻게 살펴보나요</a><a href="#results">결과 미리보기</a></nav><div class="spacer"></div><a class="btn quiet sm" data-landing-login href="#login">로그인</a><a class="btn solid sm" data-landing-entry href="#register">회원가입 ${arrow}</a></header>
  <main class="lp-editorial lp-ux-landing">
  <section class="hero lp-hero lp-centered-hero" aria-labelledby="lp-hero-title"><div class="lp-hero-copy"><span class="lp-kicker">AI 페르소나와 함께하는 UI·UX 테스트</span><h1 id="lp-hero-title"><span class="lp-title-line">화면은 같아도,</span><br><span class="lp-title-line">${underline('경험은 다르니까.')}</span></h1><p class="lede">AI 페르소나가 여러분의 화면을 탐색합니다.<br>막힌 지점과 이유를 살펴보고, 같은 페르소나에게 직접 물어보세요.</p><div class="ctas"><a class="btn solid" data-landing-start href="#register">테스트 시작하기 ${arrow}</a><a class="btn" href="#sample">샘플 결과 보기 ${arrow}</a></div></div></section>

  <section class="lp-section lp-how" id="how"><div class="lp-section-heading lp-split-heading"><div><span class="lp-eyebrow">01 / 화면에서 시작하는 테스트</span><h2>살펴볼 화면을 담고,<br>${underline('페르소나를 고르세요.')}</h2></div><p id="features">웹 주소에서 페르소나, 탐색 기록과 인터뷰까지.<br>아래 탭을 눌러 테스트의 흐름을 살펴보세요.</p></div><div class="lp-preview-surround">${productPreview()}</div></section>

  <section class="lp-results-band" id="results"><div class="lp-section lp-outcomes"><div class="lp-section-heading lp-split-heading"><div><span class="lp-eyebrow">02 / 이유가 보이는 결과</span><h2>어디서 막혔는지,<br>${underline('근거와 함께.')}</h2></div><p>탐색 경로와 그 순간의 이유를 나란히.<br>다음에 손볼 화면을 구체적으로 살펴보세요.</p></div><div class="lp-findings"><div class="lp-findings-summary"><span class="lp-small-label">일정메이트 · 저장된 AI 데모 5명</span><h3>다섯 명 모두,<br>회원가입에서 멈췄습니다.</h3><div class="lp-reason-bar" aria-label="개인정보 요구 4명, 복잡한 절차 1명"><span></span><span></span><span></span><span></span><span></span></div><p>개인정보 요구 <b>4명</b><span>복잡한 절차 <b>1명</b></span></p><a class="lp-text-link" href="#sample">전체 결과와 탐색 경로 보기 ${arrow}</a><small>대학생용 제품을 직장인 패널이 탐색한 사례입니다.<br>실제 사용자 결과나 전환율 예측이 아닙니다.</small><div class="lp-interview-note"><span class="lp-small-label">기록에서 대화로 · 1대1 인터뷰</span><strong>그 선택의 이유를,<br>직접 물어보세요.</strong><p>테스트했던 페르소나에게 같은 화면과 탐색 기록을 바탕으로 질문을 이어가세요.</p><button type="button" class="lp-text-link" data-sample-interview>1대1 인터뷰 체험하기 →</button></div></div><div class="lp-findings-evidence"><div class="lp-record-tabs" role="group" aria-label="결과를 살펴볼 페르소나">${DEMO.results.map(r => `<button type="button" data-landing-record="${esc(r.persona_id)}" aria-pressed="${r.persona_id === 'P563'}">${esc(r.persona_id)}</button>`).join('')}</div><div id="landingRecord" aria-live="polite">${landingRecord('P563')}</div><div class="lp-record-foot">저장된 AI 응답 · Synthetic User Response</div></div></div></div></section>

  <section class="lp-section lp-faq lp-start" id="faq"><div class="lp-start-copy"><span class="lp-eyebrow">03 / 다음 수정을 위한 첫걸음</span><h2>만드는 사람의 화면에서,<br>${underline('쓰는 사람의 경험으로.')}</h2><p>우리 서비스의 UI·UX를 다른 시선으로 살펴보세요.</p><a class="btn solid" data-landing-start href="#register">UI·UX 테스트 시작하기 ${arrow}</a><a class="lp-start-sample" href="#demo">전체 데모 체험하기 ${arrow}</a></div><div class="lp-faq-list"><details><summary>Figma 없이도 사용할 수 있나요?</summary><p>웹 주소나 정적 HTML 파일 묶음으로 시작할 수 있습니다. 개발 전 시안은 Figma의 화면 구조와 클릭 연결을 가져와 살펴볼 수 있어요. 웹 탐색은 로그인 전 화면의 조회·입력·이동을 지원하며, 결제나 서버 데이터를 바꾸는 요청은 실행하지 않습니다.</p></details><details><summary>어떤 부분을 살펴보나요?</summary><p>화면의 문구를 이해하는지, 주요 기능을 찾는지, 화면을 이동하고 정보를 입력하는 과정에서 어디가 불편한지 살펴봅니다. 특히 확인하고 싶은 부분이 있다면 집중 확인 항목으로 추가하세요.</p></details><details id="sources"><summary>페르소나는 어떤 사용자를 담고 있나요?</summary><p>엔진은 NVIDIA 한국인 페르소나와 한국미디어패널 조사 응답을 연결해 배경과 이용 특성을 반영합니다. 페르소나의 응답은 AI가 생성하며, 실제 사용자 조사와 구분합니다.</p></details><details id="roadmap"><summary>결과를 보고 더 물어볼 수 있나요?</summary><p>결과에서 궁금한 페르소나와 탐색 기록을 선택하고, 그 화면에서 어떤 선택을 했는지 1대1 인터뷰로 더 자세히 살펴보는 흐름입니다. “왜 여기서 멈췄나요?”처럼 구체적인 장면에서 질문을 시작하세요.</p></details></div></section>
  </main><footer class="lp-footer"><div><a class="logo" href="#landing">${brand}</a><p>화면 너머, 사용자의 경험을 살펴봅니다.</p></div><nav aria-label="하단 메뉴"><a href="#how">이용 방법</a><a href="#demo">전체 데모</a><a href="#sample">샘플 결과</a><a href="#sources">페르소나의 근거</a><a href="#faq">자주 묻는 질문</a></nav><span>© 2026 PersonaLab</span></footer>`;
}

function sampleHtml() {
  return `<div class="rv-sample-shell"><header class="topbar"><a class="logo" href="#landing">${brand}</a><div class="spacer"></div><a class="btn quiet sm" href="#landing">소개로 돌아가기</a><a class="btn solid sm" data-landing-start href="#register">내 테스트 만들기 ${arrow}</a></header><main class="rv-sample-body"><div class="rv-sample-nav"><span>워크스페이스 / 샘플 테스트 / 결과</span><div class="rv-dataset-switch" role="group" aria-label="예시 데이터 선택"><button type="button" data-report-dataset="recorded" aria-pressed="true">저장된 AI 기록 · 5명</button><button type="button" data-report-dataset="mock" aria-pressed="false">다양한 결과 예시 · 목데이터</button></div></div><div id="sampleReport"></div></main></div>`;
}

export function mountMarketing(root: HTMLElement) {
  root.querySelector<HTMLElement>('#v-landing')!.innerHTML = landingHtml();
  root.querySelector<HTMLElement>('#v-sample')!.innerHTML = sampleHtml();
  const disposeMotion = mountLandingMotion(root.querySelector<HTMLElement>('#v-landing')!);
  const sampleReport = mountReport(root.querySelector<HTMLElement>('#sampleReport')!, DEMO, {onNext:()=>{location.hash='#register';}, nextLabel:'내 화면으로 테스트 만들기'});
  function setDataset(mock:boolean) {
    sampleReport.update(mock ? mockReportStudy() : DEMO);
    root.querySelectorAll<HTMLElement>('[data-report-dataset]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.reportDataset===(mock?'mock':'recorded'))));
  }
  function selectPersona(id: string) {
    const r=DEMO.results.find(r=>r.persona_id===id); if(!r)return;
    setDataset(false); sampleReport.selectPersona(r.id,'records');
  }
  function selectTab(name: string, focus = false) {
    const tabs = [...root.querySelectorAll<HTMLElement>('[data-landing-tab]')];
    if (!tabs.some(t => t.dataset.landingTab === name)) return;
    tabs.forEach(tab => { const active = tab.dataset.landingTab === name; tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1; if (active && focus) tab.focus(); });
    root.querySelectorAll<HTMLElement>('.lp-preview-pane').forEach(p => { p.hidden = p.id !== `lp-pane-${name}`; });
  }
  const click = (event: MouseEvent) => {
    const target = (event.target as Element).closest<HTMLElement>('[data-public-persona],[data-landing-tab],[data-landing-record],[data-report-dataset],[data-sample-interview]'); if (!target) return;
    if(target.hasAttribute('data-sample-interview')){setDataset(false);sampleReport.selectPersona(DEMO.personas[0].id,'interview');location.hash='#sample';return;}
    if (target.dataset.reportDataset) setDataset(target.dataset.reportDataset==='mock');
    if (target.dataset.publicPersona) { selectPersona(target.dataset.publicPersona); if (location.hash !== '#sample') location.hash = '#sample'; }
    if (target.dataset.landingTab) selectTab(target.dataset.landingTab);
    if (target.dataset.landingRecord && DEMO.results.some(r => r.persona_id === target.dataset.landingRecord)) {
      root.querySelector<HTMLElement>('#landingRecord')!.innerHTML = landingRecord(target.dataset.landingRecord);
      root.querySelectorAll<HTMLElement>('[data-landing-record]').forEach(b => b.setAttribute('aria-pressed', String(b === target)));
    }
  };
  const keydown = (event: KeyboardEvent) => {
    const target = (event.target as Element).closest<HTMLElement>('[data-landing-tab]'); if (!target || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
    const names = ['intro','panel','results','interview']; const at = names.indexOf(target.dataset.landingTab!); const next = event.key === 'Home' ? 0 : event.key === 'End' ? names.length-1 : (at + (event.key === 'ArrowRight' ? 1 : -1) + names.length) % names.length;
    event.preventDefault(); selectTab(names[next], true);
  };
  const openLinkedQuestion = () => {
    const id = location.hash.slice(1);
    if (id === 'sources' || id === 'roadmap') root.querySelector<HTMLDetailsElement>(`details#${id}`)!.open = true;
  };
  root.addEventListener('click', click); root.addEventListener('keydown', keydown);
  window.addEventListener('hashchange', openLinkedQuestion); openLinkedQuestion();
  return () => { sampleReport.dispose(); disposeMotion(); root.removeEventListener('click', click); root.removeEventListener('keydown', keydown); window.removeEventListener('hashchange', openLinkedQuestion); };
}
