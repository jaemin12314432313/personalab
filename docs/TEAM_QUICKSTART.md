# 팀원용 빠른 시작 (로컬에서 프론트 수정하기)

백엔드와 DB를 내 컴퓨터에서 열고, 프론트를 고치면서 확인하는 방법입니다. 처음 한 번만 30분 정도 걸립니다.

## 0. 미리 설치할 것

- Git
- Node.js 20 이상
- Python 3.11
- Docker Desktop (DB용)

## 1. 코드 받기

```bash
git clone https://github.com/jaemin12314432313/personalab.git
cd personalab
git checkout -b feat/내이름-작업내용
```

main에 바로 push하지 말고, 브랜치를 만들어 PR을 올려 주세요.

## 2. DB 켜기 (Docker)

```bash
docker run -d --name personalab-db ^
  -e POSTGRES_USER=personalab -e POSTGRES_PASSWORD=password -e POSTGRES_DB=personalab ^
  -p 5432:5432 postgres:15
```

macOS/Linux는 줄 끝 `^` 대신 `\`를 쓰세요. 다음부터는 `docker start personalab-db`만 하면 됩니다.

## 3. 백엔드 켜기

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
playwright install chromium     # 에이전트가 화면을 열 때 필요

copy ..\.env.example ..\.env    # macOS/Linux: cp ../.env.example ../.env
```

`.env` 파일을 열어 아래 한 줄만 바꿉니다. **API 키는 넣지 않습니다.**

```
AGENT_ENGINE=rule
```

`rule`은 AI를 호출하지 않는 규칙 기반 엔진이라 키도 비용도 필요 없고, 전체 흐름이 그대로 돕니다.

```bash
alembic upgrade head
uvicorn app.main:app --reload   # http://127.0.0.1:8000
```

## 4. 데모용 페르소나 넣기 (처음 한 번)

저장소에 올라간 페르소나 패널을 DB에 넣습니다. `backend` 폴더에서 실행하세요.

```bash
python scripts/import_persona_library.py --directory ../data/persona_engine/outputs --source-commit local
```

`total`이 찍히면 성공입니다. 이걸 안 하면 페르소나 목록이 비어 보입니다.

## 5. 프론트 켜기 (새 터미널)

```bash
cd frontend
npm install
npm run dev                     # http://127.0.0.1:5173
```

브라우저에서 http://127.0.0.1:5173 을 열고 회원가입(이메일은 아무거나)한 뒤 둘러보면 됩니다. 프론트 파일을 저장하면 화면이 바로 바뀝니다.

수정은 주로 `frontend/src`에서 합니다.

## 6. 수정한 걸 올리기

```bash
cd frontend
npm run build                   # 타입 오류가 없는지 확인
git add frontend/src            # 내가 고친 파일만 골라서 추가
git commit -m "feat: 무엇을 바꿨는지"
git push -u origin 내 브랜치 이름
```

그다음 GitHub에서 Pull Request를 만들어 주세요.

## 자주 막히는 곳

- **백엔드가 안 떠요**: Docker의 `personalab-db`가 켜져 있는지 확인하세요. 5432 포트를 이미 쓰고 있으면 충돌합니다.
- **화면에 데이터가 없어요**: 4번(페르소나 넣기)을 했는지, 백엔드가 8000 포트에서 떠 있는지 확인하세요. 프론트는 `/api`를 자동으로 8000 포트 백엔드에 연결합니다.
- **`.env`는 절대 커밋하지 마세요.** 이미 `.gitignore`에 들어 있습니다. OpenAI 키를 받았더라도 공유하거나 올리지 마세요.
- **`docs`, `data` 폴더는 건드리지 않아도 됩니다.** 프론트 수정에는 필요 없습니다.
- 프론트만 만진다면 팀장이 백엔드를 따로 띄워 준 주소가 있을 때 2~4번을 건너뛸 수 있습니다. 그때는 `frontend` 폴더에서 `PERSONALAB_API_URL=그 주소`를 환경변수로 주고 `npm run dev`를 실행하세요.
