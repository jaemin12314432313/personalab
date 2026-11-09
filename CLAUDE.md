# PersonaLab

AI 페르소나 기반 UI·UX 탐색과 후속 인터뷰 플랫폼

> 화면은 같아도, 경험은 다르니까.

프로토타입을 여러 AI 페르소나의 시선으로 탐색하고, UI·UX 문제와 근거를 확인한 뒤
같은 페르소나와 1대1 인터뷰로 이어지는 서비스를 만든다. 기본은 전반 탐색이며 집중 확인은 선택이다.
기획 의견·사용 의향·기능 선호·지불 의향 조사는 현재 제품 범위에서 제외한다.

---

## 필수 참조

**작업 전 `docs/DEVELOPMENT_PLAN.md`의 방향 변경 항목과 `docs/UX_WORKFLOW.md`를 먼저 읽을 것.**
`UX_WORKFLOW.md`에서 현재 구현과 앞으로 구현할 목표를 구분한다. 기존 Ask는 기획 응답 이력이며 후속 인터뷰 기능이 아니다.

| 작업 영역 | 참조할 장 |
| --- | --- |
| DB 스키마 | 9장 |
| API 엔드포인트 | 10장 |
| Persona 생성 | 6장 |
| Ask 모드 프롬프트 | 7장 |
| Act 모드 Agent Loop | 8장 |
| 검증 지표 계산 | 11장 |
| 화면 구성 | 4~5장 |

---

## 기술 스택

```
Backend    Python 3.11 / FastAPI / SQLAlchemy 2.0 / Alembic / PostgreSQL 15
Frontend   React 18 / TypeScript / Vite
Data       pandas / numpy
LLM        상용 LLM API (모델 학습·파인튜닝 없음)
External   Figma REST API
```

## 디렉토리 구조

```
personalab/
├── backend/
│   ├── app/
│   │   ├── api/           라우터 (엔드포인트별 파일)
│   │   ├── models/        SQLAlchemy 모델
│   │   ├── schemas/       Pydantic 스키마
│   │   ├── repositories/  DB 접근 계층
│   │   ├── services/      비즈니스 로직
│   │   │   ├── persona/   분포 샘플링
│   │   │   ├── ask/       Ask 모드
│   │   │   ├── act/       Agent Loop
│   │   │   └── figma/     Figma API 연동
│   │   └── core/          설정, DB 세션
│   ├── alembic/
│   └── tests/
├── frontend/
│   └── src/
│       ├── pages/         화면 단위
│       ├── components/
│       └── api/           API 클라이언트
├── data/                  페르소나 생성, 라벨링 스크립트
└── docs/
    └── DEVELOPMENT_PLAN.md
```

---

## 코드 규칙

### 공통
- 네이밍: DB·API는 `snake_case`, React 컴포넌트는 `PascalCase`
- 주석과 커밋 메시지는 한국어 가능
- 매직 넘버 금지 — `core/config.py`에 상수로 선언

### Backend
- API 응답은 **반드시 Pydantic 스키마**로 반환. dict 직접 반환 금지
- DB 접근은 `repositories/` 계층을 거친다. 라우터에서 세션 직접 조작 금지
- LLM 호출은 `services/` 안에서만. 라우터·리포지토리에서 호출 금지
- 외부 API 호출(Figma, LLM)은 실패를 전제로 작성 — 재시도와 타임아웃 필수

### Frontend
- API 호출은 `src/api/` 클라이언트를 통해서만
- 상태 관리는 최소한으로. 전역 상태는 스터디 컨텍스트만

---

## 절대 변경 금지

아래를 임의로 바꾸면 검증 로직 전체가 깨진다. 변경이 필요하면 팀 논의 후 계획서를 먼저 수정한다.

### 1. 이탈 이유 카테고리 8개

```
UNCLEAR_PURPOSE   TOO_MANY_STEPS   PRIVACY        PRICE
TRUST             FEATURE_MISSING  SWITCHING_COST NAVIGATION_LOST
```

이 코드는 세 곳에서 **동일하게** 쓰인다.
1. AI 페르소나의 이탈 이유 (Act 모드)
2. 실제 참가자의 이탈 이유 (참가자 뷰)
3. 앱 리뷰 라벨링 (사전 검증)

하나라도 다르면 예측과 실측을 같은 축에서 비교할 수 없다.
**6주차 이후 변경 금지.** 추가 제안도 하지 말 것.

### 2. DB 스키마

`docs/DEVELOPMENT_PLAN.md` 9장이 기준이다. "더 나은 구조" 제안으로 컬럼을 추가·변경하지 않는다.

특히 `act_logs` 테이블은 AI와 실제 참가자를 `participant_type` 컬럼으로 구분해 **같은 테이블**에 저장한다. 테이블을 분리하면 비교 쿼리가 두 벌이 되므로 분리 제안 금지.

### 3. Agent Loop 종료 조건

`docs/DEVELOPMENT_PLAN.md` 8-2의 의사코드를 그대로 구현한다. 아래 네 가지 중 하나라도 빠지면 안 된다.

```
· 목표 화면 도달        → 성공
· 이탈 선언             → 실패 (drop_reason 기록)
· MAX_TURNS 초과        → 강제 종료
· visited 중복 방문     → NAVIGATION_LOST
```

**`MAX_TURNS`와 `visited` 차단이 없으면 무한 루프로 API 비용이 소모된다.**

> 2026-11-10 사용자 결정으로 `visited` 차단을 완화했다(네 조건은 모두 유지).
> - 규칙 기반 탐색: 이전과 같다. 이미 본 화면에 다시 오면 즉시 `NAVIGATION_LOST`.
> - LLM 모드: 되돌아가기·스크롤을 허용하되, **같은 화면을 최대 `BROWSER_MAX_VISITS_PER_SCREEN`(3)번 판단한 뒤**에만 `NAVIGATION_LOST`로 끊는다.
> - 시스템이 끊은 `NAVIGATION_LOST`(마지막 행동이 abandon이 아님)는 사용자 이탈이 아니라 '탐색 마침'으로 집계한다. 페르소나가 직접 abandon한 `NAVIGATION_LOST`만 이탈이다.
> - 구현: `backend/app/services/browser.py`의 `explore(allow_revisit=...)`, `frontend/src/mockup/ReportModel.ts`의 `outcome`.

### 4. 기존 Ask 가격 문항 형식

새 UI·UX 흐름에 가격 문항을 추가하지 않는다. 기존 Ask 이력의 유지보수가 필요한 경우에만 Q6의 직접 금액 응답 형식을 보존한다.

---

## 용어 사용

| 쓸 것 | 쓰지 말 것 | 이유 |
| --- | --- | --- |
| 페르소나 샘플링 | 합성 데이터 생성 | 모델 학습이 아니라 분포에서 표본 추출이다 |
| 분포 기반 생성 | 학습 / 파인튜닝 | 실제로 학습하지 않는다 |
| Ask 모드 / Act 모드 | 설문 모드 / 시뮬레이션 모드 | 문서 전체에서 이 표기로 통일 |
| 테스트(화면) / Study(내부) | 화면의 스터디 / 프로젝트 / 실험 | 사용자 요청으로 화면 표기를 테스트로 통일. DB·API·타입은 Study 유지 |

---

## LLM 응답 처리 원칙

1. **JSON 스키마 검증 필수.** 파싱 실패 시 재시도 (최대 3회)
2. **목록 밖 응답 무효 처리.** Act 모드에서 화면에 없는 요소를 응답하면 재시도
3. **응답을 그대로 신뢰하지 않는다.** 카테고리는 8개 중 하나여야 하고, 척도는 정의된 범위 안이어야 한다
4. **비용 관리.** 개발 중에는 페르소나 20명 × 최대 3턴으로 테스트. 100명 확장은 단가 측정 후

---

## 리포트에 쓰면 안 되는 것

피그마 프로토타입에는 **체류 시간, 망설임, 시선 이동이 없다.**

"3.2초 더 망설였다" 같은 문장은 근거가 없다. 셀 수 있는 것만 표시한다.

```
쓸 수 있는 것    화면별 잔존 수, 이탈 화면, 이탈 이유 분포, 클릭 경로, 턴 수
쓸 수 없는 것    체류 시간, 시선, 감정 강도, 만족도 점수
```

AI 생성 문장은 `Synthetic User Response`로 명확히 라벨링한다. 실제 참가자 응답과 섞이면 안 된다.

---

## 개발 순서

```
1. DB 스키마 + Alembic 마이그레이션
2. studies / product / prototype API
3. panel/generate (Persona Engine)
4. runs/ask + 진행률
5. runs/act + Agent Loop      ← 가장 중요, 가장 조심
6. 참가자 뷰 API + 화면
7. 리포트 + 오차 계산 API
```

위 순서는 이전 구현의 참조다. 앞으로의 개발 순서는 `docs/UX_WORKFLOW.md` 10장의 패널 가져오기 → UI·UX 실행 전환 → 화면 수집·버전 → 전반 탐색 → 리포트 → 인터뷰 → 비교 → 운영 준비를 따른다. 각 단계가 동작하는 것을 확인하고 다음으로 넘어간다.

---

## Git 작업 규칙

- **`main`에 직접 커밋·push 금지.** `feat/`·`fix/`·`chore/` 브랜치에서 작업한다
- 작업이 끝나면 `main`으로 PR을 만든다. **머지는 하지 않는다.** 팀장 승인 후 머지된다
- `git push --force`, `git reset --hard`, 브랜치 삭제는 사용자에게 먼저 확인한다

---

## 작업 방식

- **한 번에 하나씩.** 여러 파일을 동시에 만들지 말고 단계별로 진행한다
- **계획서와 다르면 먼저 물어본다.** 임의로 판단해서 구조를 바꾸지 않는다
- **테스트 가능한 단위로 끊는다.** 엔드포인트 하나가 완성되면 실행해볼 수 있어야 한다
- **불확실하면 질문한다.** 추측으로 구현하고 넘어가지 않는다
