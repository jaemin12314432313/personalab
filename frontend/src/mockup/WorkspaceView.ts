/** One observed finding inside a round (repeat / new / not seen this time). Never labelled "resolved". */
export interface WorkspaceFinding { title: string; screen: string; people: number; total: number; kind: 'rep' | 'new' | 'gone'; }
export interface WorkspaceRound {
  label: string;           // R1, R2 …
  state: 'done' | 'running' | 'failed' | 'ready' | 'draft' | 'partial' | 'prev';
  stateLabel: string;
  date?: string;           // ISO date (yyyy-mm-dd) or date-time
  dateKind?: 'started' | 'created'; // when the run actually started vs. when the round was created
  people?: number;
  findings?: WorkspaceFinding[];
  studyId?: number;        // 이 회차의 테스트 번호(열기·비교에 쓴다)
  note?: string;           // 이 회차에서 바꾼 점
  stats?: { total: number; complete: number; drop: number; system: number; visited: number; problems: number; llm?: boolean }; // 종료 기록 기준 결과
  site?: boolean;          // 사이트 전반 탐색(목표 화면이 없는 회차)인지
}
export interface WorkspacePerson {
  id: string; age: number; job: string; face: string;
  /** 0 대기 · 1 탐색 중 · 2 목표 도달 · 3 중단·한도 */
  lane: 0 | 1 | 2 | 3;
  quote: string; screen: string; actions: number; refs: number;
  studyId?: number; // 이 사람이 속한 회차의 테스트 번호
  pid?: number;     // 서버의 페르소나 번호(1대1 인터뷰를 그 사람으로 열 때 쓴다)
  code?: string;    // 멈춘 이유 코드
  state?: 'complete' | 'drop' | 'system' | 'pending';
  asked?: number;   // 서버에 저장된 인터뷰 대화 개수
}
export interface WorkspaceEntry {
  productId?:string; testTitle?:string; note?:string;
  key?:string; archived?:boolean; trashed?:boolean; manageable?:boolean; rounds?:number;
  name: string;
  description: string;
  context?: string;
  state: string;
  local?: string;
  server?: number;
  screens?: number;
  personas?: number;
  records?: number;
  personaIds?: string[];
  kind?: string;
  step?: number;           // 0–5: last setup step reached (only while not run yet)
  created?: string;
  startedAt?: string;
  people?: WorkspacePerson[];
  roundList?: WorkspaceRound[];
  source: string;
}
const escape = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const states: Record<string, { label: string; action: string; priority: number }> = {
  running: { label: '실행 중', action: '실행 보기', priority: 0 },
  failed: { label: '확인 필요', action: '상태 확인', priority: 1 },
  draft: { label: '작성 중', action: '이어서 설정', priority: 2 },
  ready: { label: '실행 준비', action: '이어서 설정', priority: 3 },
  pending: { label: '실행 대기', action: '테스트 열기', priority: 4 },
  done: { label: '최근 실행 완료', action: '결과 보기', priority: 5 },
};
const LANES = [
  { name: '대기', note: '아직 시작하지 않았어요' },
  { name: '탐색 중', note: '지금 화면을 살펴보고 있어요' },
  { name: '목표 도달', note: '종료 기록이 저장됐어요' },
  { name: '중단·한도', note: '중간에 멈췄거나 한도에 도달했어요' },
];
const KIND = { rep: '반복 관찰', new: '새로 관찰', gone: '이번엔 관찰 안 됨' };
type Tab = 'overview' | 'board' | 'rounds' | 'cal';
const TAB_NAME: Record<Tab, string> = { overview: '개요', board: '보드', rounds: '회차', cal: '캘린더' };
const SETUP_STEPS = ['화면 연결', '화면 확인', '대상 사용자', '참여 구성', '탐색 범위', '실행'];
const I = {
  cmt: '<path d="M5 6h14v10H9l-4 3z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
};
const icon = (name: keyof typeof I) => `<svg class="ws-ic" viewBox="0 0 24 24" aria-hidden="true">${I[name]}</svg>`;

// Workspace home: sidebar test list + selected test (board / rounds / list / calendar).
let selectedKey = '';
let tab: Tab = 'overview';
let onlyFinished = false;
export function selectWorkspace(key: string) { selectedKey = key; }
export function selectedWorkspaceKey() { return selectedKey; }
export function setWorkspaceTab(value: string) { tab = (['overview', 'board', 'rounds', 'cal'] as string[]).includes(value) ? value as Tab : 'overview'; }
/** Tabs that have something real to show for this test. */
export function visibleTabs(entry?: WorkspaceEntry): Tab[] {
  const t: Tab[] = ['overview'];
  // 보드는 개요의 '먼저 살펴볼 기록'과 단계별 인원 수로 합쳤다. 따로 탭을 두지 않는다
  // 회차는 개요의 '회차 누적'에 합쳤다
  t.push('cal');
  return t;
}
let calMonth = { y: 0, m: -1 };
let calFor = '';
export function shiftCalendar(delta: number) { if (calMonth.m < 0) return; const d = new Date(calMonth.y, calMonth.m + delta, 1); calMonth = { y: d.getFullYear(), m: d.getMonth() }; }
export function calendarToday() { const n = new Date(); calMonth = { y: n.getFullYear(), m: n.getMonth() }; }
export function getWorkspaceTab() { return tab; }
let askAll = false;
export function toggleWorkspaceAskAll() { askAll = !askAll; }
export function toggleWorkspaceFinished() { onlyFinished = !onlyFinished; }

function filterEntries(entries: WorkspaceEntry[], query: string, sort: string, view: string, status: string) {
  const inView = entries.filter(e => view === 'trash' ? e.trashed : view === 'archived' ? e.archived && !e.trashed : !e.archived && !e.trashed);
  const visible = inView.filter(e => status === 'all' || (status === 'running' ? ['running', 'pending'].includes(e.state) : status === 'draft' ? ['draft', 'ready'].includes(e.state) : e.state === status)).filter(entry => `${entry.name} ${entry.testTitle || ''} ${entry.note || ''} ${entry.description} ${entry.context || ''}`.toLocaleLowerCase('ko-KR').includes(query));
  visible.sort(sort === 'name' ? (a, b) => a.name.localeCompare(b.name, 'ko-KR') : (a, b) => (states[a.state]?.priority ?? 6) - (states[b.state]?.priority ?? 6) || Number(isEmptyDraft(a)) - Number(isEmptyDraft(b)));
  return visible;
}

function parts(entry: WorkspaceEntry) {
  const state = states[entry.state] || { label: '저장됨', action: '테스트 열기', priority: 6 };
  const open = entry.local ? `data-open-local="${escape(entry.local)}"` : `data-open-server="${entry.server}"`;
  const revise = entry.local ? `data-ws-revise-local="${escape(entry.local)}"` : `data-ws-revise-server="${entry.server}"`;
  const key = escape(entry.key || '');
  const manage = (action: string, label: string, danger = false) => `<button type="button" data-wm-action="${action}" data-wm-key="${key}" ${danger ? 'class="wm-danger"' : ''}>${label}</button>`;
  const menu = entry.manageable ? `<details class="wm-menu"><summary aria-label="${escape(entry.name)} 관리">⋯</summary><div>${entry.trashed ? manage('restore', '복원') + manage('delete', '영구 삭제', true) : manage('rename', '이름 변경') + manage('duplicate', '복제') + manage(entry.archived ? 'unarchive' : 'archive', entry.archived ? '보관 해제' : '보관') + manage('trash', '휴지통으로 이동', true)}</div></details>` : '';
  const primary = entry.trashed ? manage('restore', '복원') : `<button type="button" class="btn workspace-study-row ws-open" ${open}>${state.action}</button>`;
  return { state, menu, primary, revise };
}

function pick(visible: WorkspaceEntry[]) { return visible.find(e => e.key === selectedKey) || visible[0]; }

/** Left sidebar list: one row per test, coloured by state. */
export function workspaceSideList(entries: WorkspaceEntry[], query: string, sort: string, view = 'active', status = 'all', loading = false) {
  const visible = filterEntries(entries, query, sort, view, status);
  if (loading && !entries.length) return '<p class="ws-side-note" role="status">불러오는 중입니다.</p>';
  if (!visible.length) return `<p class="ws-side-note">${query || status !== 'all' ? '조건에 맞는 테스트가 없어요.' : view === 'trash' ? '휴지통이 비어 있어요.' : view === 'archived' ? '보관한 테스트가 없어요.' : '아직 테스트가 없어요.'}</p>`;
  const picked = pick(visible);
  const testLabel = (e: WorkspaceEntry) => e.testTitle || (e.productId ? '전반 탐색' : '');
  const item = (entry: WorkspaceEntry, nested = false) => {
    const { menu } = parts(entry);
    const selected = entry === picked;
    const label = nested ? (testLabel(entry) || '기본 테스트') : entry.name;
    const sub = !nested && testLabel(entry) ? `<small> · ${escape(testLabel(entry))}</small>` : '';
    return `<div class="ws-it${selected ? ' sel' : ''}${nested ? ' nested' : ''}" role="listitem" tabindex="0" data-ws-select="${escape(entry.key || '')}" data-state="${escape(entry.state)}" aria-current="${selected}"><i class="ws-dot" aria-hidden="true"></i><span class="ws-it-name" title="${escape(entry.name)}${testLabel(entry) ? ' · ' + escape(testLabel(entry)) : ''}">${escape(label)}${sub}</span><span class="ws-sr">${escape((states[entry.state] || { label: '저장됨' }).label)}</span>${menu}</div>`;
  };
  // 화면 연결·구성·실행이 하나도 없는 초안은 목록을 어지럽히므로 접어 둔다(지우지는 않는다). 보기 전환·검색 중에는 그대로 보여 준다.
  const group = view === 'active' && !query && status === 'all';
  const empty = group ? visible.filter(isEmptyDraft) : [];
  const main = group ? visible.filter(e => !isEmptyDraft(e)) : visible;
  // 같은 앱·웹(productId)의 테스트는 한 묶음으로. 두 개 이상일 때만 머리글을 둔다. 소속 정보가 없는 기존 테스트는 이름·URL이 같아도 합치지 않는다.
  const order: string[] = []; const byProduct = new Map<string, WorkspaceEntry[]>();
  for (const e of main) { const k = e.productId || `solo:${e.key}`; if (!byProduct.has(k)) { byProduct.set(k, []); order.push(k); } byProduct.get(k)!.push(e); }
  const mainHtml = order.map(k => {
    const list = byProduct.get(k)!;
    if (list.length === 1) return item(list[0]);
    return `<div class="ws-prod" role="group" aria-label="${escape(list[0].name)}"><div class="ws-prod-hd"><b>${escape(list[0].name)}</b><span>${list.length}</span></div>${list.map(e => item(e, true)).join('')}</div>`;
  }).join('');
  // 빈 초안뿐이면 접을 이유가 없으니 그냥 목록으로 보여 준다
  if (!main.length && empty.length) return empty.map(e => item(e)).join('');
  const drafts = empty.length ? `<details class="ws-drafts"${empty.includes(picked) ? ' open' : ''}><summary>작성 중 · 화면 미연결 <b>${empty.length}</b></summary>${empty.map(e => item(e)).join('')}</details>` : '';
  return mainHtml + drafts;
}

/** 화면을 연결하지 않았고 페르소나·실행도 없는 첫 회차 초안. 화면 수를 모르는 서버 항목은 판단하지 않는다. */
function isEmptyDraft(e: WorkspaceEntry) {
  return e.state === 'draft' && e.screens === 0 && !e.personas && !e.records && (e.rounds || 1) <= 1;
}

function summary(entry: WorkspaceEntry) {
  const people = entry.people || [];
  const total = entry.personas ?? people.length;
  const finished = people.filter(p => p.lane >= 2).length || entry.records || 0;
  const bits: string[] = [];
  if (entry.kind) bits.push(entry.kind);
  if (entry.screens !== undefined) bits.push(`화면 ${entry.screens}개`);
  if (entry.state === 'running' && total) bits.push(`${total}명 중 ${finished}명이 탐색을 마쳤어요`);
  else if (entry.state === 'done' && total) bits.push(`${total}명의 탐색 기록이 저장됐어요`);
  else if (entry.state === 'failed') bits.push(finished ? `${total}명 중 ${finished}명의 기록만 저장됐어요` : '실행이 멈췄어요');
  else if (entry.state === 'draft') bits.push('작성 중이에요');
  else if (entry.state === 'ready' && total) bits.push(`${total}명 구성이 준비됐어요`);
  else bits.push(`회차 ${entry.rounds || 1}`);
  return bits.join(' · ');
}

function personCard(p: WorkspacePerson) {
  return `<article class="ws-pc" data-lane="${p.lane}"><h3>${escape(p.id)} · ${escape(p.age)}세 ${escape(p.job)}</h3><p>${escape(p.quote || LANES[p.lane].note)}</p><span class="ws-tag">${p.screen ? escape(p.screen) : '—'}</span><div class="ws-pc-ft"><span title="이 페르소나가 한 행동 수">${icon('cmt')}행동 ${p.actions}</span><span title="방문한 화면 수">${icon('link')}화면 ${p.refs}</span><span class="ws-pc-face">${p.face}</span></div></article>`;
}

function emptyBoard(entry: WorkspaceEntry) {
  return `<div class="ws-empty-board"><b>${entry.personas === 0 ? '참여 페르소나를 아직 고르지 않았어요' : '이 테스트의 페르소나 기록은 열어서 확인하세요'}</b><span>${entry.personas === 0 ? '설정에서 참여 구성을 마치면 보드가 생겨요.' : '저장된 기록이 있으면 여기에 보드로 보여요.'}</span></div>`;
}

function board(entry: WorkspaceEntry) {
  const people = (entry.people || []).filter(p => !onlyFinished || p.lane >= 2);
  if (!(entry.people || []).length) return emptyBoard(entry);
  return `<div class="ws-board">${LANES.map((lane, i) => {
    const list = people.filter(p => p.lane === i);
    return `<div class="ws-lane" data-lane="${i}"><div class="ws-lane-hd">${lane.name}<b>${list.length}</b></div><div class="ws-lane-body">${list.map(personCard).join('') || '<div class="ws-lane-empty">없음</div>'}</div></div>`;
  }).join('')}</div>`;
}

function roundsOf(entry: WorkspaceEntry): WorkspaceRound[] {
  if (entry.roundList?.length) return entry.roundList;
  const n = entry.rounds || 1;
  return Array.from({ length: n }, (_, i) => i === n - 1
    ? { label: `R${i + 1}`, state: (entry.state === 'running' ? 'running' : entry.state === 'failed' ? 'failed' : entry.state === 'done' ? 'done' : entry.state === 'ready' ? 'ready' : 'draft') as WorkspaceRound['state'], stateLabel: states[entry.state]?.label || '저장됨' }
    : { label: `R${i + 1}`, state: 'prev' as const, stateLabel: '이전 회차' });
}

/** 마지막 회차가 아직 실행 전이거나 실행 중이면 다음 수정 회차를 만들 수 없다. 안 돌린 회차 위에 회차가 쌓이지 않게 한다. */
function roundLocked(entry: WorkspaceEntry) {
  const last = roundsOf(entry).at(-1)?.state ?? entry.state;
  return last === 'draft' || last === 'ready' || last === 'running';
}
function lockedAddNote(entry: WorkspaceEntry) {
  const last = roundsOf(entry).at(-1)?.state ?? entry.state;
  return last === 'running' ? '지금 실행이 끝난 뒤 만들 수 있어요' : '마지막 회차를 실행한 뒤 만들 수 있어요';
}

function roundsView(entry: WorkspaceEntry, trashed: boolean) {
  const rounds = roundsOf(entry);
  const cols = rounds.map(r => {
    const f = r.findings || [];
    return `<div class="ws-lane ws-round" data-round="${r.state}"><div class="ws-lane-hd">${escape(r.label)} · ${escape(r.stateLabel)}<b>${f.length}</b></div><div class="ws-lane-body">${f.map((x) => `<article class="ws-pc"><span class="ws-kind" data-kind="${x.kind}">${KIND[x.kind]}</span><h3>${escape(x.title)}</h3><div class="ws-pc-ft"><span>${escape(x.screen)}</span><span>${x.kind === 'gone' ? '진행 중이라 확정 아님' : `${x.people}/${x.total}명`}</span></div></article>`).join('') || `<div class="ws-lane-empty">${r.state === 'draft' ? '설정을 마치면 쌓여요' : '관찰 기록이 아직 없어요'}</div>`}</div></div>`;
  }).join('');
  const add = trashed ? '' : roundLocked(entry)
    ? `<div class="ws-lane ws-round ws-round-new"><div class="ws-lane-hd">새 회차<b>+</b></div><div class="ws-lane-body"><p class="ws-round-locked" role="note">${lockedAddNote(entry)}</p></div></div>`
    : `<div class="ws-lane ws-round ws-round-new"><div class="ws-lane-hd">새 회차<b>+</b></div><div class="ws-lane-body"><button type="button" class="ws-new-round" ${parts(entry).revise}>${icon('plus')} 수정 회차 만들기</button></div></div>`;
  const none = rounds.every(r => !(r.findings || []).length);
  const note = none ? '<p class="ws-tab-note">회차별 발견(반복 관찰·새로 관찰)은 실행이 끝난 뒤 분석되면 여기에 쌓여요. 지금은 회차 목록만 보여요.</p>' : '';
  return `${note}<div class="ws-board ws-rounds" style="--n:${Math.min(rounds.length + (trashed ? 0 : 1), 4)}">${cols}${add}</div>`;
}

const WEEK = ['월', '화', '수', '목', '금', '토', '일'];
const DROP_TEXT: Record<string, string> = { PRIVACY: '개인정보가 부담스러웠어요', TOO_MANY_STEPS: '단계가 너무 많았어요', UNCLEAR_PURPOSE: '화면의 목적이 불분명했어요', TRUST: '믿을 수 있는지 확신하지 못했어요', PRICE: '비용이 부담스러웠어요', FEATURE_MISSING: '필요한 기능을 찾지 못했어요', SWITCHING_COST: '갈아타기 부담이 있었어요', NAVIGATION_LOST: '경로를 찾지 못했어요' };
// mode: 'up'=늘면 좋음, 'down'=줄면 좋음, 'neutral'=개선의 근거가 아니라 색을 칠하지 않음(방문 범위·시스템 종료).
// noise: AI 실행은 같은 조건에서도 매번 달라서 이 크기보다 작은 차이는 고친 효과로 보지 않는다.
function delta(now: number, before: number | undefined, mode: 'up' | 'down' | 'neutral', noise = 0) {
  if (before === undefined || now === before) return '';
  const d = now - before, arrow = `${d > 0 ? '▲' : '▼'} ${Math.abs(d)}`;
  if (mode === 'neutral') return `<i class="ws-d">${arrow}</i>`;
  if (noise && Math.abs(d) < noise) return `<i class="ws-d noise" title="작은 차이라 판단을 유보해요. 실측한 오차가 아니라 임의 기준이니 같은 조건으로 한 번 더 확인하세요">≈ ${arrow}</i>`;
  const good = mode === 'up' ? d > 0 : d < 0;
  return `<i class="ws-d ${good ? 'good' : 'bad'}">${arrow}</i>`;
}
function roundCard(r: WorkspaceRound, prev: WorkspaceRound | undefined, latest: boolean, trashed = false, deletable = false) {
  const st = r.stats, pst = prev?.stats;
  const noise = st && pst && (st.llm || pst.llm) ? Math.max(2, Math.round(Math.max(st.total, pst.total) * 0.1)) : 0;
  const bar = st && st.total ? `<div class="ws-rbar" role="img" aria-label="목표 도달 ${st.complete}명, 중단 ${st.drop}명, 횟수까지 ${st.system}명"><span style="flex:${st.complete}" data-k="complete"></span><span style="flex:${st.drop}" data-k="drop"></span><span style="flex:${st.system}" data-k="system"></span></div>` : '<div class="ws-rbar empty"></div>';
  // 전반 탐색에는 목표 화면이 없으므로 '목표 도달'이 아니라 방문 페이지와 발견한 문제를 보여 준다
  const nums = st ? (r.site
    ? `<dl class="ws-rnums"><div><dt>방문 페이지</dt><dd>${st.visited}<small>개</small>${delta(st.visited, pst?.visited, 'neutral')}</dd></div><div><dt>발견한 문제</dt><dd>${st.problems}<small>곳</small>${delta(st.problems, pst?.problems, 'down', noise)}</dd></div><div><dt>참여</dt><dd>${st.total}<small>명</small></dd></div></dl>`
    : `<dl class="ws-rnums"><div><dt>목표 도달</dt><dd>${st.complete}<small>/${st.total}</small>${delta(st.complete, pst?.complete, 'up', noise)}</dd></div><div><dt>탐색 중단</dt><dd>${st.drop}${delta(st.drop, pst?.drop, 'down', noise)}</dd></div><div><dt>횟수까지 살펴봄</dt><dd>${st.system}${delta(st.system, pst?.system, 'neutral')}</dd></div></dl>`)
    : `<p class="ws-rwait">${r.state === 'running' ? '탐색이 끝나면 결과가 쌓여요.' : r.state === 'draft' || r.state === 'ready' ? '아직 실행 전이에요.' : '저장된 결과가 없어요.'}</p>`;
  const hasResult = r.state === 'done' || r.state === 'failed' || r.state === 'partial';
  const open = trashed ? '<p class="ws-rtrash">휴지통에 있어요. 복원하면 리포트와 인터뷰를 열 수 있어요.</p>' : r.studyId ? (hasResult
    ? `<div class="ws-rlinks"><button type="button" class="ws-rlink main" data-open-server="${r.studyId}" data-then-hash="report">리포트 보기 →</button></div>`
    : `<button type="button" class="ws-rlink main" data-open-server="${r.studyId}">${r.state === 'running' ? '실행 보기' : '이어서 설정'} →</button>`) : '';
  return `<article class="ws-round-card${latest ? ' latest' : ''}" data-round="${r.state}"><header><b>${escape(r.label.replace(/^R(\d+)$/, '$1회차'))}</b><span class="ws-rstate">${escape(r.stateLabel)}</span>${r.date ? `<time>${escape(r.date.slice(0, 10))}</time>` : ''}</header><div class="ws-rnote-wrap"><p class="ws-rnote${r.note ? '' : ' empty'}">${r.note ? escape(r.note) : '바꾼 점을 한두 줄로 적어 보세요'}</p>${r.studyId ? `<button type="button" class="ws-rnote-edit" data-round-note="${r.studyId}" data-note="${escape(r.note || '')}">${r.note ? '수정' : '적기'}</button>` : ''}</div>${bar}${nums}${open}${deletable && r.studyId ? `<div class="ws-rdel-wrap"><button type="button" class="ws-rdel" data-round-delete="${r.studyId}">이 회차 삭제</button></div>` : ''}</article>`;
}
function overviewView(entry: WorkspaceEntry) {
  const { primary, revise } = parts(entry);
  const people = entry.people || [];
  const total = entry.personas ?? people.length;
  const ended = people.filter(p => p.lane >= 2).length || entry.records || 0;
  const running = entry.state === 'running' || entry.state === 'pending';
  const step = entry.step ?? -1;
  const next = entry.state === 'draft'
    ? { t: step >= 0 ? `${SETUP_STEPS[Math.min(step, 5)]} 단계부터 이어서 설정해요` : '설정을 이어서 해요', d: step >= 0 ? `6단계 중 ${Math.min(step, 5)}단계까지 끝냈어요.` : '설정을 마치면 탐색을 시작할 수 있어요.' }
    : entry.state === 'ready' ? { t: '실행 준비가 끝났어요', d: '설정을 한 번 확인하고 탐색을 시작하세요.' }
    : running ? { t: '페르소나가 화면을 살펴보고 있어요', d: total ? `${total}명 중 ${ended}명이 종료 기록을 남겼어요.` : '이 화면을 나가도 서버 실행은 계속돼요.' }
    : entry.state === 'failed' ? { t: '실행이 중단됐어요', d: ended ? `${ended}명의 기록은 저장됐어요. 중단된 위치를 확인하세요.` : '저장된 기록이 없어요. 설정을 확인해 주세요.' }
    : { t: '탐색 기록이 저장됐어요', d: '리포트에서 발견한 지점을 보고, 고친 뒤 새 회차로 다시 확인하세요.' };
  // 회차 목록이 아직 안 왔어도 마지막 회차 카드는 이 테스트를 열 수 있어야 한다
  const rounds = roundsOf(entry).map((r, i, all) => (i === all.length - 1 && !r.studyId ? { ...r, studyId: entry.server } : r));
  const finished = rounds.filter(r => r.stats);
  const hasResults = entry.state === 'done' || entry.state === 'failed';
  const cmp = finished.length >= 2 && entry.server ? `<button type="button" class="ws-link" data-open-server="${entry.server}" data-then-hash="compare">회차 비교하기 →</button>` : '';
  const addCard = entry.trashed ? '' : roundLocked(entry)
    ? `<div class="ws-round-card ws-round-add is-locked" role="note" aria-disabled="true">${icon('plus')}<b>수정 회차 만들기</b><span>${lockedAddNote(entry)}</span></div>`
    : `<button type="button" class="ws-round-card ws-round-add" ${revise}>${icon('plus')}<b>수정 회차 만들기</b><span>고친 뒤 같은 조건으로 다시 확인해요</span></button>`;
  // 결과가 있을 때는 큰 '다음 할 일' 카드를 두지 않고 상태 문장을 회차 머리글로 쓴다(리포트·인터뷰 길은 카드에 있다)
  const trendTitle = hasResults ? next.t : `${rounds.length}개 회차`;
  const trendHint = rounds.length === 1 && hasResults ? '고친 뒤 수정 회차를 만들면 이 줄에 결과가 쌓이고 서로 비교돼요.' : rounds.length > 1 ? '회차끼리 숫자를 비교해 고친 효과를 확인하세요.' : '';
  const trend = `<section class="ws-trend" aria-label="회차 누적"><header class="ws-sec-hd"><div><span class="ws-dt-label">회차</span><h3>${trendTitle}</h3>${trendHint ? `<p class="ws-sec-hint">${trendHint}</p>` : ''}</div>${cmp}</header><div class="ws-rounds-row">${rounds.map((r, i) => roundCard(r, rounds[i - 1], i === rounds.length - 1, Boolean(entry.trashed), i > 0)).join('')}${addCard}</div></section>`;
  // 아래는 '1대1 인터뷰': 사람을 누르면 그 사람과의 인터뷰가 바로 열린다
  const rank = (p: WorkspacePerson) => (p.state === 'drop' ? 0 : p.state === 'system' ? 1 : p.state === 'complete' ? 2 : 3);
  const asked = [...people].sort((a, b) => rank(a) - rank(b));
  const canAsk = entry.server && !entry.trashed;
  const interviewCard = (p: WorkspacePerson) => {
    const ok = canAsk && p.pid && p.state && p.state !== 'pending';
    const tag = p.state === 'drop' ? '<span class="ws-itag drop">중단</span>' : p.state === 'complete' ? '<span class="ws-itag good">도착</span>' : p.state === 'system' ? `<span class="ws-itag">${p.code === 'NAVIGATION_LOST' ? '마침' : '횟수까지'}</span>` : '<span class="ws-itag">기록 없음</span>';
    const why = p.state === 'drop' ? (p.code ? (DROP_TEXT[p.code] || '이유 미기록') : '이유 미기록') : p.state === 'system' ? (p.code === 'NAVIGATION_LOST' ? '더 갈 곳이 없어 탐색을 마쳤어요' : '정해 둔 횟수까지 살펴봤어요') : p.state === 'complete' ? '끝까지 도착했어요' : '아직 종료 기록이 없어요';
    const attrs = ok ? `data-open-server="${p.studyId || entry.server}" data-then-hash="interview" data-then-persona="${p.pid}"` : 'disabled';
    return `<button type="button" class="ws-ask" ${attrs}><span class="ws-pc-face">${p.face}</span><span class="ws-ask-body"><b>${escape(p.id)} · ${escape(p.age)}세 ${escape(p.job)}</b><span class="ws-ask-why">${why}${p.screen ? ` · ${escape(p.screen)}` : ''}</span>${p.asked ? `<span class="ws-ask-saved">대화 ${p.asked}개 저장됨</span>` : ''}</span>${tag}<span class="ws-ask-go" aria-hidden="true">물어보기 →</span></button>`;
  };
  const look = asked.length ? `<section class="ws-interviews"><header class="ws-sec-hd"><div><span class="ws-dt-label">1대1 인터뷰</span><h3>궁금한 사람을 눌러 직접 물어보세요${asked.length > 3 ? ` <small class="ws-count-note">${asked.length}명</small>` : ''}</h3><p class="ws-sec-hint">멈춘 사람이 먼저 보여요. 사람을 누르면 그 사람의 탐색 기록으로 인터뷰가 열려요.</p></div></header><div class="ws-ask-list">${asked.slice(0, askAll ? 200 : 3).map(interviewCard).join('')}</div>${asked.length > 3 ? `<button type="button" class="ws-ask-more" data-ws-ask-more>${askAll ? '접기' : `전체 ${asked.length}명 목록 보기`}</button>` : ''}</section>` : '';
  const steps = entry.state === 'draft' && step >= 0 ? `<ol class="ws-steps">${SETUP_STEPS.map((n, i) => `<li class="${i < step ? 'done' : i === step ? 'cur' : ''}"><i>${i + 1}</i>${n}</li>`).join('')}</ol>` : '';
  const nextCard = hasResults ? '' : `<div class="ws-ov-next"><div><span class="ws-dt-label">다음 할 일</span><h3>${next.t}</h3><p>${next.d}</p></div><div class="ws-ov-btns">${primary}</div>${steps}</div>`;
  return `<div class="ws-ov">${nextCard}${trend}${look}</div>`;
}

/** 회차를 날짜별로 보는 달력. 실제 시작일(없으면 만든 날짜)이 있는 회차만 표시하고, 없는 날짜를 만들어 넣지 않는다. */
function calView(entry: WorkspaceEntry) {
  const pad2 = (n: number) => String(n).padStart(2, '0');
  const dayKey = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const parse = (value: string) => new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  const rounds = (entry.roundList || []).filter(r => r.date && !Number.isNaN(parse(r.date).getTime()));
  if (!rounds.length) return '<div class="ws-message">날짜가 남은 회차가 아직 없어요. 실행하면 시작한 날짜가 여기에 표시돼요.</div>';
  const dates = rounds.map(r => parse(r.date!));
  const latest = new Date(Math.max(...dates.map(d => d.getTime())));
  if (calFor !== (entry.key || '') || calMonth.m < 0) { calFor = entry.key || ''; calMonth = { y: latest.getFullYear(), m: latest.getMonth() }; }
  const first = new Date(calMonth.y, calMonth.m, 1), lead = (first.getDay() + 6) % 7; // 월요일 시작
  const weeks = Math.ceil((lead + new Date(calMonth.y, calMonth.m + 1, 0).getDate()) / 7);
  const byDay = new Map<string, WorkspaceRound[]>();
  rounds.forEach((r, i) => { const key = dayKey(dates[i]); byDay.set(key, [...(byDay.get(key) || []), r]); });
  const today = dayKey(new Date());
  const heads = ['월', '화', '수', '목', '금', '토', '일'].map(d => `<div class="ws-cal-h">${d}</div>`).join('');
  const cells = Array.from({ length: weeks * 7 }, (_, i) => {
    const d = new Date(calMonth.y, calMonth.m, 1 - lead + i), key = dayKey(d), list = byDay.get(key) || [], out = d.getMonth() !== calMonth.m;
    const shown = list.slice(0, 3).map(r => `<div class="ws-cal-e" data-round="${escape(r.state)}"><b>${escape(r.label)}</b><small>${escape(r.stateLabel)}</small></div>`).join('');
    const more = list.length > 3 ? `<div class="ws-cal-more">+${list.length - 3}개 더</div>` : '';
    return `<div class="ws-cal-d${out ? ' out' : ''}${key === today ? ' td' : ''}"><span class="ws-cal-n">${d.getDate()}</span>${shown}${more}</div>`;
  }).join('');
  const rows = rounds.map((r, i) => `<div class="ws-cal-r"><b>${escape(r.label)}</b><span>${escape(r.stateLabel)}</span><span class="ws-cal-k">${r.dateKind === 'started' ? '시작' : '만든 날'} ${dayKey(dates[i])}</span><span>${r.people ? `${r.people}명` : ''}</span></div>`).join('');
  return `<div class="ws-calx"><div class="ws-cal-bar"><b>${calMonth.y}년 ${calMonth.m + 1}월</b><span><button type="button" data-ws-cal="prev" aria-label="이전 달">‹</button><button type="button" data-ws-cal="today">오늘</button><button type="button" data-ws-cal="next" aria-label="다음 달">›</button></span></div><div class="ws-cal ws-cal-g">${heads}${cells}</div><div class="ws-cal-list">${rows}</div></div>`;
}

function detail(entry: WorkspaceEntry) {
  const { state, primary, menu, revise } = parts(entry);
  const canRevise = !entry.trashed && (entry.state === 'done' || entry.state === 'failed') && !roundLocked(entry);
  const people = entry.people || [];
  const faces = people.length ? `<span class="ws-faces">${people.slice(0, 4).map(p => `<span class="ws-pc-face">${p.face}</span>`).join('')}${people.length > 4 ? `<span class="ws-more">+${people.length - 4}</span>` : ''}</span>` : '';
  if (!visibleTabs(entry).includes(tab)) tab = 'overview';
  const body = tab === 'overview' ? overviewView(entry) : tab === 'rounds' ? roundsView(entry, Boolean(entry.trashed)) : tab === 'cal' ? calView(entry) : board(entry);
  const chips = (tab === 'board') && people.length ? `<button type="button" class="ws-chip${onlyFinished ? ' on' : ''}" data-ws-only aria-pressed="${onlyFinished}">기록이 끝난 사람만</button>` : '';
  return `<section class="ws-detail" aria-label="선택한 테스트"><div class="ws-bc">내 앱·웹 / ${escape(entry.name)}${entry.testTitle ? ' / ' + escape(entry.testTitle) : ''}</div><div class="ws-hd"><div class="ws-hd-l"><h2>${escape(entry.name)}</h2>${(entry.testTitle || entry.note || (entry.rounds || 1) > 1) ? `<p class="ws-dt-test">${[entry.testTitle, (entry.rounds || 1) > 1 ? `${entry.rounds}회차` : '', entry.note].filter(Boolean).map(escape).join(' · ')}</p>` : ''}<p class="ws-dt-desc">${escape(entry.context || entry.description)}</p></div><div class="ws-hd-r"><span class="ws-state" data-state="${escape(entry.state)}">${state.label}</span><span class="ws-dt-act">${tab === 'overview' ? '' : primary}</span>${menu ? `<span class="ws-hd-menu">${menu}</span>` : ''}</div></div><div class="ws-meta">${faces}${chips}<span class="ws-sub">${escape(summary(entry))}</span></div>${body}<p class="ws-dt-note">얼굴은 AI 대표 이미지이며 여러 프로필에 재사용될 수 있어요. AI 페르소나의 탐색 기록이며 실제 사용자 조사가 아닙니다.</p></section>`;
}

export function workspaceContent(entries: WorkspaceEntry[], query: string, sort: string, serverReady: boolean, loading = false, view='active', status='all') {
  const visible = filterEntries(entries, query, sort, view, status);
  const empty = `<div class="workspace-empty ws-empty"><span class="ws-empty-mark" aria-hidden="true">＋</span><strong>${query ? '검색 결과가 없습니다.' : status!=='all' ? '조건에 맞는 테스트가 없습니다.' : view==='trash'?'휴지통이 비어 있습니다.':view==='archived'?'보관한 테스트가 없습니다.':'아직 시작한 테스트가 없습니다.'}</strong><p>${query||status!=='all' ? '검색어와 상태 필터를 바꿔 보세요.' : view==='trash'?'휴지통으로 옮긴 테스트는 복원하거나 영구 삭제할 수 있어요.':view==='archived'?'당장 사용하지 않는 테스트를 여기에 보관하세요.':'화면을 연결하고, 첫 번째 테스트를 시작해 보세요.'}</p>${query||status!=='all' ? '<button type="button" class="btn" data-wm-reset>검색·필터 초기화</button>' : view!=='active'?'':'<button type="button" class="btn solid" data-create-study>첫 테스트 만들기 <span aria-hidden="true">→</span></button>'}</div>`;
  const content = visible.length ? detail(pick(visible)) : empty;
  if (loading&&!entries.length) return '<div class="ws-message ws-loading" role="status">저장된 테스트를 불러오는 중입니다.</div>';
  if (loading) return content + '<p class="workspace-server-note ws-loading" role="status">저장된 테스트를 불러오는 중입니다.</p>';
  return content + (!serverReady ? '<p class="workspace-server-note" role="status">서버 목록을 불러오지 못했습니다. 이 브라우저에 저장된 테스트만 표시합니다. 계정 메뉴에서 연결 상태를 확인하세요.</p>' : '');
}
