import { mountReport } from './ReportView';
import { DEMO, personaId, percent } from '../studio/model';
import { brandMarkup } from './Brand';
import { DEMO_STEPS, DEMO_STORAGE, demoStudy, initialDemo, restoreDemo } from './DemoData';
import './demo.css';

const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export function mountDemo(host: HTMLElement) {
  let reportView: ReturnType<typeof mountReport> | undefined;
  let state = initialDemo(); try { state = restoreDemo(localStorage.getItem(DEMO_STORAGE)); } catch { /* 저장이 차단돼도 체험 가능 */ }
  let timer: ReturnType<typeof setTimeout> | undefined, cursor = 0, playing = false, saveFailed = false;
  let currentPerson = state.person, currentScreen = DEMO.screens[0].id, currentText = '재생을 시작하면 저장된 탐색 기록을 순서대로 보여드립니다.';
  const storage = () => { try { localStorage.setItem(DEMO_STORAGE, JSON.stringify(state)); } catch { saveFailed = true; } };
  const study = () => demoStudy(state.selected);
  const screenLabel = (id: string) => DEMO.screens.find(s => s.id === id)?.label || id;
  const events = () => study().results.flatMap(r => r.act!.events.map(e => ({ id: r.id, screen: e.screen, text: e.reason || `“${e.target}” 선택 → ${e.to || e.screen}`, action:e.action, target:e.target })));
  function pause() { clearTimeout(timer); timer = undefined; playing = false; }
  function move(step: number) {
    if (step > 2 && !state.selected.length || step === 4 && !state.complete) return;
    pause(); if (step === 3 && cursor === 0) { currentPerson = state.selected[0]; currentScreen = DEMO.screens[0].id; currentText = '재생을 시작하면 저장된 탐색 기록을 순서대로 보여드립니다.'; } state.step = step; storage(); render(); host.querySelector<HTMLElement>('h1')?.focus();
  }
  function phone(id: string, activeTarget?: string | null) {
    const s = DEMO.screens.find(s => s.id === id)!;
    return `<div class="dm-phone"><div class="dm-phone-status"><span>9:41</span><span>▰</span></div><header><strong>일정메이트</strong><span>${esc(s.id)}</span></header><div class="dm-phone-content"><span class="dm-eyebrow">${esc(s.label)}</span><h3>${esc(s.id === 'S01' ? '흩어진 일정,\n한곳에서 가볍게.' : s.label).replace(/\n/g,'<br>')}</h3><p>${esc(s.description)}</p>${s.id === 'S02' ? '<div class="dm-fields"><span>이메일</span><span>비밀번호</span><span>휴대폰 번호 · 인증번호 받기</span></div>' : ''}<div class="dm-phone-actions">${s.elements.map(e => `<button type="button" class="${activeTarget === e.text ? 'chosen' : ''}" data-dm-link="${esc(e.to || id)}">${esc(e.text)} <span>→</span></button>`).join('') || '<strong>오늘의 일정이 준비됐어요.</strong>'}</div></div><footer>화면 설명을 시각화한 체험용 미리보기</footer></div>`;
  }
  function intro() {
    return `<div class="dm-heading"><span class="dm-eyebrow">01 / 무엇을 살펴볼까요?</span><h1 tabindex="-1">화면 너머의 경험을,<br>한 번 따라가 보세요.</h1><p>일정메이트의 가입 흐름을 예시로<br>프로토타입에서 페르소나 인터뷰까지 체험합니다.</p></div><div class="dm-two"><section class="dm-card"><span class="dm-eyebrow">이번에 살펴볼 제품</span><h2>일정메이트</h2><p>${esc(DEMO.product.description)}</p><div class="dm-chips">${DEMO.product.features.map(f => `<span>${esc(f)}</span>`).join('')}</div><dl class="dm-facts"><div><dt>사용 흐름</dt><dd>${esc(DEMO.task)}</dd></div><div><dt>등록된 화면</dt><dd>온보딩부터 홈까지, 5개 화면</dd></div><div><dt>사용할 기록</dt><dd>직장인 AI 페르소나 5명의 저장된 탐색</dd></div></dl></section><aside class="dm-note"><span class="dm-note-mark">“</span><h2>같은 화면을 봐도,<br>멈추는 이유는 다르니까.</h2><p>누가 어떤 화면을 선택했는지 보고,<br>그 순간 남긴 이유를 확인해 보세요.</p><div class="dm-method"><strong>체험 데이터 안내</strong><p>저장된 AI 기록을 재생합니다. 새 LLM 호출이나 실제 카드 전송은 발생하지 않습니다. 실제 사용자 응답과도 구분합니다.</p></div></aside></div><div class="dm-actions"><span>약 2분 · 로그인 없이 체험</span><button class="btn solid" data-dm-step="1">화면 살펴보기 →</button></div>`;
  }
  function prototype() {
    const s = DEMO.screens.find(s => s.id === state.screen)!;
    return `<div class="dm-heading"><span class="dm-eyebrow">02 / 화면과 연결</span><h1 tabindex="-1">어떤 길을 지나게 될까요?</h1><p>화면을 선택하거나 미리보기의 버튼을 눌러 연결을 확인하세요.</p></div><div class="dm-prototype"><div class="dm-screen-list" aria-label="등록된 화면">${DEMO.screens.map(s => `<button type="button" data-dm-screen="${s.id}" aria-pressed="${state.screen === s.id}"><span>${s.id}</span><strong>${esc(s.label)}</strong><small>${s.id === DEMO.goal ? '목표 화면' : `${s.elements.length}개 버튼`}</small><span>→</span></button>`).join('')}<p class="dm-muted">이 체험에서는 원본 기록에 대응하는 화면을 사용합니다. 내 화면은 실제 테스트에서 등록할 수 있습니다.</p></div><div class="dm-phone-stage">${phone(state.screen)}</div><aside class="dm-screen-note"><span class="dm-eyebrow">${s.id} / 화면의 맥락</span><h2>${esc(s.label)}</h2><p>${esc(s.description)}</p><h3>연결된 버튼</h3>${s.elements.map(e => `<p class="dm-connection"><strong>${esc(e.text)}</strong><span>→ ${esc(screenLabel(e.to || s.id))}</span></p>`).join('') || '<p>목표 화면입니다.</p>'}<div class="dm-method"><strong>이번 기록의 범위</strong><p>화면 설명과 버튼 연결을 사용한 기록입니다. 미리보기의 시각 디자인을 AI가 평가한 결과는 아닙니다.</p></div></aside></div><div class="dm-actions"><button class="btn quiet" data-dm-step="0">← 제품 맥락</button><button class="btn solid" data-dm-step="2">페르소나 선택 →</button></div>`;
  }
  function panel() {
    return `<div class="dm-heading"><span class="dm-eyebrow">03 / 다른 사람의 시선</span><h1 tabindex="-1">누구의 경험을 볼까요?</h1><p>탐색 기록이 있는 AI 페르소나를 선택하세요.<br>전체 보관함 400명과 별개인 공개 데모 5명입니다.</p></div><div class="dm-panel-summary"><strong>${state.selected.length}명 선택</strong><button class="btn sm" data-dm-all>전체 선택</button></div><div class="dm-person-grid">${DEMO.personas.map(p => `<label class="dm-person-card ${state.selected.includes(p.id) ? 'selected' : ''}"><span class="dm-person-top"><span class="dm-person-code">${esc(personaId(p))}</span><input type="checkbox" data-dm-person="${p.id}" ${state.selected.includes(p.id) ? 'checked' : ''} aria-label="${esc(personaId(p))} 선택"></span><h2>${p.attributes.profile.age}세 직장인</h2><p>${esc(p.attributes.card_text)}</p><footer>저장된 Act 기록 · 2개 화면 방문</footer></label>`).join('')}</div><p class="dm-muted">대학생용 제품을 직장인 패널이 탐색한 사례입니다. 타깃 집단 전체를 대표하거나 실제 전환율을 예측하지 않습니다.</p><div class="dm-actions"><button class="btn quiet" data-dm-step="1">← 화면 연결</button><button class="btn solid" data-dm-step="3" ${!state.selected.length ? 'disabled' : ''}>${state.selected.length}명의 탐색 살펴보기 →</button></div>`;
  }
  function run() {
    const event = events()[Math.max(0, cursor - 1)], p = DEMO.personas.find(p => p.id === currentPerson)!;
    const progress = state.complete ? 100 : percent(cursor, events().length);
    return `<div class="dm-heading dm-heading-row"><div><span class="dm-eyebrow">04 / 실제 기록을 따라</span><h1 tabindex="-1">선택의 순간을 재생합니다.</h1><p>화면 이동과 그 순간 남긴 문장을 함께 살펴보세요.</p></div><span class="dm-source">저장된 AI 기록 재생</span></div><div class="dm-run-layout"><aside class="dm-run-roster"><span class="dm-eyebrow">이번에 선택한 페르소나</span>${study().personas.map(p => `<div class="${p.id === currentPerson ? 'active' : ''}"><strong>${esc(personaId(p))}</strong><span>${p.attributes.profile.age}세 직장인</span><small>${events().slice(0,cursor).some(e => e.id === p.id && e.action === 'abandon') ? '기록 확인' : '대기'}</small></div>`).join('')}<div class="dm-method"><strong>새 추론 없이 체험</strong><p>이 재생에서는 토큰을 사용하지 않습니다. 실제 카드의 외부 전송 보류도 유지됩니다.</p></div></aside><div class="dm-run-stage"><div class="dm-phone-stage">${phone(currentScreen, event?.target)}</div><div class="dm-replay-progress" role="progressbar" aria-label="데모 재생 진행률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}"><span style="width:${progress}%"></span></div><div class="dm-replay-controls"><button class="btn solid" data-dm-play>${playing ? '일시정지' : state.complete ? '다시 재생' : cursor ? '이어 재생' : '기록 재생하기'} ${playing ? 'Ⅱ' : '▷'}</button><button class="btn" data-dm-finish>저장된 결과 바로 보기 →</button></div></div><aside class="dm-run-evidence" aria-live="polite"><span class="dm-eyebrow">${esc(personaId(p))} · ${p.attributes.profile.age}세 직장인</span><h2>${esc(currentScreen)} ${esc(screenLabel(currentScreen))}</h2><blockquote>${esc(currentText)}</blockquote><span class="dm-muted">Synthetic User Response</span><ol class="dm-event-list">${events().slice(0,cursor).slice(-5).map(e => `<li><strong>${esc(personaId(DEMO.personas.find(p => p.id === e.id)!))} · ${e.screen}</strong><span>${esc(e.text)}</span></li>`).join('')}</ol></aside></div><div class="dm-actions"><button class="btn quiet" data-dm-step="2">← 페르소나 선택</button>${state.complete ? '<button class="btn solid" data-dm-step="4">결과·인터뷰 보기 →</button>' : '<span>화면 재생을 멈춰도 원본 기록은 바뀌지 않습니다.</span>'}</div>`;
  }  function report() { return '<div id="demoReport"></div>'; }
  function render() {
    reportView?.dispose(); reportView=undefined;
    const source = `<div class="dm-banner"><span><b>체험용 데모</b> · 저장된 AI 기록 5명 · 새 LLM 실행 없음</span><a href="#workspace">실제 워크스페이스 →</a></div>`;
    host.innerHTML = `<header class="topbar"><a class="logo" href="#landing">${brandMarkup}</a><span class="dm-header-divider">/</span><span class="dm-header-name">일정메이트 · 데모</span><div class="spacer"></div><a class="btn quiet sm" href="#landing">소개로</a><button class="btn sm" data-dm-reset>처음부터</button></header>${source}<div class="dm-shell"><nav class="dm-nav" aria-label="데모 단계"><span class="dm-eyebrow">EXPERIENCE LAB</span>${DEMO_STEPS.map((label,i) => `<button type="button" data-dm-step="${i}" ${i === state.step ? 'aria-current="step"' : ''} ${i === 4 && !state.complete || i > 2 && !state.selected.length ? 'disabled' : ''}><span>${String(i+1).padStart(2,'0')}</span><strong>${label}</strong>${i < state.step ? '<small>✓</small>' : ''}</button>`).join('')}<div class="dm-nav-bottom"><span>한 번의 탐색에서,<br>다음 수정의 근거까지.</span><a href="#workspace">내 테스트 만들기 ↗</a></div></nav><main class="dm-main">${[intro,prototype,panel,run,report][state.step]()}${saveFailed ? '<p class="dm-muted" role="status">브라우저 저장이 차단되어 새로고침 시 체험 상태가 초기화됩니다.</p>' : ''}<footer class="dm-footer"><span>PersonaLab · Synthetic User Response</span><span>화면 설명·버튼 연결 기반 / 실제 사용자 결과 미포함</span></footer></main></div>`;
    if (state.step===4) {
      reportView=mountReport(host.querySelector<HTMLElement>('#demoReport')!,study(),{onReplay:()=>move(3),onNext:()=>{location.hash='#register';},nextLabel:'내 화면으로 테스트 만들기',chats:state.chats,onChats:chats=>{state.chats=chats;storage();},onSelectPersona:id=>{state.person=id;storage();}});
      reportView.selectPersona(state.person);
    }
  }
  function finish() { if (!state.selected.length) { move(2); return; } pause(); cursor = events().length; state.complete = true; state.step = 4; storage(); render(); }
  function tick() {
    if (!playing || location.hash !== '#demo') { pause(); return; }
    const event = events()[cursor];
    if (!event) { finish(); return; }
    currentPerson = event.id; currentScreen = event.screen; currentText = event.text; cursor++; render();
    timer = setTimeout(tick, matchMedia('(prefers-reduced-motion: reduce)').matches ? 450 : 1300);
  }
  function click(event: MouseEvent) {
    const button = (event.target as Element).closest<HTMLElement>('button'); if (!button || button.hasAttribute('disabled')) return;
    if (button.dataset.dmStep !== undefined) move(Number(button.dataset.dmStep));
    if (button.dataset.dmScreen) { state.screen = button.dataset.dmScreen; storage(); render(); }
    if (button.dataset.dmLink && state.step === 1) { state.screen = button.dataset.dmLink; storage(); render(); }
    if (button.hasAttribute('data-dm-all')) { state.selected = DEMO.personas.map(p => p.id); state.complete = false; cursor = 0; storage(); render(); }
    if (button.hasAttribute('data-dm-play')) {
      if (playing) { pause(); render(); } else { if (state.complete || cursor >= events().length) { cursor = 0; state.complete = false; } playing = true; storage(); tick(); }
    }
    if (button.hasAttribute('data-dm-finish')) finish();
    if (button.hasAttribute('data-dm-reset')) { pause(); state = initialDemo(); cursor = 0; currentPerson = state.person; currentScreen = DEMO.screens[0].id; currentText = '재생을 시작하면 저장된 탐색 기록을 순서대로 보여드립니다.'; storage(); render(); }
  }
  const change = (event: Event) => {
    const input = event.target as HTMLInputElement; if (!input.dataset.dmPerson) return;
    state.selected = DEMO.personas.filter(p => p.id === Number(input.dataset.dmPerson) ? input.checked : state.selected.includes(p.id)).map(p => p.id);
    if (!state.selected.includes(state.person)) state.person = state.selected[0] || DEMO.personas[0].id;
    state.complete = false; cursor = 0; storage(); render();
  };
  const hash = () => { if (location.hash !== '#demo') { pause(); render(); } };
  host.addEventListener('click',click); host.addEventListener('change',change); window.addEventListener('hashchange',hash); render();
  return () => { reportView?.dispose(); pause(); host.removeEventListener('click',click); host.removeEventListener('change',change); window.removeEventListener('hashchange',hash); };
}
