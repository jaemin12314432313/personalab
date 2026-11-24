import type { WorkspaceEntry } from './WorkspaceView';

const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const status: Record<string, string> = {draft:'작성 중',ready:'실행 준비',running:'실행 중',pending:'실행 대기',done:'완료',failed:'확인 필요'};

export function workspaceHome(entries: WorkspaceEntry[], loading: boolean): string {
  const active = entries.filter(e => !e.archived && !e.trashed && e.key !== 'web-ui-sample' && !e.key?.startsWith('demo:'));
  const projects = new Set(active.map(e => e.productId || e.key)).size;
  const running = active.filter(e => e.state === 'running' || e.state === 'pending').length;
  const finished = active.filter(e => e.state === 'done').length;
  const attention = active.filter(e => ['running','pending','draft','ready','failed'].includes(e.state)).slice(0, 4);
  const number = (value: number) => loading ? '—' : String(value);
  return `<div class="home-dashboard">
    <header class="home-intro"><div><span class="home-eyebrow">WORKSPACE</span><h2>안녕하세요,<br>오늘은 어떤 경험을 살펴볼까요?</h2><p>테스트를 시작하고, 남겨진 탐색 기록을 한곳에서 확인해 보세요.</p><div class="home-actions"><button type="button" class="ws-home-new" data-create-study data-new-product>＋ 새 앱·웹</button><button type="button" class="home-secondary" data-home-nav="projects">프로젝트 보기 <span aria-hidden="true">→</span></button></div></div><div class="home-intro-art" aria-hidden="true"><span class="home-art-orbit orbit-one"></span><span class="home-art-orbit orbit-two"></span><span class="home-art-card"><i></i><i></i><i></i><b>✳</b></span><span class="home-art-dot"></span></div></header>
    <section class="home-workspace" aria-labelledby="home-work-title"><div class="home-workspace-head"><div><span class="home-kicker">MY WORKSPACE</span><h3 id="home-work-title">내 프로젝트</h3><p>진행 중인 테스트를 이어서 확인하세요.</p></div><button type="button" data-home-nav="projects">전체 프로젝트 보기 <span aria-hidden="true">→</span></button></div><div class="home-workspace-body"><div class="home-work-list">${loading && !active.length ? '<p class="home-work-empty">프로젝트를 불러오는 중입니다.</p>' : attention.length ? attention.map(e=>`<button type="button" class="home-work-row" data-home-project="${esc(e.key)}"><span class="home-work-symbol" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 7V5h6l2 2h8v12H4z"/></svg></span><span class="home-work-name"><strong>${esc(e.name)}</strong><small>${esc(e.testTitle || '전반 탐색')}</small></span><span class="home-work-status" data-state="${esc(e.state)}">${esc(status[e.state] || '저장됨')}</span><span class="home-work-arrow" aria-hidden="true">↗</span></button>`).join('') : '<div class="home-work-empty"><strong>아직 이어서 볼 테스트가 없어요.</strong><span>새 앱·웹을 추가해 첫 탐색을 시작해 보세요.</span></div>'}</div><aside class="home-work-summary"><span>프로젝트 현황</span><div><span>전체 프로젝트</span><strong>${number(projects)}<small>개</small></strong></div><div><span>실행 중 · 대기</span><strong>${number(running)}<small>개</small></strong></div><div><span>완료된 테스트</span><strong>${number(finished)}<small>개</small></strong></div><p>보관함과 휴지통은 제외됩니다.</p></aside></div></section>
    <p class="home-footnote">PersonaLab · 서로 다른 시선으로 더 나은 경험을 발견하세요.</p>
  </div>`;
}
