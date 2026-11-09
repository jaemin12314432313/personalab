# PersonaLab

AI 페르소나 기반 UI·UX 탐색과 후속 인터뷰 플랫폼

> 화면은 같아도, 경험은 다르니까.

다양한 AI 페르소나가 프로토타입을 탐색하며 UI·UX의 불편을 찾고,
같은 페르소나와의 1대1 인터뷰로 그 이유를 더 살펴보는 서비스를 만듭니다.
기본 방향은 전반 탐색이며, 특별히 확인하고 싶은 부분을 선택적으로 추가합니다.

현재는 수동 화면·연결 등록과 기존 단일 흐름 실행 코드가 있으며, 전반 탐색·페르소나 보관함·후속 인터뷰는 구현 예정입니다. 기획 의견을 묻는 기존 Ask는 새 제품 흐름에서 제외할 대상입니다.

---

## 문서

개발 시작 전 **[UI·UX 서비스 정의와 전체 워크플로우](docs/UX_WORKFLOW.md)**와 **[개발계획서의 방향 변경 항목](docs/DEVELOPMENT_PLAN.md)**을 먼저 읽으세요. 아래 장 번호는 이전 구현을 확인할 때의 참고입니다.

| 역할 | 반드시 읽을 장 |
| --- | --- |
| 전원 | 1~3장 (무엇을·왜·사용자 흐름), 12~13장 (역할·로드맵) |
| AI / Data | 6~8장 (Persona·Ask·Act), 11장 (검증 지표) |
| 기획 / 백엔드 | 9~10장 (DB·API), 11장 (검증 설계·라벨링) |
| 프론트 | 4~5장 (화면·리포트) |

`CLAUDE.md` 에 코드 규칙과 **변경 금지 항목**이 있습니다. Claude Code를 쓴다면 자동으로 읽힙니다.

---

## 개발 환경 세팅

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp ../.env.example ../.env       # 값 채우기
alembic upgrade head
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

### DB

```bash
docker run -d --name personalab-db \
  -e POSTGRES_USER=personalab \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=personalab \
  -p 5432:5432 postgres:15
```

---

## 브랜치 규칙

```
main              항상 동작하는 상태. 직접 push 금지
feat/<작업명>      기능 개발
fix/<작업명>       버그 수정
chore/<작업명>     설정·문서
```

PR로만 머지하고, **리뷰 1명 승인 필수**입니다.

### 브랜치 이름 예시

```
feat/study-api
feat/persona-engine
feat/agent-loop
feat/participant-view
fix/figma-parsing
```

---

### 작업 흐름

```bash
git clone https://github.com/jaemin12314432313/personalab.git   # 처음 한 번
git checkout main && git pull                                    # 작업 시작 전 최신화
git checkout -b feat/study-api                                   # 작업 브랜치
# ... 작업 · 커밋 ...
git push -u origin feat/study-api
gh pr create --base main                                         # PR 생성 → 팀장 승인 후 머지
```

머지는 팀장(`@jaemin12314432313`)이 리뷰 후 진행합니다. PR 작성자가 직접 머지하지 않습니다.

### Claude Code / Codex로 작업할 때

- Claude Code는 `CLAUDE.md`, Codex는 `AGENTS.md`를 자동으로 읽습니다. 둘 다 위 흐름대로 브랜치 → PR까지만 하도록 적혀 있습니다
- Claude Code는 `git commit`·`push`·`gh` 실행 전에 승인을 묻도록 설정되어 있습니다 (`.claude/settings.json`). **끄지 마세요**
- AI가 만든 코드도 PR 올리기 전에 본인이 한 번 읽고 올립니다

---

## 커밋 메시지

한국어로 써도 됩니다. 앞에 타입만 붙여주세요.

```
feat: 스터디 생성 API 추가
fix: Agent Loop 무한 반복 차단
chore: alembic 초기 마이그레이션
docs: 개발계획서 9장 스키마 수정
```

---

## 팀

| 코드 | 담당 |
| --- | --- |
| D1 | 데이터 파이프라인 · Persona Engine |
| D2 | 프롬프트 · Agent Loop |
| D3 | 검증 · 분석 · 라벨링 기준 |
| P1 | 백엔드 코어 (팀장) |
| P2 | Figma 연동 · 참가자 뷰 API · 리포트 API |
| P3 | 기획 · 리서치 · 참가자 운영 |
| F1 | 입력 플로우 · 참가자 화면 |
| F2 | 리포트 화면 |

---

## 주의

⚠️ **아래는 임의로 바꾸면 안 됩니다.** 자세한 내용은 `CLAUDE.md` 참조.

- 이탈 이유 카테고리 8개 (6주차 이후 동결)
- DB 스키마 (계획서 9장 기준)
- Agent Loop 종료 조건 4가지
- 가격 문항은 금액 직접 응답 방식

⚠️ **`.env` 는 절대 커밋하지 마세요.** API 키가 들어갑니다.
