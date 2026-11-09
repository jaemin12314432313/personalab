# PersonaLab frontend-design v2 적용

공개 전체 데모: http://127.0.0.1:5173/#demo · 화면 연결부터 결과·기록 기반 인터뷰 예시까지 체험할 수 있다.

## 현재 연결 상태 (2026-11-02)

현재 진입점은 frontend/src/mockup/MockupApp.ts이며 로그인 후 워크스페이스로 이동한다.

- 실행 주소: http://127.0.0.1:5173/#workspace. 서버는 scripts/start-local.ps1, 설정 변경 후에는 -RestartBackend로 다시 시작한다.
- 모든 작업 자료는 이 프로젝트의 scratch, Python·DB는 .localtools/personalab에 있다. 다른 프로젝트 경로를 실행에 사용하지 않는다.
- 페르소나 보관함은 대학생·30대 사무직·40대·60세 이상 각 100명이다. /persona-library/panels와 /studies/{id}/panel/import를 화면에 연결했다.
- 기본 선택은 보관함 재사용이다. 원본 카드/특성/출처를 테스트별 스냅샷으로 복사한다. 새 조건 엔진 생성은 별도 선택이다.
- 서버 .env의 LLM_PROVIDER=openai, LLM_MODEL=gpt-5.4-mini, LLM_API_KEY를 사용한다. 키는 프론트·API 응답·로그에 노출하지 않는다. 설정 도구는 scripts/configure-llm.py의 숨김 입력이다.
- OpenAI Responses의 strict JSON Schema, 서버 측 형식/버튼/이탈 이유 검증, 타임아웃·출력 한도·최대 3회 재시도를 사용한다. 결제/키/권한 오류는 즉시 중단한다.
- 새 프론트는 기획 의견 Ask나 Q6 가격 질문을 자동 실행하지 않고 Act만 시작한다. 기존 Ask API와 이력은 호환용으로 남긴다.
- 실행 화면은 서버에서 저장한 페르소나별 Act 기록을 받아 재생한다. 일시정지는 화면 재생만 멈춘다. 결과는 개별 경로·이유·종료 유형과 미확인 화면을 표시한다.
- 등록된 화면 설명과 버튼 연결에 대한 탐색이다. Figma는 서버 연결 키로 화면 텍스트·클릭 연결을 가져오며 폼 또는 JSON으로 직접 편집할 수 있다. 실제 계정 호출 검증은 남아 있다. 실제 이미지 분석·브라우저 조작·전반 탐색 계획·LLM 1대1 인터뷰는 남아 있다. #demo에는 외부 호출 없는 기록 기반 인터뷰 예시가 있다.
- 실행한 입력은 고정하고 수정본은 새 테스트로 복사한다. 재접속 시 기존 실행 ID로 저장된 결과를 조회한다. 계정 변경 뒤 늦은 응답은 적용하지 않는다.

검증: 백엔드 86개, 프론트 26개, 프로덕션 빌드 통과. OpenAI의 일반 JSON 응답을 실제로 받았다. 원본 카드 3명과 검증 화면의 전송 검증은 자동 승인 검토에서 중단됐고, 사용자가 실제 카드 전송을 보류했다. 현재 ALLOW_PERSONA_TRANSMISSION=false이며 API의 실행 생성, 실행기, Act/Ask의 모델 호출 직전에서 차단한다. 화면에서도 실행을 비활성화한다. 보관함 선택·테스트 스냅샷 저장·기존 결과 조회는 가능하다. 전송 검토 파일은 scratch/connect-agents/LIVE_PROMPT_PREVIEW.json이다.

공식 API 근거: https://developers.openai.com/api/docs/guides/structured-outputs
모델 근거: https://developers.openai.com/api/docs/models/gpt-5.4-mini

아래 내용은 이전 Studio 구현의 기록이다.

복구한 `round2/frontend-design-v2`를 기준으로 기존 React 앱의 진입 화면을 교체했다. 기존 `App.tsx`와 컴포넌트는 보존되어 있고, 현재 진입점은 `src/studio/StudioApp.tsx`다.

## 실행

```powershell
cd frontend
npm ci
npm run dev -- --host 127.0.0.1 --port 5173
```

랜딩 → 스터디 목록 → 제품 기획 → 프로토타입 → 페르소나 패널 → Ask·Act 실행 → 리포트 순서다. `#/study/recorded-demo-v2/5`에서 복구한 데모 기록을 볼 수 있다.

## 엔진 연결

Vite가 `/api`를 `http://127.0.0.1:8000`으로 전달한다. 다른 백엔드 주소를 사용하려면 프론트 실행 환경에 `PERSONALAB_API_URL`을 설정한다.

백엔드 의존성은 `backend/requirements.txt`에 Persona Engine 의존성을 포함한다. 기존 개발계획서의 DB 준비·Alembic 마이그레이션 절차를 수행하고, 저장소 루트 `.env`의 LLM 설정 및 `data/raw`의 원본 조사 데이터를 준비한다. 실제 키는 소스에 넣지 않는다.

`GET /capabilities`는 키의 유무, 원본 데이터 파일 및 페르소나 패키지 준비 상태만 반환한다. 비밀값을 반환하거나 유료 LLM을 호출하지 않는다. 최초 실제 샘플링 시 NVIDIA 데이터가 로드되므로 로컬 캐시·외부 접근도 필요하다.

- `services/persona/sample.py`: 데이터팀 `data/persona_engine/src/api.py`의 `generate()`로 연결. `src` 이름 충돌을 막기 위해 별도 패키지 이름으로 로드한다.
- `services/ask/answer.py`: 기존 공용 LLM 호출기를 사용한다. 프롬프트에 숫자 특성 대신 `card_text`를 전달하고 응답을 검증한다.
- `services/act/decide.py`: 공용 LLM 호출기로 현재 화면의 행동을 결정한다. 미래 화면·버튼의 도착지는 관찰에 포함하지 않는다. 기존 `loop.py`의 종료 조건은 유지한다.
- 전체 흐름을 한 번에 읽는 `data/ux_eval` 도구는 Act 실행과 구분해 보존했다.

## 저장과 해석

브라우저의 `personalab-studio-v2-studies` 키에 새 초안·수신 결과를 저장한다. 기존 앱의 브라우저 저장 데이터와 키를 공유하지 않는다. 실제 실행 기록은 기존 DB 스키마로 저장한다.

실행 시작 후 제품·과제·패널 입력을 고정한다. 수정안은 새 스터디로 복제한다. 실행 ID를 저장하므로 화면을 새로 열었을 때 진행률 확인을 재개할 수 있다. 서버 실행 중의 버튼을 취소 기능으로 오인하게 하지 않는다.

복구한 5명 데모는 저장된 기록으로 표시하며 신규 생성·실측 결과로 표시하지 않는다. 이 기록의 의향·완료 격차는 0%p이고 개인별 우려와 이탈 이유가 다른 사례는 2명이다. 원본에 없는 개별 기능 선택 데이터는 재구성하지 않았다.

실제 참가자 수집과 오차 계산은 현재 API에 없으므로 미수집 상태로 표시한다. 실제 참가자의 Q5·Q6 저장과 실행 연결 방식은 `DECISIONS.md`의 기존 미결 사항이다. DB 스키마와 8개 이탈 코드는 변경하지 않았다.

## 검증

```powershell
cd frontend
npm run build
node --test tests/studio-model.test.mjs tests/studio-render.test.mjs
```

백엔드의 추가 테스트는 `tests/test_engine_connections.py`에 있다. 외부 API나 데이터 다운로드 없이 카드 전달, 관찰 범위, 버튼 검증을 확인한다. 기존 API 통합 테스트는 외부 서비스를 대체한 테스트 의존성을 사용한다. DB 통합 테스트에는 원래처럼 마이그레이션된 테스트 DB가 필요하다.
