"""Act 모드 데모 — 페르소나 1명이 앱 화면을 보며 과제를 수행한다 (계획서 8장).

본 백엔드(app/)와 분리된 시연용이다. DB에 저장하지 않는다.

실행 (저장소 루트에서):
    backend/.venv/Scripts/python -m pip install -r demo/requirements.txt
    .env 에 LLM_API_KEY=...  (Google AI Studio 무료 키, https://aistudio.google.com/apikey)
    backend/.venv/Scripts/python demo/act_demo.py
    → http://localhost:8001
"""

import base64
import json
import sys
import time
from functools import cache
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from google import genai
from google.genai import errors, types
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.core.config import DROP_REASON_MAX_TURNS, DROP_REASONS, settings  # noqa: E402

# 무료 티어. gemini-3.8-flash 는 하루 20회라 금방 막힌다. 한도는 https://aistudio.google.com/rate-limit
DEFAULT_MODEL = "gemini-3.5-flash-lite"  # .env 의 LLM_MODEL 로 교체
RATE_LIMIT_WAIT_SEC = 30  # 무료 티어는 분당 5회. 429 면 쉬었다 재시도 (재시도 2번 = 1분 창을 넘김)
SERVER_BUSY_WAIT_SEC = 10
IMAGE_TYPES = ("image/png", "image/jpeg", "image/webp", "image/gif")

SYSTEM = (
    "너는 앱을 처음 써보는 사용자다. 주어진 프로필의 사람으로서 행동한다. "
    "클릭 가능한 요소 목록에 없는 것은 선택할 수 없다. "
    "계속할 수 없다고 판단되면 그만둔다고 답한다. "
    "계속할 때는 target 에 누를 요소의 글자를 그대로, drop_reason 은 null. "
    "그만둘 때는 target 은 null, drop_reason 을 반드시 하나 고른다. "
    "reason 은 이 사람의 말투로 한 문장."
)

# 계획서 8-4 출력 스키마. continue 는 action 에서 파생한다.
SCHEMA = {
    "type": "object",
    "properties": {
        "action": {"type": "string", "enum": ["click", "abandon"]},
        "target": {"type": ["string", "null"]},
        "drop_reason": {"type": ["string", "null"], "enum": [*DROP_REASONS, None]},
        "reason": {"type": "string"},
    },
    "required": ["action", "target", "drop_reason", "reason"],
    "additionalProperties": False,
}


class Element(BaseModel):
    text: str
    to: str


class Screen(BaseModel):
    id: str
    label: str
    description: str = ""
    image: str | None = None  # data URL
    elements: list[Element] = []


class RunRequest(BaseModel):
    persona: dict
    task: str
    goal: str
    screens: list[Screen]


app = FastAPI()


@cache
def get_client() -> genai.Client:
    """키가 없어도 서버는 뜨도록 첫 호출 때 만든다."""
    if not settings.llm_api_key:
        raise RuntimeError(".env 에 LLM_API_KEY 를 넣으세요 (https://aistudio.google.com/apikey)")
    return genai.Client(
        api_key=settings.llm_api_key, http_options=types.HttpOptions(timeout=settings.llm_timeout * 1000)
    )


def image_part(data_url: str) -> types.Part | None:
    head, _, data = data_url.partition(",")
    media = head.removeprefix("data:").removesuffix(";base64")
    if media not in IMAGE_TYPES or not data:
        return None
    return types.Part.from_bytes(data=base64.b64decode(data), mime_type=media)


def llm(req: RunRequest, screen: Screen, history: list[str]) -> dict:
    """계획서 8-3 프롬프트. 호출 실패·카테고리 누락은 최대 llm_max_retries 회 재시도."""
    text = (
        f"Persona\n{json.dumps(req.persona, ensure_ascii=False)}\n\n"
        f"Task\n{req.task}\n\n"
        f"Screen\n현재 화면: {screen.label}\n"
        f"화면 설명: {screen.description or '(첨부 이미지 참고)'}\n"
        f"클릭 가능: {' '.join(f'[{e.text}]' for e in screen.elements) or '(없음)'}\n\n"
        f"History\n지금까지: {' → '.join([*history, '(현재)'])}"
    )
    img = image_part(screen.image) if screen.image else None
    contents = ([img] if img else []) + [text]
    config = types.GenerateContentConfig(
        system_instruction=SYSTEM, response_mime_type="application/json", response_json_schema=SCHEMA
    )

    last_err = None
    for _ in range(settings.llm_max_retries):
        try:
            resp = get_client().models.generate_content(
                model=settings.llm_model or DEFAULT_MODEL, contents=contents, config=config
            )
            out = json.loads(resp.text or "null")  # 차단되면 text 가 None
            if not isinstance(out, dict) or out.get("action") not in ("click", "abandon"):
                last_err = f"형식 오류: {resp.text}"
                continue
            if out["action"] == "abandon" and out.get("drop_reason") not in DROP_REASONS:
                last_err = f"drop_reason 누락: {out}"
                continue
            return out
        except json.JSONDecodeError:
            last_err = f"JSON 아님: {resp.text}"
        except errors.ServerError as e:  # 503 과부하 등 — 잠깐 뒤 재시도
            last_err = str(e)
            time.sleep(SERVER_BUSY_WAIT_SEC)
        except errors.ClientError as e:  # 400/403 등은 재시도해도 같다
            if e.code != 429:
                raise RuntimeError(f"LLM 호출 오류: {e}") from e
            last_err = str(e)
            time.sleep(RATE_LIMIT_WAIT_SEC)
    raise RuntimeError(f"LLM 응답 실패: {last_err}")


def agent_loop(req: RunRequest):
    """계획서 8-2 의사코드 그대로. 종료 조건 4개: 목표 도달 / 이탈 / visited 중복 / MAX_TURNS."""
    screens = {s.id: s for s in req.screens}
    current = req.screens[0].id
    visited: list[str] = []
    history: list[str] = []

    def emit(**kw):
        return json.dumps(kw, ensure_ascii=False) + "\n"

    for turn in range(settings.max_turns):
        screen = screens[current]
        try:
            resp = llm(req, screen, history)
        except Exception as e:  # 네트워크 오류 포함, 스트림이 조용히 끊기지 않게 화면에 알린다
            yield emit(type="error", message=str(e))
            return
        cont = resp["action"] == "click"
        yield emit(type="turn", turn=turn, screen=current, label=screen.label, **{"continue": cont}, **resp)

        if not cont:
            yield emit(type="end", result="drop", screen=current, drop_reason=resp["drop_reason"])
            return
        el = next((e for e in screen.elements if e.text == resp["target"]), None)
        if el is None or el.to not in screens:  # 목록 밖 응답 → 재시도 (턴 소모)
            yield emit(type="invalid", turn=turn, target=resp["target"])
            continue

        history.append(screen.label)
        current = el.to
        if current == req.goal:
            yield emit(type="end", result="complete", screen=current)
            return
        if current in visited:  # 같은 화면 반복
            yield emit(type="end", result="drop", screen=current, drop_reason="NAVIGATION_LOST")
            return
        visited.append(current)
    yield emit(type="end", result="drop", screen=current, drop_reason=DROP_REASON_MAX_TURNS)


@app.get("/")
def index():
    return FileResponse(Path(__file__).with_name("index.html"))


@app.post("/run")
def run(req: RunRequest):
    return StreamingResponse(agent_loop(req), media_type="application/x-ndjson")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, port=8001)
