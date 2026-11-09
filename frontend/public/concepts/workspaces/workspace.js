const params = new URLSearchParams(location.search);
const variant = ['a','b','c'].includes(params.get('design')) ? params.get('design') : 'a';
document.body.className = `design-${variant}${params.has('mini') ? ' miniature' : ''}`;
const names = {a:'Studio',b:'Collection',c:'Desk'};
const icon = (name) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">${({grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',people:'<path d="M3 21v-3a5 5 0 0 1 10 0v3m2-18a4 4 0 0 1 0 8m3 3a5 5 0 0 1 3 4v3"/><circle cx="8" cy="7" r="4"/>',search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 6 6"/>',arrow:'<path d="M4 12h16m-6-6 6 6-6 6"/>',plus:'<path d="M12 4v16M4 12h16"/>',book:'<path d="M12 5v16M3 3c5 0 9 2 9 2s4-2 9-2v16c-5 0-9 2-9 2s-4-2-9-2V3Z"/>'})[name]}</svg>`;
const brand = '<a class="brand" href="/concepts/people/index.html"><svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" fill-rule="evenodd" d="M5 3h12c7 0 11 4 11 10S24 23 17 23h-6v6H5V3Zm6 6v8h6c3.3 0 5-1.3 5-4s-1.7-4-5-4h-6Z"/></svg><span>PersonaLab</span></a>';
const tests = [
 {id:'schedule',name:'일정메이트',desc:'가입 흐름에서 멈춘 이유 살펴보기',status:'완료',tag:'온보딩 · 가입',screens:5,people:5,tone:'sage'},
 {id:'store',name:'오브제 스토어',desc:'상품 탐색과 장바구니 흐름',status:'작성 중',tag:'상품 탐색',screens:8,people:0,tone:'peach'},
 {id:'note',name:'데일리 노트',desc:'첫 화면과 기록 만들기',status:'작성 중',tag:'첫 사용 경험',screens:6,people:0,tone:'lilac'},
];
const people = [{id:'P938',age:32},{id:'P069',age:29},{id:'P392',age:27},{id:'P563',age:34},{id:'P374',age:27}];
let section='tests', filter='all', query='', empty=false;
document.getElementById('app').innerHTML = `
 <div class="design-bar"><a href="index.html">← 시안 모아보기</a><div class="variant-switch" aria-label="시안 전환">${['a','b','c'].map(v=>`<a href="?design=${v}" ${v===variant?'aria-current="page"':''}>${v.toUpperCase()} <span>${names[v]}</span></a>`).join('')}</div><span class="preview-label">디자인 시안 · 예시 데이터</span></div>
 <div class="app-shell"><aside class="sidebar">${brand}<div class="space-name"><span class="space-icon">P</span><div>내 워크스페이스<small>Personal workspace</small></div></div><nav aria-label="워크스페이스 메뉴"><button data-section="tests" class="selected">${icon('grid')}내 테스트<span>3</span></button><button data-section="people">${icon('people')}페르소나<span>5</span></button><a href="/concepts/people/index.html#how">${icon('book')}이용 가이드</a></nav><div class="side-bottom"><p>서로 다른 시선으로,<br>더 나은 화면을.</p><a href="/#workspace"><span class="account-icon">나</span><span>실제 워크스페이스<small>내 계정으로 이동 ↗</small></span></a></div></aside>
 <div class="main-shell"><header class="workspace-bar"><span id="breadcrumb">워크스페이스 / 내 테스트</span><div><button class="text-button" id="empty-toggle" aria-pressed="false">빈 화면 보기</button><a href="/#workspace" class="account-link">내 계정 ↗</a></div></header><main>
 <div class="page-heading"><div><span class="eyebrow">YOUR WORKSPACE</span><h1 id="page-title">${variant==='b'?'좋은 경험을 만드는 곳.':'내 테스트'}</h1><p id="page-description">다른 시선으로 살펴보고, 다음 수정을 결정하세요.</p></div><button class="primary" data-new>${icon('plus')}새 테스트</button></div>
 <section class="welcome"><div class="welcome-copy"><span class="eyebrow">A NEW PERSPECTIVE</span><h2>어떤 화면을<br>살펴볼까요<span>?</span></h2><p>프로토타입을 연결하고,<br>우리 사용자와 닮은 페르소나를 만나보세요.</p><button class="text-link" data-new>새로운 탐색 시작하기 ${icon('arrow')}</button></div><div class="flow-illustration" aria-label="프로토타입에서 탐색 기록으로"><div class="screen-paper"><span class="paper-brand">일정메이트</span><strong>반가워요.<br>함께 시작해요.</strong><i></i><i></i><span class="paper-cta">시작하기 →</span></div><span class="flow-arrow">→</span><div class="persona-stack">${people.slice(0,3).map((p,i)=>`<span class="portrait" style="--pos:${i*25}%" aria-label="AI 가상 인물"></span>`).join('')}<span class="stack-note">서로 다른 5개의 시선</span></div><div class="trace-note"><span>탐색 기록</span><strong>첫 화면에서<br>다음 선택까지.</strong><span class="trace-path">S01 ─── S02</span></div></div></section>
 <div class="content-layout"><section class="collection"><div class="collection-tools"><div class="filters" role="group" aria-label="테스트 상태"><button data-filter="all" aria-pressed="true">전체 <span>3</span></button><button data-filter="작성 중" aria-pressed="false">작성 중 <span>2</span></button><button data-filter="완료" aria-pressed="false">완료 <span>1</span></button></div><label class="search">${icon('search')}<input id="search" type="search" placeholder="테스트 검색" aria-label="테스트 검색"></label></div><div id="collection-content" aria-live="polite"></div></section><aside class="insight"><div class="insight-heading"><span class="eyebrow">RECENT RECORD</span><span>↗</span></div><h2>멈춘 곳에,<br>이유가 있어요.</h2><span class="small-label">일정메이트 · 저장된 AI 데모</span><div class="insight-route"><span>S01<small>온보딩</small></span><i>→</i><span>S02<small>회원가입</small></span></div><blockquote>“개인정보를 너무 많이 입력하라고 해서 찝찝하니까 그만둘래.”</blockquote><div class="quote-person"><span class="portrait" style="--pos:50%"></span><span>P392<small>27세 직장인 · AI 페르소나</small></span></div><a class="text-link" href="/#sample">탐색 기록 보기 ${icon('arrow')}</a></aside></div><footer class="workspace-foot"><span>PERSONALAB / ${names[variant].toUpperCase()}</span><span>화면 배치용 예시입니다. 실제 테스트는 내 계정에서 시작하세요.</span></footer>
 </main></div></div>`;
function testCard(t){return `<button class="test-card ${t.tone}" data-test="${t.id}"><div class="card-art"><span class="art-label">${t.tag}</span><div class="mini-app"><span>${t.name}</span><strong>${t.id==='schedule'?'나의 일정을,<br>조금 더 가볍게.':t.id==='store'?'취향이 머무는<br>작은 물건들.':'오늘을 남기는<br>나만의 공간.'}</strong><div class="mini-lines"><i></i><i></i><i></i></div></div><span class="art-number">0${tests.indexOf(t)+1}</span></div><div class="card-body"><div class="card-title"><h3>${t.name}</h3><span class="status ${t.status==='완료'?'done':''}">${t.status}</span></div><p>${t.desc}</p><div class="card-meta"><span>화면 ${t.screens}개 · ${t.people?`AI ${t.people}명`:'패널 미선택'}</span><span class="card-action">${t.status==='완료'?'결과 보기':'이어서 설정'} ↗</span></div></div></button>`;}
function render(){
 const isPeople=section==='people';
 document.getElementById('breadcrumb').textContent=`워크스페이스 / ${isPeople?'페르소나':'내 테스트'}`;
 document.getElementById('page-title').textContent=isPeople?'다섯 개의 다른 시선.':variant==='b'?'좋은 경험을 만드는 곳.':'내 테스트';
 document.getElementById('page-description').textContent=isPeople?'저장된 AI 데모에 참여한 페르소나를 살펴보세요.':'다른 시선으로 살펴보고, 다음 수정을 결정하세요.';
 document.querySelector('.welcome').hidden=isPeople||empty;
 document.querySelector('.insight').hidden=isPeople||empty;
 document.querySelector('.content-layout').classList.toggle('full-width',isPeople||empty);
 document.querySelector('.filters').hidden=isPeople;
 const search=document.getElementById('search');search.placeholder=isPeople?'페르소나 ID 검색':'테스트 검색';search.setAttribute('aria-label',search.placeholder);
 document.querySelectorAll('[data-section]').forEach(b=>{const selected=b.dataset.section===section;b.classList.toggle('selected',selected);if(selected)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current');});
 document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
 const container=document.getElementById('collection-content');
 if(empty){container.innerHTML='<div class="empty-state"><span>↗</span><h2>첫 번째 시선을 만나보세요.</h2><p>프로토타입을 등록하면 이곳에 테스트가 모입니다.</p><button class="primary" data-new>첫 테스트 만들기 →</button></div>';return;}
 if(isPeople){const found=people.filter(p=>`${p.id} ${p.age}`.toLowerCase().includes(query));container.innerHTML=found.length?`<div class="people-grid">${found.map(p=>`<button class="person-card" data-person="${p.id}"><span class="person-photo" style="--pos:${people.indexOf(p)*25}%"></span><strong>${p.id}<span>↗</span></strong><p>${p.age}세 직장인</p><small>일정메이트 · AI 데모</small></button>`).join('')}</div>`:'<p class="no-results">검색 결과가 없습니다.</p>';return;}
 const found=tests.filter(t=>(filter==='all'||t.status===filter)&&`${t.name} ${t.desc}`.toLowerCase().includes(query));
 container.innerHTML=found.length?`<div class="test-grid">${found.map(testCard).join('')}</div>`:'<p class="no-results">검색 결과가 없습니다. 다른 이름이나 상태를 선택해 보세요.</p>';
}
const dialog=document.getElementById('detail');
let lastFocus;
function show(content){lastFocus=document.activeElement;document.getElementById('detail-content').innerHTML=content;dialog.showModal();}
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.section){section=b.dataset.section;query='';document.getElementById('search').value='';render();}
 if(b.dataset.filter){filter=b.dataset.filter;render();}
 if(b.id==='empty-toggle'){empty=!empty;b.setAttribute('aria-pressed',String(empty));b.textContent=empty?'예시 데이터 보기':'빈 화면 보기';render();}
 if(b.hasAttribute('data-new'))show('<h2>새 테스트를 시작할까요?</h2><p>여기는 디자인을 비교하는 시안이에요.<br>실제 워크스페이스에서 프로토타입을 등록하고 테스트를 만들 수 있어요.</p><a class="primary" href="/#workspace">내 워크스페이스로 →</a>');
 if(b.dataset.test){const t=tests.find(t=>t.id===b.dataset.test);show(`<span class="small-label">${t.status==='완료'?'저장된 AI 데모':'화면 배치용 예시'}</span><h2>${t.name}</h2><p>${t.desc}</p><div class="dialog-facts"><span>화면 <strong>${t.screens}개</strong></span><span>상태 <strong>${t.status}</strong></span></div><p>${t.status==='완료'?'AI 5명이 S01에서 S02로 이동한 뒤 회원가입에서 중단한 기록입니다.':'이 테스트는 디자인 비교를 위한 예시이며 계정에 저장되지 않습니다.'}</p><a class="primary" href="/#${t.status==='완료'?'sample':'workspace'}">${t.status==='완료'?'저장된 샘플 결과 보기':'내 워크스페이스에서 시작'} →</a>`);}
 if(b.dataset.person){const p=people.find(p=>p.id===b.dataset.person);show(`<span class="small-label">AI 페르소나 · 가상 인물 이미지</span><h2>${p.id}</h2><p>${p.age}세 직장인 · 일정메이트 데모에 참여</p><div class="dialog-facts"><span>탐색 경로 <strong>S01 → S02</strong></span><span>중단 화면 <strong>회원가입</strong></span></div><p>개별 탐색 기록과 중단 이유는 저장된 샘플 결과에서 확인할 수 있어요.</p><a class="primary" href="/#sample">샘플에서 기록 보기 →</a>`);}
 if(b.hasAttribute('data-close'))dialog.close();
});
dialog.addEventListener('close',()=>lastFocus?.focus());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
document.getElementById('search').addEventListener('input',e=>{query=e.target.value.trim().toLowerCase();render();});
render();
