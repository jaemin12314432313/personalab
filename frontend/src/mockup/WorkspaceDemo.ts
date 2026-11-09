import type { WorkspaceEntry, WorkspacePerson, WorkspaceFinding, WorkspaceRound } from './WorkspaceView';

/** 디자인 확인용 예시. 주소에 ?demo=1 이 있는 그 화면에서만 켜지며 어디에도 저장하지 않는다.
 *  예전에는 켜 두면 브라우저에 계속 남아 실제 테스트 목록을 통째로 가렸다(만든 테스트가 안 보이던 원인). */
export function demoEnabled() {
  if (!import.meta.env.DEV) return false;
  try {
    localStorage.removeItem('wsDemo'); // 예전에 저장돼 남은 켜짐 상태를 지운다
    return new URLSearchParams(location.search).get('demo') === '1';
  } catch { return false; }
}

const X = [5, 27.5, 50, 72.5, 95];
const face = (i: number) => `<span class="ws-face-strip" style="--x:${X[i % 5]}%" aria-hidden="true"></span>`;
const P = (i: number, id: string, age: number, job: string, lane: 0 | 1 | 2 | 3, quote: string, screen: string, actions: number, refs: number): WorkspacePerson => ({ id, age, job, face: face(i), lane, quote, screen, actions, refs });
const F = (title: string, screen: string, people: number, total: number, kind: WorkspaceFinding['kind']): WorkspaceFinding => ({ title, screen, people, total, kind });
const R = (label: string, state: WorkspaceRound['state'], stateLabel: string, date: string, findings: WorkspaceFinding[] = []): WorkspaceRound => ({ label, state, stateLabel, date: state === 'draft' ? date : date + 'T10:30:00', dateKind: state === 'draft' || state === 'ready' ? 'created' : 'started', people: 6, findings });
const base = { manageable: false, source: '디자인 확인용 예시' };

export function demoEntries(): WorkspaceEntry[] {
  return [
    { ...base, key: 'demo:1', name: '동네예약 앱', description: '예약하기 버튼이 눈에 띄는지 보는 회차예요.', state: 'running', local: 'demo-1', rounds: 3, kind: 'iOS 앱 · 모바일', screens: 8, personas: 6, records: 2,
      people: [P(1, 'P-12', 36, '디자이너', 0, '아직 시작하지 않았어요', '', 0, 0), P(0, 'P-03', 34, '자영업자', 1, '예약하기 버튼을 찾으려고 두 번 스크롤했어요', '홈', 8, 3), P(1, 'P-07', 27, '대학생', 1, '시간 선택에서 뒤로 가기를 눌렀어요', '시간 선택', 5, 2), P(2, 'P-11', 41, '교사', 1, '필터가 무슨 뜻인지 몰라 멈췄어요', '매장 목록', 3, 1), P(3, 'P-02', 52, '주부', 2, '예약 확인 화면에서 종료했어요', '예약 확인', 6, 2), P(4, 'P-09', 30, '직장인', 2, '예약하기까지 도달했어요', '예약하기', 4, 1)],
      roundList: [
        R('R1', 'done', '완료', '2026-11-03', [F('예약하기 버튼이 아래에 있어 찾기 어려움', '홈', 4, 6, 'new'), F('시간 선택에서 뒤로 가기 반복', '시간 선택', 3, 6, 'new'), F('매장 필터 의미가 불명확함', '매장 목록', 2, 6, 'new')]),
        R('R2', 'done', '완료', '2026-11-05', [F('예약하기 버튼이 아래에 있어 찾기 어려움', '홈', 3, 6, 'rep'), F('시간 선택에서 뒤로 가기 반복', '시간 선택', 4, 6, 'rep'), F('매장 필터 의미가 불명확함', '매장 목록', 2, 6, 'rep'), F('결제 안내 문구에서 멈춤', '예약 확인', 2, 6, 'new')]),
        R('R3', 'running', '실행 중', '2026-11-07', [F('시간 선택에서 뒤로 가기 반복', '시간 선택', 2, 6, 'rep'), F('매장 필터 의미가 불명확함', '매장 목록', 1, 6, 'rep'), F('결제 안내 문구에서 멈춤', '예약 확인', 1, 6, 'rep'), F('예약하기 버튼 위치', '홈', 0, 6, 'gone')]),
      ] },
    { ...base, key: 'demo:2', name: '쇼핑몰 결제 개선', description: '결제 단계 문구를 고친 회차예요.', state: 'done', local: 'demo-2', rounds: 3, kind: '웹 서비스', screens: 12, personas: 6, records: 6,
      people: [P(1, 'P-04', 27, '대학생', 2, '카드 입력란에서 멈췄어요', '결제', 9, 4), P(3, 'P-06', 41, '교사', 2, '쿠폰 위치를 못 찾았어요', '결제', 7, 3), P(4, 'P-08', 30, '직장인', 2, '결제 완료까지 도달했어요', '완료', 5, 2)],
      roundList: [R('R1', 'done', '완료', '2026-11-01', [F('카드 입력란에서 멈춤', '결제', 3, 6, 'new'), F('쿠폰 위치가 불명확함', '결제', 2, 6, 'new')]), R('R2', 'done', '완료', '2026-11-04', [F('카드 입력란에서 멈춤', '결제', 3, 6, 'rep'), F('쿠폰 위치가 불명확함', '결제', 2, 6, 'rep'), F('영수증 안내가 부족함', '완료', 2, 6, 'new')]), R('R3', 'done', '완료', '2026-11-06', [F('카드 입력란에서 멈춤', '결제', 2, 6, 'rep'), F('쿠폰 위치가 불명확함', '결제', 3, 6, 'rep'), F('영수증 안내가 부족함', '완료', 1, 6, 'rep'), F('배송지 입력 오류 안내', '결제', 2, 6, 'new')])] },
    { ...base, key: 'demo:3', name: '온보딩 프로토타입', description: '3단계 대상 사용자에서 멈췄어요.', state: 'draft', local: 'demo-3', rounds: 1, step: 2, kind: 'Figma 시안', screens: 5, personas: 0, people: [], roundList: [{ label: 'R1', state: 'draft', stateLabel: '작성 중', date: '2026-11-07' }] },
    { ...base, key: 'demo:4', name: '학원 관리 대시보드', description: '로그인에서 막혀 3명만 저장됐어요.', state: 'failed', local: 'demo-4', rounds: 1, kind: '웹 서비스', screens: 6, personas: 6, records: 3,
      people: [P(0, 'P-01', 34, '자영업자', 2, '로그인 화면에 도착했어요', '로그인', 3, 1), P(2, 'P-04', 27, '대학생', 2, '이메일 입력 후 차단됐어요', '로그인', 4, 1), P(3, 'P-06', 41, '교사', 3, '로그인 후 화면에 접근하지 못했어요', '로그인', 2, 1)],
      roundList: [R('R1', 'failed', '중단', '2026-11-04', [F('로그인 후 화면에 접근할 수 없음', '로그인', 3, 6, 'new')])] },
    { ...base, key: 'demo:5', name: '병원 예약 웹', description: '6명 구성과 화면 14개가 준비됐어요.', state: 'ready', local: 'demo-5', rounds: 2, step: 5, kind: '웹 서비스', screens: 14, personas: 6,
      people: [P(2, 'P-05', 41, '교사', 0, '', '', 0, 0), P(4, 'P-09', 30, '직장인', 0, '', '', 0, 0), P(1, 'P-07', 27, '대학생', 0, '', '', 0, 0)],
      roundList: [R('R1', 'done', '완료', '2026-10-30', [F('진료과 선택이 어려움', '홈', 3, 6, 'new'), F('예약 시간 안내 부족', '예약', 2, 6, 'new')]), R('R2', 'ready', '준비 완료', '2026-11-05')] },
    { ...base, key: 'demo:6', name: '가계부 앱', description: '있는 기록으로만 결과를 봐요.', state: 'failed', local: 'demo-6', rounds: 1, kind: 'Android 앱 · 모바일', screens: 7, personas: 6, records: 4,
      people: [P(3, 'P-02', 52, '주부', 2, '지출 입력에서 멈췄어요', '입력', 6, 2), P(0, 'P-03', 34, '자영업자', 2, '카테고리 선택을 마쳤어요', '카테고리', 4, 1)],
      roundList: [R('R1', 'partial', '부분 기록', '2026-11-02', [F('지출 입력에서 멈춤', '입력', 2, 6, 'new')])] },
  ];
}
