# Workspace concepts — 2026-11-05

사용자 요청: 기존 글꼴을 유지하고 실리콘밸리 B2B 제품 같은 워크스페이스 첫 화면 3개를 별도로 비교한다. 고정 사이드바 없이 구성한다.

- A / Orbit: Attio와 Linear의 정돈된 상단 도구·상태별 목록. 흰색 바탕, 얇은 구분선, 최근 작업과 다음 행동.
- B / Frame: Resend와 Vercel의 명암 대비 및 작업 맥락. 짙은 헤더, 이어갈 작업, 결과로 이동하는 카드.
- C / Canvas: Figma와 Airtable의 썸네일·최근 작업. 밝은 캔버스, 실제 화면처럼 구성한 가상 웹 미리보기, 테스트 갤러리.

Pretendard Variable을 기본으로 유지한다. 모든 테스트와 화면은 디자인 예시이며 실제 계정/패널/DB/API/LLM과 연결하지 않는다. 개인정보·원본 카드·인증 상태를 읽지 않는다. 기존 앱과 공유 배포는 수정하지 않는다. 검색·상태 필터·정렬·가상 테스트 추가·상세 확인·첫 이용 상태를 로컬 메모리에서 제공한다. 페르소나 사진은 기존 공개 랜딩의 AI 생성 가상 인물 이미지만 재사용한다. 완료된 일정메이트는 기존 공개 데모의 결과 보기로 연결한다.

공식 레퍼런스:
- https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace
- https://linear.app/changelog/2024-06-17-a-new-home-for-your-projects
- https://resend.com/blog/rebranding-resend
- https://vercel.com/changelog/dashboard-navigation-redesign-rollout
- https://help.figma.com/hc/en-us/articles/14381406380183-Guide-to-the-file-browser
- https://support.airtable.com/articles/6915359572-airtable-home-screen

검증: 로컬 HTTP, JS 문법, CSS 파싱, 검색/필터/추가/빈 상태/상세 동작. 브라우저 화면 확인은 사용 가능한 미리보기 도구로 수행한다.

검증 결과:
- workspace.js / gallery.js 문법 검사 통과.
- workspace.css 424개 노드, gallery.css 33개 노드 PostCSS 파싱 통과.
- 세 시안의 검색, 상태 필터, 검색 결과 없음, 상세 팝업, 첫 이용 상태, 테스트 추가, 입력 HTML 이스케이프, 페르소나 예시, 카드/목록 전환 검사 통과.
- 실제 fetch 호출 0, 기존 인증 저장소 변경 없음.
- 비교 페이지·세 시안·빈 화면·CSS·JS·공개 가상 인물 이미지 HTTP 200 확인.
- 브라우저 자동화가 Windows의 현재 URL을 확인하지 못해 중단됨. 이후 UI 조작을 하지 않았으며 실제 화면 캡처·반응형 렌더 검증은 완료하지 못함.

로컬 비교: http://127.0.0.1:5173/concepts/workspaces-v3/index.html
## B refinement — 2026-11-05

사용자 피드백: B의 명암 방향은 선호하지만 레퍼런스 수준의 완성도가 부족함.
개선안은 별도 refined.html?view=frame2로 제공한다. 기존 A/B/C는 유지한다.
- 큰 인사말 대신 워크스페이스 제목과 테스트/페르소나 탭을 먼저 배치.
- 고정 사이드바 없이 짙은 상단 맥락과 흰색 작업면으로 구분.
- 장식용 웹 미리보기 대신 실제 설정 단계와 다음 행동을 표시.
- 목록의 이름, 상태, 다음 행동을 선명하게 표시하고 핵심 텍스트를 14~17px로 확대.
- 기존과 같은 디자인 예시 데이터, 로컬 메모리 동작만 사용. 실계정/DB/LLM 연결 없음.
B 개선안 검증:
- 원래 A/B/C와 새 frame2의 검색·필터·상세·설정 미리보기·빈 화면·테스트 추가·HTML 이스케이프·페르소나 이동·목록 전환·저장소 격리 검사 통과.
- 개선 CSS 168개 노드 파싱, JS 문법, refined.html/refined.css HTTP 200 확인.
- 브라우저 화면 캡처 검증은 앞서 발생한 현재 URL 확인 제한으로 수행하지 못함. 자동 UI 조작을 재시도하지 않음.
- 완료된 예시가 없는 상태에는 최근 완료로 표시하지 않고 공개 샘플 안내를 표시함.