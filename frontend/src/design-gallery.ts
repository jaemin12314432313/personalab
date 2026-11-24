type Screen = { title: string; hash: string; group: string; description: string; condition: string };

const screens: Screen[] = [
  { title: '랜딩', hash: 'landing', group: '시작', description: '서비스 소개와 시작 화면', condition: '공개' },
  { title: '로그인', hash: 'login', group: '시작', description: '이메일과 비밀번호로 로그인', condition: '로그아웃 필요' },
  { title: '회원가입', hash: 'register', group: '시작', description: '새 계정 만들기', condition: '로그아웃 필요' },
  { title: '공개 샘플 결과', hash: 'sample', group: '시작', description: '공개된 예시 결과 살펴보기', condition: '공개' },
  { title: '전체 흐름 체험', hash: 'demo', group: '시작', description: '서비스 흐름을 살펴보는 데모', condition: '공개' },
  { title: '워크스페이스', hash: 'workspace', group: '워크스페이스', description: '테스트 목록과 작업 현황', condition: '로그인 필요' },
  { title: '테스트 개요', hash: 'overview', group: '워크스페이스', description: '테스트의 진행과 결과 개요', condition: '실행 기록 필요' },
  { title: '화면 연결', hash: 'product', group: '테스트 설정', description: '탐색할 서비스와 화면 연결', condition: '로그인 필요' },
  { title: '화면 확인', hash: 'source-review', group: '테스트 설정', description: '연결한 화면과 탐색 범위 확인', condition: '이전 단계 필요' },
  { title: '대상 사용자', hash: 'panel', group: '테스트 설정', description: '대상 사용자의 특성 입력', condition: '이전 단계 필요' },
  { title: '참여 구성', hash: 'personas', group: '테스트 설정', description: '탐색에 참여할 페르소나 구성', condition: '이전 단계 필요' },
  { title: '탐색 범위', hash: 'scope', group: '테스트 설정', description: '기본 탐색과 집중 확인 범위 설정', condition: '이전 단계 필요' },
  { title: '탐색 실행', hash: 'run', group: '실행과 결과', description: '페르소나의 화면 탐색과 진행 상황', condition: '설정 완료 필요' },
  { title: '탐색 리포트', hash: 'report', group: '실행과 결과', description: '탐색 결과와 관찰 근거', condition: '실행 기록 필요' },
  { title: '1대1 인터뷰', hash: 'interview', group: '실행과 결과', description: '탐색한 페르소나와 후속 인터뷰', condition: '실행 기록 필요' },
  { title: '회차 비교', hash: 'compare', group: '실행과 결과', description: '수정 전후 실행 기록 비교', condition: '실행 기록 필요' },
];

const gallery = document.querySelector<HTMLElement>('#gallery')!;
const filters = document.querySelector<HTMLElement>('#filters')!;
const groups = ['전체', ...new Set(screens.map(screen => screen.group))];
let active = '전체';

function render() {
  filters.replaceChildren(...groups.map(group => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = group;
    button.setAttribute('aria-pressed', String(active === group));
    button.addEventListener('click', () => { active = group; render(); });
    return button;
  }));
  gallery.replaceChildren(...screens.filter(screen => active === '전체' || screen.group === active).map(screen => {
    const index = screens.indexOf(screen) + 1;
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `<div class="preview"><iframe loading="lazy" title="${screen.title} 미리보기" src="/#${screen.hash}" tabindex="-1"></iframe></div><div class="meta"><div class="top"><span class="num">${String(index).padStart(2, '0')} / ${screen.group}</span><span class="tag">${screen.condition}</span></div><h2>${screen.title}</h2><p>${screen.description}</p><a class="open" href="/#${screen.hash}" target="_blank" rel="noopener noreferrer">실제 화면 열기 ↗</a></div>`;
    return card;
  }));
}
render();

export {};
