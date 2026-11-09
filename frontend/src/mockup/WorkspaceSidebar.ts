import * as api from '../api/studio';

type Page = 'tests' | 'library' | 'history';
interface HistoryEntry { study: number; name: string; run: api.Run; source?: string }
interface Options {
  sessionKey: () => number | null;
  panels: () => api.LibraryPanel[];
  studies: () => { id: number; name: string; status: string }[];
  ready: () => boolean;
  checked: () => boolean;
  panelName: (panel: api.LibraryPanel) => string;
  openRun: (study: number, run: number) => void;
}
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const pages = {
  tests: { title: '진행 중인 UX 리서치', description: '' },
  library: { title: '페르소나 보관함', description: '서로 다른 사용자들의 배경과 행동 특성을 살펴보세요.' },
  history: { title: '전체 실행 기록', description: '이전에 실행한 UI·UX 탐색의 상태와 결과를 다시 확인하세요.' },
};
export function mountWorkspaceSidebar(root: HTMLElement, options: Options) {
  const el = (id: string) => root.querySelector<HTMLElement>(`#${id}`)!;
  const workspace = el('v-workspace');
  let page: Page = 'tests';
  let library: api.LibraryPage | null = null, libraryPanel: number | null = null, libraryBusy = false, libraryError = '', libraryRequest = 0;
  let history: HistoryEntry[] = [], historyBusy = false, historyLoaded = false, historyError = '', historyRequest = 0, historyFailed = 0;
  const dialog = el('workspacePersonaDialog') as HTMLDialogElement;
  function closeSidebar(focus = false) {
    workspace.removeAttribute('data-sidebar-open');
    const toggle = workspace.querySelector<HTMLButtonElement>('[data-ws-toggle]')!;
    toggle.setAttribute('aria-expanded', 'false');
    el('v-workspace').querySelector<HTMLElement>('.ws-sidebar-backdrop')!.hidden = true;
    if (focus) toggle.focus();
  }
  function catalog() {
    if (!options.checked()) return '<p class="ws-message" role="status">보관함을 불러오는 중입니다.</p>';
    if (!options.ready()) return '<div class="ws-empty workspace-empty"><strong>보관함에 연결하지 못했습니다.</strong><p>계정 메뉴에서 서버 연결 상태를 확인해 주세요.</p><button class="btn" type="button" data-workspace-connection>연결 상태 확인</button></div>';
    const panels = options.panels();
    if (libraryPanel !== null) {
      const panel = panels.find(p => p.id === libraryPanel);
      return `<div class="ws-library-heading"><button class="btn quiet" type="button" data-ws-library-back>← 전체 패널</button><span>${panel ? esc(options.panelName(panel)) : '패널'}${library ? ` · ${library.total}명` : ''}</span></div>${libraryBusy ? '<p class="ws-message" role="status">페르소나를 불러오는 중입니다.</p>' : libraryError ? `<div class="ws-message error" role="alert">${esc(libraryError)} <button type="button" class="btn" data-ws-panel="${libraryPanel}">다시 불러오기</button></div>` : library ? `<div class="ws-persona-grid">${library.items.map(p => {
        const profile = p.attributes?.profile;
        return `<button type="button" class="ws-persona-card" data-ws-person="${p.id}"><span class="ws-persona-code">${esc(p.source_persona_id)}</span><strong>${profile?.age ? `${esc(profile.age)}세 ` : ''}${esc(profile?.job_group || '페르소나')}</strong><span class="ws-persona-region">${[profile?.sex, profile?.region].filter(Boolean).map(esc).join(' · ')}</span><p>${esc(p.attributes?.card_text || '선택하면 요약 프로필을 살펴볼 수 있습니다.')}</p><span class="ws-persona-open">프로필 살펴보기 <span aria-hidden="true">↗</span></span></button>`;
      }).join('')}</div><div class="ws-pagination"><span>${library.total ? `${library.offset + 1}–${library.offset + library.items.length}` : '0'} / ${library.total}명</span><div><button class="btn" type="button" data-ws-offset="${Math.max(0, library.offset - library.limit)}" ${library.offset === 0 ? 'disabled' : ''}>이전</button><button class="btn" type="button" data-ws-offset="${library.offset + library.limit}" ${library.offset + library.items.length >= library.total ? 'disabled' : ''}>다음</button></div></div>` : ''}`;
    }
    return panels.length ? `<div class="ws-library-summary"><span>저장된 패널 <b>${panels.length}</b>개</span><span>총 ${panels.reduce((n,p) => n + p.count, 0)}명의 페르소나</span></div><div class="ws-panel-grid">${panels.map(panel => `<article class="ws-panel-card"><span class="ws-panel-kicker">PERSONA PANEL</span><h2>${esc(options.panelName(panel))}</h2><p>기존 데이터로 구성한 ${panel.count}명의 배경과 행동 특성을 살펴보세요.</p><div><span>${panel.count}명</span><button type="button" class="btn" data-ws-panel="${panel.id}">패널 살펴보기 <span aria-hidden="true">→</span></button></div></article>`).join('')}</div>` : '<div class="ws-empty workspace-empty"><strong>저장된 패널이 없습니다.</strong><p>원본 패널을 가져오면 이곳에서 살펴볼 수 있습니다.</p></div>';
  }
  async function loadLibrary(panel: number, offset = 0) {
    const owner = options.sessionKey();
    if (owner === null || !options.panels().some(p => p.id === panel)) return;
    const request = ++libraryRequest; libraryPanel = panel; libraryBusy = true; libraryError = ''; library = null; render();
    try {
      const result = await api.listLibraryPersonas(panel, offset);
      if (options.sessionKey() !== owner || request !== libraryRequest) return;
      library = result;
    } catch (error) {
      if (options.sessionKey() !== owner || request !== libraryRequest) return;
      libraryError = error instanceof Error ? error.message : '페르소나를 불러오지 못했습니다.';
    } finally { if (options.sessionKey() === owner && request === libraryRequest) { libraryBusy = false; render(); } }
  }
  function historyContent() {
    const tools = '<div class="ws-library-heading"><span>UI·UX 탐색 기록</span><button type="button" class="btn quiet" data-ws-history-refresh>새로고침</button></div>';
    if (historyBusy) return tools + '<p class="ws-message" role="status">실행 기록을 모으고 있습니다.</p>';
    if (historyError) return tools + `<div class="ws-message error" role="alert">${esc(historyError)}</div>`;
    const warning = historyFailed ? `<p class="ws-message error" role="status">${historyFailed}개 테스트의 기록을 불러오지 못했습니다. 새로고침으로 다시 확인해 주세요.</p>` : '';
    return tools + warning + (history.length ? `<div class="ws-history-list">${history.map(item => {
      const label = ({ done: '실행 완료', failed: '확인 필요', running: '실행 중', pending: '실행 대기' } as Record<string,string>)[item.run.status] || '상태 확인';
      const progress = Number.isFinite(item.run.progress) ? Math.round(Math.max(0,Math.min(1,item.run.progress)) * 100) : null;
      return `<button type="button" class="ws-history-row" data-ws-run="${item.run.id}" data-ws-study="${item.study}"><span class="ws-run-number">#${item.run.id}</span><span class="ws-history-name"><strong>${esc(item.name)}</strong><span>UI·UX 탐색${item.source === 'local-demo' ? ' · 로컬 가상 점검' : ''}${progress !== null && item.run.status === 'running' ? ` · 실행 진행률 ${progress}%` : ''}</span></span><span class="ws-state" data-state="${esc(item.run.status)}">${label}</span><span class="ws-history-open">${item.run.status === 'done' ? '결과 보기' : '상태 확인'} <span aria-hidden="true">↗</span></span></button>`;
    }).join('')}</div>` : `<div class="ws-empty workspace-empty"><strong>${historyFailed ? '실행 기록을 확인하지 못했습니다.' : '아직 UI·UX 실행 기록이 없습니다.'}</strong><p>${historyFailed ? '서버 연결 상태를 확인한 뒤 다시 불러와 주세요.' : '테스트를 실행하면 이전 탐색을 이곳에서 다시 확인할 수 있습니다.'}</p><button type="button" class="btn" data-ws-page="tests">내 테스트로 이동 →</button></div>`);
  }
  async function loadHistory() {
    const owner = options.sessionKey(); if (owner === null) return;
    if (!options.ready()) { historyError = '서버에 연결한 뒤 실행 기록을 확인해 주세요.'; historyLoaded = true; render(); return; }
    const request = ++historyRequest, studies = [...options.studies()], rows: HistoryEntry[] = [];
    let cursor = 0, failed = 0;
    historyBusy = true; historyError = ''; historyFailed = 0; render();
    async function worker() {
      while (cursor < studies.length && options.sessionKey() === owner && request === historyRequest) {
        const current = studies[cursor++];
        try { const detail = await api.getStudy(current.id); if (options.sessionKey() !== owner || request !== historyRequest) return; for (const run of detail.runs || []) if (run.mode === 'act') rows.push({ study: current.id, name: current.name, run, source: detail.source }); }
        catch { if (options.sessionKey() === owner && request === historyRequest) failed++; }
      }
    }
    await Promise.all(Array.from({length: Math.min(4, studies.length)}, () => worker()));
    if (options.sessionKey() !== owner || request !== historyRequest) return;
    history = rows.sort((a,b) => b.run.id - a.run.id); historyFailed = failed; historyLoaded = true; historyBusy = false; render();
  }
  function render() {
    workspace.querySelectorAll<HTMLElement>('[data-ws-page]').forEach(button => { if (button.dataset.wsPage === page) button.setAttribute('aria-current', 'page'); else button.removeAttribute('aria-current'); });
    el('workspace-title').textContent = pages[page].title; el('workspaceDescription').textContent = pages[page].description; el('workspaceDescription').hidden = !pages[page].description; el('workspaceBreadcrumb').textContent = page === 'tests' ? '내 테스트' : pages[page].title;
    el('workspaceTestsPanel').hidden = page !== 'tests'; el('workspaceLibraryPanel').hidden = page !== 'library'; el('workspaceHistoryPanel').hidden = page !== 'history';
    if (page === 'library') el('workspaceLibraryContents').innerHTML = catalog();
    if (page === 'history') { el('workspaceHistoryContents').innerHTML = historyContent(); if (!historyLoaded && !historyBusy && options.checked()) void loadHistory(); }
  }
  function show(next: Page) { page = next; closeSidebar(); render(); }
  function reset() {
    libraryRequest++; historyRequest++; library = null; libraryPanel = null; libraryBusy = false; libraryError = ''; history = []; historyBusy = false; historyLoaded = false; historyError = ''; historyFailed = 0;
    el('workspaceLibraryContents').innerHTML = ''; el('workspaceHistoryContents').innerHTML = ''; el('workspacePersonaContents').innerHTML = '';
    if (dialog.open) dialog.close(); show('tests');
  }
  function click(event: MouseEvent) {
    const button = (event.target as HTMLElement).closest<HTMLElement>('button'); if (!button || !workspace.contains(button)) return;
    if (button.hasAttribute('data-ws-toggle')) { const opened = workspace.hasAttribute('data-sidebar-open'); if (opened) closeSidebar(); else { workspace.setAttribute('data-sidebar-open', ''); button.setAttribute('aria-expanded','true'); workspace.querySelector<HTMLElement>('.ws-sidebar-backdrop')!.hidden = false; workspace.querySelector<HTMLElement>('.ws-navigation [aria-current="page"]')?.focus(); } return; }
    if (button.hasAttribute('data-ws-close')) { closeSidebar(true); return; }
    if (button.dataset.wsPage && button.dataset.wsPage in pages) { show(button.dataset.wsPage as Page); return; }
    if (button.dataset.wsPanel) { void loadLibrary(Number(button.dataset.wsPanel)); return; }
    if (button.hasAttribute('data-ws-library-back')) { libraryRequest++; libraryPanel = null; library = null; libraryBusy = false; render(); return; }
    if (button.hasAttribute('data-ws-offset') && libraryPanel !== null && !(button as HTMLButtonElement).disabled) { void loadLibrary(libraryPanel,Number(button.dataset.wsOffset)); return; }
    if (button.dataset.wsPerson) {
      const persona = library?.items.find(p => p.id === Number(button.dataset.wsPerson)); if (!persona) return;
      el('workspacePersonaContents').innerHTML = `<span class="ws-persona-code">${esc(persona.source_persona_id)}</span><h2 id="workspacePersonaTitle">${persona.attributes?.profile?.age ? `${esc(persona.attributes.profile.age)}세 ` : ''}${esc(persona.attributes?.profile?.job_group || '페르소나')}</h2><p class="ws-persona-full">${esc(persona.attributes?.card_text || '별도의 설명이 없는 프로필입니다.')}</p>`;
      dialog.showModal(); dialog.querySelector<HTMLButtonElement>('[data-ws-person-close]')?.focus(); return;
    }
    if (button.hasAttribute('data-ws-person-close')) { dialog.close(); return; }
    if (button.hasAttribute('data-ws-history-refresh')) { historyLoaded = false; void loadHistory(); return; }
    if (button.dataset.wsRun && button.dataset.wsStudy) { const row = history.find(r => r.study === Number(button.dataset.wsStudy) && r.run.id === Number(button.dataset.wsRun)); if (row) options.openRun(row.study, row.run.id); }
  }
  function keys(event: KeyboardEvent) {
    if (!workspace.hasAttribute('data-sidebar-open') || root.querySelector('dialog[open]')) return;
    if (event.key === 'Escape' && !workspace.querySelector('details[open]')) { event.preventDefault(); closeSidebar(true); return; }
    if (event.key === 'Tab') {
      const sidebar = el('workspaceSidebar');
      const targets = [...sidebar.querySelectorAll<HTMLElement>('a,button:not([disabled]),summary')].filter(node => !node.closest('details:not([open])') || Boolean(node.closest('summary')));
      const first = targets[0], last = targets.at(-1);
      if (event.shiftKey && (document.activeElement === first || !sidebar.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !sidebar.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
    }
  }
  root.addEventListener('click',click); root.addEventListener('keydown',keys);
  return { render, show, reset, close: closeSidebar, dispose() { libraryRequest++; historyRequest++; root.removeEventListener('click',click); root.removeEventListener('keydown',keys); } };
}