"""Act 모드 데모 — 페르소나 1명이 앱 화면을 보며 과제를 수행한다 (계획서 8장).

본 백엔드(app/)와 분리된 시연용이다. DB에 저장하지 않는다.

실행 (저장소 루트에서):
    backend/.venv/Scripts/python -m pip install -r demo/requirements.txt
    .env 에 LLM_API_KEY=sk-ant-...  (또는 환경변수 ANTHROPIC_API_KEY)
    backend/.venv/Scripts/python demo/act_demo.py
    → http://localhost:8001
"""

import json
import sys
from pathlib import Path

import anthropic
from fastapi import FastAPI
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.core.config import DROP_REASON_MAX_TURNS, DROP_REASONS, settings  # noqa: E402

DEFAULT_MODEL = "claude-opus-5"
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


client = anthropic.Anthropic(api_key=settings.llm_api_key or None, timeout=settings.llm_timeout)
app = FastAPI()


def image_block(data_url: str) -> dict | None:
    head, _, data = data_url.partition(",")
    media = head.removeprefix("data:").removesuffix(";base64")
    if media not in IMAGE_TYPES or not data:
        return None
    return {"type": "image", "source": {"type": "base64", "media_type": media, "data": data}}


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
    img = image_block(screen.image) if screen.image else None
    content = ([img] if img else []) + [{"type": "text", "text": text}]

    last_err = None
    for _ in range(settings.llm_max_retries):
        try:
            resp = client.messages.create(
                model=settings.llm_model or DEFAULT_MODEL,
                max_tokens=16000,
                system=SYSTEM,
                output_config={"effort": "low", "format": {"type": "json_schema", "schema": SCHEMA}},
                messages=[{"role": "user", "content": content}],
            )
            if resp.stop_reason == "refusal":
                last_err = "refusal"
                continue
            out = json.loads(next(b.text for b in resp.content if b.type == "text"))
            if out["action"] == "abandon" and out["drop_reason"] not in DROP_REASONS:
                last_err = f"drop_reason 누락: {out}"
                continue
            return out
        except (anthropic.APIConnectionError, anthropic.RateLimitError, anthropic.InternalServerError) as e:
            last_err = str(e)
        except anthropic.APIStatusError as e:  # 400/401 등 — 재시도해도 같다
            raise RuntimeError(f"LLM 호출 오류: {e}") from e
        except TypeError as e:  # SDK 가 키를 못 찾으면 TypeError
            raise RuntimeError(".env 에 LLM_API_KEY 를 넣으세요") from e
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
        except RuntimeError as e:
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
