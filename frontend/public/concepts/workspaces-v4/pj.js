/* 프로젝트 첫 화면 공통 동작. 실제 계정·DB·API·LLM과 연결하지 않고 이 페이지 메모리에서만 동작한다. */
(() => {
  const cfg = Object.assign({ searchHint: '', newHint: '' }, window.PL || {});
  if (cfg.layout) document.body.classList.add('l-' + cfg.layout);
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const esc = v => String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const TODAY = '2026-11-05';
  const EMPTY = new URLSearchParams(location.search).get('state') === 'empty';
  const ST = { setup: ['설정 중', '이어서 설정'], ready: ['실행 전', '실행 시작'], run: ['실행 중', '실행 확인'], done: ['완료', '결과 보기'], stop: ['중단됨', '부분 기록 보기'] };
  const fmt = iso => { const [, m, d] = iso.split('-'); return `${+m}월 ${+d}일`; };

  const KEY = 'pl-pj-demo-v2';
  const SEED = [
    { id: 1, name: '일정메이트', desc: '대학생 일정·과제 정리 앱', last: '온보딩 v3', sub: '13 / 20명 탐색 중', pct: 65, st: 'run', upd: '2026-11-05', ev: [['P563', 'S02 회원가입에서 멈췄어요', '방금'], ['P069', 'S03 학교·학년까지 도달', '1분 전'], ['P392', '홈까지 완료했어요', '3분 전']] },
  ];
  /* 만든 프로젝트·이름 변경·보관은 이 브라우저에 저장한다. 저장이 막혀도 화면은 그대로 동작한다. */
  let saved = null; if (!EMPTY) { try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { saved = null; } }
  let projects = EMPTY ? [] : (saved && Array.isArray(saved.projects) ? saved.projects : SEED.map(p => ({ ...p })));
  const persist = () => { if (EMPTY) return; try { localStorage.setItem(KEY, JSON.stringify({ projects, nid })); } catch { /* 저장 실패는 화면 동작에 영향 없음 */ } };
  let nid = saved && saved.nid || 6, query = '', sort = 'upd', entered = false, heroId = null, lastOrd = [];

  const P = '<svg class="brand-symbol" viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M5 3h12c7 0 11 4 11 10S24 23 17 23h-6v6H5V3Zm6 6v8h6c3.3 0 5-1.3 5-4s-1.7-4-5-4h-6Z"/></svg>';
  $('#app').innerHTML = `
  <header class="bar">
    <a class="logo" href="./index.html">${P}<span>PersonaLab</span></a>
    <span class="ws" title="현재 워크스페이스"><i>일</i>일정메이트 팀 <small>· 워크스페이스</small></span>
    <nav class="tabs" aria-label="기본 메뉴"><a href="#" aria-current="page">프로젝트</a><a href="#" data-toast="디자인 예시: 페르소나 보관함 · 만들어 둔 패널을 모아 봐요">페르소나 보관함</a><a href="#" data-toast="디자인 예시: 전체 실행 기록 · 모든 프로젝트의 실행을 시간순으로 봐요">전체 실행 기록</a></nav>
    <span class="sp"></span>
    <div class="acct"><button id="acctBtn" aria-haspopup="true" aria-expanded="false"><span class="t">계정·사용량·설정</span><span class="me">나</span></button>
      <div class="pop" id="pop" role="menu"><div class="who"><b>팀원님</b>member@example.com</div><div class="use">이번 달 탐색 38 / 100명<div class="m"><i></i></div>11월 30일 초기화</div><a href="#" data-toast="디자인 예시: 계정 정보">계정</a><a href="#" data-toast="디자인 예시: 사용량 · 플랜">사용량</a><a href="#" data-toast="디자인 예시: 팀 · 알림 · 기본 설정">설정</a><button data-toast="디자인 예시: 로그아웃">로그아웃</button></div></div>
  </header>
  <div class="deco" aria-hidden="true">${cfg.deco || ''}</div>
  <main class="wrap">
    <section class="head" id="head"><div><span class="eyebrow">일정메이트 팀</span><h1>${cfg.title || '프로젝트'}</h1><p class="sum" id="sum"></p></div>
      <div class="tools"><label class="search"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input id="q" type="search" placeholder="프로젝트 이름 검색" aria-label="프로젝트 이름 검색">${cfg.searchHint ? `<span class="kbd">${cfg.searchHint}</span>` : ''}</label><select class="sort" id="sort" aria-label="정렬"><option value="upd">최근 수정순</option><option value="name">이름순</option></select><button class="btn solid" data-new>+ 새 프로젝트${cfg.newHint ? ` <span class="kbd">${cfg.newHint}</span>` : ''}</button></div>
    </section>
    <section id="list" aria-label="프로젝트 목록">
      <div class="cols" aria-hidden="true"><span>프로젝트</span><span>마지막 테스트</span><span>상태</span><span>마지막 수정</span><span></span><span></span></div>
      <div id="rows" aria-live="polite"></div>
      <div class="count" id="count"></div>
    </section>
    <section class="first hide" id="first"><h2>첫 프로젝트를 만들어 볼까요?</h2><p>살펴보고 싶은 제품이나 서비스 이름만 있으면 시작할 수 있어요.</p><button class="btn solid" data-new>프로젝트 만들기 →</button></section>
  </main>
  <div class="scrim" id="scrim"><form class="dlg" id="dlg" role="dialog" aria-modal="true" aria-labelledby="dt"><h3 id="dt">새 프로젝트</h3><p>살펴볼 제품·서비스의 이름을 알려주세요. 테스트는 프로젝트 안에서 만들어요.</p>
    <label for="fn">제품·서비스 이름</label><input id="fn" maxlength="30" placeholder="예: 일정메이트" autocomplete="off">
    <label for="fd">짧은 설명 <span style="font-weight:450;color:var(--fg-3)">(선택)</span></label><input id="fd" maxlength="50" placeholder="예: 대학생 일정·과제 정리 앱" autocomplete="off">
    <div class="err" id="err" role="alert"></div><div class="r"><button type="button" class="btn" id="cancel">취소</button><button class="btn solid" type="submit">프로젝트 만들기</button></div></form></div>
  <div class="toast" id="toast" role="status"></div>
  <p class="foot-note">디자인 비교용 예시입니다. 프로젝트·테스트·수치는 가상이며 실제 계정·패널·DB·API·LLM과 연결되어 있지 않고, 이 브라우저에만 저장돼요. 첫 이용 화면은 <a href="?state=empty">?state=empty</a>. ${cfg.keys ? '단축키: ' + cfg.keys : ''}</p>`;

  let tm; const toast = m => { const e = $('#toast'); e.textContent = m; e.classList.add('on'); clearTimeout(tm); tm = setTimeout(() => e.classList.remove('on'), 2600); };

  const MENU = '<div class="menu" role="menu"><button data-a="edit">이름 바꾸기</button><button data-a="del">보관</button></div>';
  const DOTS = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
  function hero(p) {
    const [lab, btn] = ST[p.st];
    const ring = p.st === 'run' && p.pct
      ? `<div class="ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle class="rt" cx="60" cy="60" r="52"/><circle class="rv" cx="60" cy="60" r="52" pathLength="100" stroke-dasharray="${p.pct} 100"/></svg><b>${p.pct}<small>%</small></b><span>${esc(p.sub)}</span></div>`
      : `<div class="ring idle"><b>${lab}</b><span>${p.last ? esc(p.last) : '테스트 없음'}</span></div>`;
    const ev = p.ev ? `<ul class="ev" aria-label="실시간 기록">${p.ev.map(e => `<li><i></i><span><b>${esc(e[0])}</b> ${esc(e[1])}</span><time>${esc(e[2])}</time></li>`).join('')}</ul>` : '';
    const ix = lastOrd.findIndex(x => x.id === p.id);
    const nav = cfg.heroNav && lastOrd.length > 1 ? `<div class="h-nav"><button data-hero="prev" aria-label="이전 프로젝트">←</button><span>${ix + 1} / ${lastOrd.length}</span><button data-hero="next" aria-label="다음 프로젝트">→</button></div><div class="h-dots" aria-hidden="true">${lastOrd.map((x, k) => `<i class="${k === ix ? 'on' : ''}"></i>`).join('')}</div>` : '';
    return `<article class="row hero" data-id="${p.id}">${nav}<div class="h-left"><span class="stt ${p.st}"><i></i>${lab}</span><h2>${esc(p.name)}</h2><p>${p.desc ? esc(p.desc) : '설명 없음'}</p><div class="h-meta"><span>마지막 테스트 <b>${p.last ? esc(p.last) : '아직 없어요'}</b></span><span>${fmt(p.upd)} 수정</span></div>${p.insight ? `<div class="h-insight"><i></i>${esc(p.insight)}</div>` : ''}<div class="h-act"><button class="btn solid act" data-go>${btn}</button><button class="more" data-more aria-label="${esc(p.name)} 더 보기" aria-expanded="false">${DOTS}</button></div>${MENU}</div><div class="h-right">${ring}${ev}</div></article>`;
  }
  const boardHTML = items => '<div class="board mini">' + ['setup', 'ready', 'run', 'done', 'stop'].map(k => { const it = items.filter(p => p.st === k); return `<section class="colm" data-st="${k}"><header class="col-h"><span class="stt ${k}"><i></i>${ST[k][0]}</span><em>${it.length}</em></header>${it.map(row).join('') || '<div class="col-empty">비어 있어요</div>'}</section>`; }).join('') + '</div>';
  const restHTML = items => {
    if (!items.length) return '';
    const r = cfg.rest || 'list';
    const body = r === 'board' ? boardHTML(items) : `<div class="rest as-${r}">${items.map(row).join('')}</div>`;
    return `<div class="rest-slot"><div class="slot-t rest-t">다른 프로젝트</div>${body}</div>`;
  };
  function windowHTML(ord, h) {
    return `<div class="frame"><div class="win"><div class="win-bar"><strong>PersonaLab</strong><span>/ 일정메이트 팀</span><em class="demo">디자인 예시</em></div>
      <div class="win-tabs" role="tablist"><button class="on" role="tab" aria-selected="true">01 프로젝트</button><button role="tab" data-toast="디자인 예시: 페르소나 보관함">02 페르소나</button><button role="tab" data-toast="디자인 예시: 전체 실행 기록">03 실행 기록</button></div>
      <div class="win-body"><aside class="win-side"><div class="ws-t">프로젝트 ${ord.length}</div>${ord.map(p => `<button class="win-item ${p.id === h.id ? 'sel' : ''}" data-pick="${p.id}"><span class="stt ${p.st}"><i></i></span><span class="nm">${esc(p.name)}</span><small>${ST[p.st][0]}</small></button>`).join('')}</aside>
      <div class="win-main">${hero(h)}</div></div>
      <div class="win-foot"><span>프로젝트를 고르면 오른쪽에 자세히 보여요.</span><a href="#" data-new>+ 새 프로젝트</a></div></div></div>`;
  }
  function row(p, i) {
    const [lab, btn] = ST[p.st];
    const prog = p.st === 'run' && p.pct ? `<div class="prog" aria-hidden="true"><i style="width:${p.pct}%"></i></div>` : '';
    const COL = ['#6d5df6', '#f0883e', '#10b981', '#ec4899', '#0ea5e9', '#eab308'];
    const tile = cfg.tiles ? `<span class="tile" style="--c:${COL[p.id % COL.length]}" aria-hidden="true">${esc([...p.name][0])}</span>` : '';
    return `<article class="row" data-id="${p.id}" style="--i:${i}">
      <div class="p-name">${tile}<div class="pn"><b>${esc(p.name)}</b><span>${p.desc ? esc(p.desc) : '설명 없음'}</span></div></div>
      <div class="p-last ${p.last ? '' : 'none'}">${p.last ? `${esc(p.last)}<small>${esc(p.sub)}</small>${prog}` : '아직 테스트가 없어요'}</div>
      <div class="stt ${p.st}"><i></i>${lab}</div>
      <div class="p-date">${fmt(p.upd)}</div>
      <button class="btn act ${p.st === 'done' ? '' : 'solid'}" data-go>${btn}</button>
      <button class="more" data-more aria-label="${esc(p.name)} 더 보기" aria-expanded="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
      <div class="menu" role="menu"><button data-a="edit">이름 바꾸기</button><button data-a="del">보관</button></div></article>`;
  }
  function render() {
    const first = !projects.length;
    $('#first').classList.toggle('hide', !first); $('#head').classList.toggle('hide', first); $('#list').classList.toggle('hide', first);
    if (first) return;
    const l = projects.filter(p => !query || p.name.toLowerCase().includes(query.toLowerCase()));
    l.sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name, 'ko') : b.upd.localeCompare(a.upd) || b.id - a.id);
    const rows = $('#rows');
    const none = `<div class="none-r"><b>검색 결과가 없어요</b>다른 이름으로 찾아보세요.</div>`;
    const mode = cfg.layout || 'list';
    if (!l.length) rows.innerHTML = none;
    else if (mode === 'board') {
      rows.innerHTML = '<div class="board">' + ['setup', 'ready', 'run', 'done', 'stop'].map(k => { const it = l.filter(p => p.st === k); return `<section class="colm" data-st="${k}"><header class="col-h"><span class="stt ${k}"><i></i>${ST[k][0]}</span><em>${it.length}</em></header>${it.map(row).join('') || '<div class="col-empty">비어 있어요</div>'}</section>`; }).join('') + '</div>';
    } else if (mode === 'focus' || mode === 'master') {
      const pri = { run: 0, done: 1, stop: 1, ready: 2, setup: 3 };
      const ord = [...l].sort((x, y) => pri[x.st] - pri[y.st] || y.upd.localeCompare(x.upd));
      lastOrd = ord;
      const h = ord.find(p => p.id === heroId) || ord[0]; heroId = h.id;
      if (mode === 'master') rows.innerHTML = windowHTML(ord, h);
      else rows.innerHTML = `<div class="hero-slot"><div class="slot-t">${query ? '검색 결과' : '지금 가장 먼저 볼 프로젝트'}</div>` + hero(h) + '</div>' + restHTML(l.filter(p => p !== h));
    } else {
      rows.innerHTML = l.map(row).join('') + (cfg.newTile && !query ? '<button class="newtile" data-new><b>＋</b><span>새 프로젝트</span><small>제품·서비스 이름만 있으면 돼요</small></button>' : '');
    }
    if (!entered) { rows.setAttribute('data-enter', ''); $('#list').setAttribute('data-enter', ''); setTimeout(() => { rows.removeAttribute('data-enter'); $('#list').removeAttribute('data-enter'); }, 1400); entered = true; }
    $('#count').textContent = `프로젝트 ${projects.length}개` + (query ? ` 중 ${l.length}개` : '');
    const n = k => projects.filter(p => p.st === k).length;
    $('#sum').innerHTML = `<span>실행 중 <b>${n('run')}</b></span><span>설정 중 <b>${n('setup')}</b></span><span>실행 전 <b>${n('ready')}</b></span><span>완료 <b>${n('done')}</b></span>` + (n('stop') ? `<span>중단됨 <b>${n('stop')}</b></span>` : '');
    $$('[data-total]').forEach(e => e.textContent = String(projects.length).padStart(2, '0'));
  }
  const closeMenus = () => $$('.menu.on').forEach(m => { m.classList.remove('on'); m.parentElement.querySelector('.more').setAttribute('aria-expanded', 'false'); });
  const closePop = () => { $('#pop').classList.remove('on'); $('#acctBtn').setAttribute('aria-expanded', 'false'); };
  const sc = $('#scrim'), closeDlg = () => sc.classList.remove('on');
  function openDlg() { closeMenus(); closePop(); $('#err').textContent = ''; $('#fn').value = ''; $('#fd').value = ''; sc.classList.add('on'); setTimeout(() => $('#fn').focus(), 30); }

  document.addEventListener('click', e => {
    const T = e.target.closest('[data-toast]'); if (T) { e.preventDefault(); toast(T.dataset.toast); closePop(); return; }
    if (e.target.closest('#acctBtn')) { const on = !$('#pop').classList.contains('on'); closePop(); closeMenus(); if (on) { $('#pop').classList.add('on'); $('#acctBtn').setAttribute('aria-expanded', 'true'); } return; }
    if (e.target.closest('[data-new]')) { e.preventDefault(); openDlg(); return; }
    const mo = e.target.closest('[data-more]');
    if (mo) { const m = mo.parentElement.querySelector('.menu'), was = m.classList.contains('on'); closeMenus(); closePop(); if (!was) { m.classList.add('on'); mo.setAttribute('aria-expanded', 'true'); } return; }
    const a = e.target.closest('[data-a]');
    if (a) {
      const p = projects.find(x => x.id === +a.closest('.row').dataset.id), k = a.dataset.a; closeMenus();
      if (k === 'edit') { const n = prompt('프로젝트 이름', p.name); if (n && n.trim()) { p.name = n.trim().slice(0, 30); toast('이름을 바꿨어요'); } }
      if (k === 'del' && confirm(`“${p.name}” 프로젝트를 보관할까요? 보관한 프로젝트는 지워지지 않아요.`)) { projects = projects.filter(x => x !== p); toast('보관했어요'); }
      persist(); render(); return;
    }
    const hv = e.target.closest('[data-hero]');
    if (hv && lastOrd.length) { const k = lastOrd.findIndex(p => p.id === heroId); heroId = lastOrd[(k + (hv.dataset.hero === 'next' ? 1 : -1) + lastOrd.length) % lastOrd.length].id; render(); return; }
    const pk = e.target.closest('[data-pick]');
    if (pk) { heroId = +pk.dataset.pick; render(); return; }
    const g = e.target.closest('[data-go]');
    if (g) { const p = projects.find(x => x.id === +g.closest('.row').dataset.id); toast({ setup: '디자인 예시: 설정 단계로 이어서 이동', ready: '디자인 예시: 실행을 시작해요', run: '디자인 예시: 실행 중인 탐색을 확인해요', done: '디자인 예시: 결과·근거 화면으로 이동' }[p.st]); return; }
    closeMenus(); if (!e.target.closest('.acct')) closePop();
  });
  $('#q').addEventListener('input', e => { query = e.target.value.trim(); render(); });
  $('#sort').onchange = e => { sort = e.target.value; render(); };
  $('#cancel').onclick = closeDlg; sc.addEventListener('mousedown', e => { if (e.target === sc) closeDlg(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeDlg(); closeMenus(); closePop(); return; }
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
    if (typing || e.metaKey || e.ctrlKey || e.altKey) return;
    if (cfg.heroNav && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') && lastOrd.length) { const k = lastOrd.findIndex(p => p.id === heroId); heroId = lastOrd[(k + (e.key === 'ArrowRight' ? 1 : -1) + lastOrd.length) % lastOrd.length].id; render(); return; }
    if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
    if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openDlg(); }
  });
  $('#dlg').addEventListener('submit', e => {
    e.preventDefault(); const n = $('#fn').value.trim();
    if (!n) { $('#err').textContent = '제품·서비스 이름을 입력해 주세요.'; $('#fn').focus(); return; }
    if (projects.some(p => p.name === n)) { $('#err').textContent = '같은 이름의 프로젝트가 있어요.'; return; }
    projects.push({ id: nid++, name: n, desc: $('#fd').value.trim(), last: '', sub: '', st: 'setup', upd: TODAY });
    query = ''; $('#q').value = ''; sort = 'upd'; $('#sort').value = 'upd'; closeDlg(); persist(); render(); toast('프로젝트를 만들었어요. 이어서 설정해 보세요');
  });
  /* 마우스를 따라오는 스포트라이트 (시안이 --mx/--my를 사용하면 보인다) */
  document.addEventListener('pointermove', e => { const r = e.target.closest && e.target.closest('.row'); if (!r) return; const b = r.getBoundingClientRect(); r.style.setProperty('--mx', (e.clientX - b.left) + 'px'); r.style.setProperty('--my', (e.clientY - b.top) + 'px'); });
  render();
})();
