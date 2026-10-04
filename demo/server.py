"""PersonaLab 데모 서버 — 페르소나 샘플링 → Ask(기획서) / Act(피그마) → 리포트.

본 백엔드(app/)와 분리된 시연용이다. DB에 저장하지 않는다.

실행 (저장소 루트에서):
    backend/.venv/Scripts/python -m pip install -r demo/requirements.txt
    .env 에 LLM_API_KEY=...        (Google AI Studio 무료 키, https://aistudio.google.com/apikey)
    .env 에 FIGMA_ACCESS_TOKEN=... (선택. 없으면 피그마 불러오기가 샘플 프로토타입을 돌려준다)
    backend/.venv/Scripts/python demo/server.py
    → http://localhost:8001
"""

import base64
import json
import random
import re
import sys
import time
from functools import cache
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from google import genai
from google.genai import errors, types
from pydantic import BaseModel, Field

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from app.core.config import DROP_REASON_MAX_TURNS, DROP_REASONS, settings  # noqa: E402

# 무료 티어. gemini-3.8-flash 는 하루 20회라 금방 막힌다. 한도는 https://aistudio.google.com/rate-limit
DEFAULT_MODEL = "gemini-3.5-flash-lite"  # .env 의 LLM_MODEL 로 교체
RATE_LIMIT_WAIT_SEC = 30  # 429 면 쉬었다 재시도 (재시도 2번 = 분당 한도 창을 넘김)
SERVER_BUSY_WAIT_SEC = 10
IMAGE_TYPES = ("image/png", "image/jpeg", "image/webp", "image/gif")
MAX_PANEL = 10
MAX_WTP = 1_000_000  # Q6 월 지불 의향 상한 (원). 이상치 차단용
FIGMA_API = "https://api.figma.com/v1"
FIGMA_TIMEOUT_SEC = 60
FIGMA_MAX_SCREENS = 15
SNAPSHOT = Path(__file__).with_name("snapshot.json")

app = FastAPI()


# ── LLM 공통 ────────────────────────────────────────────────
@cache
def get_client() -> genai.Client:
    """키가 없어도 서버는 뜨도록 첫 호출 때 만든다."""
    if not settings.llm_api_key:
        raise RuntimeError(".env 에 LLM_API_KEY 를 넣으세요 (https://aistudio.google.com/apikey)")
    return genai.Client(
        api_key=settings.llm_api_key, http_options=types.HttpOptions(timeout=settings.llm_timeout * 1000)
    )


def call_llm(system: str, contents: list, schema: dict, check) -> dict:
    """JSON 스키마 강제 + 값 검증(check 가 오류 문자열을 돌려주면 재시도). 최대 llm_max_retries 회."""
    config = types.GenerateContentConfig(
        system_instruction=system, response_mime_type="application/json", response_json_schema=schema
    )
    last_err = None
    for _ in range(settings.llm_max_retries):
        try:
            resp = get_client().models.generate_content(
                model=settings.llm_model or DEFAULT_MODEL, contents=contents, config=config
            )
            out = json.loads(resp.text or "null")  # 차단되면 text 가 None
            last_err = "형식 오류" if not isinstance(out, dict) else check(out)
            if last_err is None:
                return out
            last_err = f"{last_err}: {resp.text}"
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


def image_part(data_url: str, allowed: tuple[str, ...] = IMAGE_TYPES) -> types.Part | None:
    head, _, data = data_url.partition(",")
    media = head.removeprefix("data:").removesuffix(";base64")
    if media not in allowed or not data:
        return None
    return types.Part.from_bytes(data=base64.b64decode(data), mime_type=media)


# ── 페르소나 샘플링 (계획서 6장, 데모판) ──────────────────────
# ⚠️ 데모는 고른 범위 안에서 균등 추출한다. 본 제품은 공개 데이터 분포에서 추출한다(6-2).
TOOLS = ("google_calendar", "notion", "naver_calendar", "paper_planner", "none")


class PanelRequest(BaseModel):
    count: int = Field(5, ge=1, le=MAX_PANEL)
    age: tuple[int, int] = (20, 29)
    occupation: str = "university_student"
    app_usage: tuple[float, float] = (0.3, 0.95)
    price_sensitivity: tuple[float, float] = (0.3, 0.95)
    digital_adoption: tuple[float, float] = (0.4, 0.95)
    seed: int | None = None


def sample_panel(req: PanelRequest) -> list[dict]:
    rnd = random.Random(req.seed)

    def uni(lo_hi):
        return round(rnd.uniform(*sorted(lo_hi)), 2)

    panel = []
    for pid in rnd.sample(range(1, 1000), req.count):
        p = {
            "persona_id": f"P{pid:03d}",
            "age": rnd.randint(*sorted(req.age)),
            "occupation": req.occupation,
            "app_usage_freq": uni(req.app_usage),
            "price_sensitivity": uni(req.price_sensitivity),
            "digital_adoption": uni(req.digital_adoption),
            "existing_tool": rnd.choice(TOOLS),
        }
        # 특성은 수치에서 파생 (데모 규칙)
        traits = [
            p["app_usage_freq"] >= 0.75 and "productivity_app_user",
            p["digital_adoption"] >= 0.85 and "early_adopter",
            p["price_sensitivity"] >= 0.7 and "budget_tight",
            p["digital_adoption"] < 0.55 and "privacy_conscious",
            rnd.random() < 0.4 and "time_sensitive",
            rnd.random() < 0.3 and "form_averse",
        ]
        p["traits"] = [t for t in traits if t]
        panel.append(p)
    return panel


# ── Ask 모드 (계획서 7장) ────────────────────────────────────
ASK_SYSTEM = (
    "너는 설문 응답자다. 주어진 프로필의 사람으로서 답한다. 반드시 지정된 JSON 형식으로만 답한다. "
    "needed_features 와 unneeded_features 는 기능 목록에 있는 이름 그대로, 서로 겹치지 않게 고른다. "
    "willingness_to_pay 는 유료로 쓴다면 한 달에 낼 수 있는 최대 금액을 원 단위 정수로 직접 적는다. 안 낸다면 0. "
    "reason 은 이 사람의 말투로 한두 문장."
)


class Product(BaseModel):
    name: str
    description: str
    features: list[str]
    price: str = ""


class AskRequest(BaseModel):
    persona: dict
    product: Product


# 기획서 → Ask 입력 자동 정리. 없는 정보를 지어내면 Ask 결과가 왜곡되므로 비워 두게 한다.
EXTRACT_SYSTEM = (
    "너는 제품 기획서에서 정보를 뽑아 정리한다. 기획서에 적힌 내용만 쓴다. "
    "name 은 제품명, description 은 사용자에게 보여줄 한두 문장 소개, "
    "features 는 사용자가 쓰는 기능 이름을 짧은 명사구로 (최대 8개), "
    "price 는 가격·요금제 정보. 기획서에 없는 항목은 빈 문자열이나 빈 배열로 둔다. 추측해서 채우지 않는다."
)
EXTRACT_SCHEMA = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "description": {"type": "string"},
        "features": {"type": "array", "items": {"type": "string"}},
        "price": {"type": "string"},
    },
    "required": ["name", "description", "features", "price"],
    "additionalProperties": False,
}
MAX_FEATURES = 8
DOC_TYPES = ("application/pdf",)


class ExtractRequest(BaseModel):
    text: str = ""
    file: str | None = None  # PDF data URL


def check_extract(out: dict) -> str | None:
    if not out.get("description") and not out.get("features"):
        return "기획서에서 내용을 찾지 못함"
    out["features"] = [f.strip() for f in out.get("features", []) if f.strip()][:MAX_FEATURES]
    return None


def extract_product(req: ExtractRequest) -> dict:
    doc = image_part(req.file, DOC_TYPES) if req.file else None
    if not doc and not req.text.strip():
        raise RuntimeError("기획서 내용이 없습니다")
    contents = ([doc] if doc else []) + [f"기획서\n{req.text.strip() or '(첨부 PDF)'}"]
    return call_llm(EXTRACT_SYSTEM, contents, EXTRACT_SCHEMA, check_extract)


def ask_schema(features: list[str]) -> dict:
    items = {"type": "string", "enum": features} if features else {"type": "string"}
    return {
        "type": "object",
        "properties": {
            "usage_intention": {"type": "integer", "enum": [1, 2, 3, 4, 5]},
            "needed_features": {"type": "array", "items": items},
            "unneeded_features": {"type": "array", "items": items},
            "concern": {"type": "string", "enum": list(DROP_REASONS)},
            "willingness_to_pay": {"type": "integer", "minimum": 0},
            "reason": {"type": "string"},
        },
        "required": [
            "usage_intention", "needed_features", "unneeded_features", "concern", "willingness_to_pay", "reason",
        ],
        "additionalProperties": False,
    }


def check_ask(out: dict, features: list[str]) -> str | None:
    """응답을 그대로 신뢰하지 않는다 — 척도·카테고리·기능 목록 범위 확인."""
    if out.get("usage_intention") not in (1, 2, 3, 4, 5):
        return "usage_intention 범위 밖"
    if out.get("concern") not in DROP_REASONS:
        return "concern 카테고리 밖"
    need, unneed = set(out.get("needed_features", [])), set(out.get("unneeded_features", []))
    if features and not (need | unneed) <= set(features):
        return "기능 목록 밖 응답"
    if need & unneed:
        return "필요/불필요 기능 중복"
    wtp = out.get("willingness_to_pay")
    if not isinstance(wtp, int) or not 0 <= wtp <= MAX_WTP:
        return "willingness_to_pay 범위 밖"
    return None


def ask(req: AskRequest) -> dict:
    p = req.product
    text = (
        f"Persona\n{json.dumps(req.persona, ensure_ascii=False)}\n\n"
        f"Product\n제품명: {p.name}\n설명: {p.description}\n"
        f"기능: {', '.join(p.features)}\n가격: {p.price or '(미정)'}\n\n"
        "Question\n"
        "- usage_intention: 이 제품을 쓸 것 같은가 (1 전혀 아니다 ~ 5 매우 그렇다)\n"
        "- needed_features / unneeded_features: 기능 목록에서 필요한 것, 필요 없는 것\n"
        "- concern: 쓰기를 망설이게 하는 가장 큰 이유 하나\n"
        "- willingness_to_pay: 유료로 쓴다면 월 얼마까지 낼 수 있는가 (금액 직접)\n"
        "- reason: 이유"
    )
    return call_llm(ASK_SYSTEM, [text], ask_schema(p.features), lambda o: check_ask(o, p.features))


# ── Act 모드 (계획서 8장) ────────────────────────────────────
ACT_SYSTEM = (
    "너는 앱을 처음 써보는 사용자다. 주어진 프로필의 사람으로서 행동한다. "
    "클릭 가능한 요소 목록에 없는 것은 선택할 수 없다. "
    "계속할 수 없다고 판단되면 그만둔다고 답한다. "
    "계속할 때는 target 에 누를 요소의 글자를 그대로, drop_reason 은 null. "
    "그만둘 때는 target 은 null, drop_reason 을 반드시 하나 고른다. "
    "reason 은 이 사람의 말투로 한 문장."
)

# 계획서 8-4 출력 스키마. continue 는 action 에서 파생한다.
ACT_SCHEMA = {
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


def check_act(out: dict) -> str | None:
    if out.get("action") not in ("click", "abandon"):
        return "action 형식 오류"
    if out["action"] == "abandon" and out.get("drop_reason") not in DROP_REASONS:
        return "drop_reason 누락"
    return None


def llm(req: RunRequest, screen: Screen, history: list[str]) -> dict:
    """계획서 8-3 프롬프트."""
    text = (
        f"Persona\n{json.dumps(req.persona, ensure_ascii=False)}\n\n"
        f"Task\n{req.task}\n\n"
        f"Screen\n현재 화면: {screen.label}\n"
        f"화면 설명: {screen.description or '(첨부 이미지 참고)'}\n"
        f"클릭 가능: {' '.join(f'[{e.text}]' for e in screen.elements) or '(없음)'}\n\n"
        f"History\n지금까지: {' → '.join([*history, '(현재)'])}"
    )
    img = image_part(screen.image) if screen.image else None
    return call_llm(ACT_SYSTEM, ([img] if img else []) + [text], ACT_SCHEMA, check_act)


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


# ── 피그마 불러오기 ──────────────────────────────────────────
CLICK_TRIGGERS = ("ON_CLICK", "ON_PRESS", "MOUSE_UP")


def figma_file_key(url: str) -> str | None:
    m = re.search(r"figma\.com/(?:file|design|proto)/([A-Za-z0-9]+)", url)
    return m.group(1) if m else None


def _first_text(node: dict) -> str | None:
    if node.get("type") == "TEXT" and (node.get("characters") or "").strip():
        return node["characters"].strip().splitlines()[0]
    for c in node.get("children", []):
        if t := _first_text(c):
            return t
    return None


def _destination(node: dict, frame_ids: set[str]) -> str | None:
    for it in node.get("interactions") or []:
        if (it.get("trigger") or {}).get("type") not in CLICK_TRIGGERS:
            continue
        for a in it.get("actions") or []:
            if a and a.get("type") == "NODE" and a.get("navigation", "NAVIGATE") in ("NAVIGATE", "SWAP"):
                if a.get("destinationId") in frame_ids:
                    return a["destinationId"]
    return node.get("transitionNodeID") if node.get("transitionNodeID") in frame_ids else None


def extract_prototype(document: dict) -> list[dict]:
    """피그마 문서 트리 → 시작 화면부터 연결을 따라간 화면 목록. [{fid, label, elements: [{text, to_fid}]}]"""
    canvases = [c for c in document.get("children", []) if c.get("type") == "CANVAS"]
    canvas = next((c for c in canvases if c.get("flowStartingPoints")), canvases[0] if canvases else {})
    frames = []
    for c in canvas.get("children", []):
        if c.get("type") == "FRAME":
            frames.append(c)
        elif c.get("type") == "SECTION":
            frames += [f for f in c.get("children", []) if f.get("type") == "FRAME"]
    if not frames:
        return []
    by_id = {f["id"]: f for f in frames}

    def elements(frame: dict) -> list[dict]:
        found, seen = [], {}

        def walk(n: dict):
            to = _destination(n, set(by_id))
            if to:
                text = _first_text(n) or n.get("name", "버튼")
                seen[text] = seen.get(text, 0) + 1
                found.append({"text": text if seen[text] == 1 else f"{text} ({seen[text]})", "to_fid": to})
                return
            for c in n.get("children", []):
                walk(c)

        for c in frame.get("children", []):
            walk(c)
        return found

    starts = canvas.get("flowStartingPoints") or []
    start = (starts[0].get("nodeId") if starts else None) or canvas.get("prototypeStartNodeID")
    if start not in by_id:
        start = frames[0]["id"]

    order, queue, out = [], [start], []
    while queue and len(order) < FIGMA_MAX_SCREENS:  # 시작 화면에서 닿는 화면만, 연결 순서대로
        fid = queue.pop(0)
        if fid in order:
            continue
        order.append(fid)
        els = elements(by_id[fid])
        out.append({"fid": fid, "label": by_id[fid].get("name", fid), "elements": els})
        queue += [e["to_fid"] for e in els]
    keep = set(order)
    for s in out:
        s["elements"] = [e for e in s["elements"] if e["to_fid"] in keep]
    return out


class FigmaRequest(BaseModel):
    url: str = ""
    mock: bool = False


# 피그마 토큰이 없을 때 쓰는 목업 프로토타입 (계획서 3장 ③ 일정메이트). fields = 폰에 그릴 입력칸 수
MOCK_PROTOTYPE = {
    "name": "일정메이트 온보딩 (샘플)",
    "mock": True,
    "screens": [
        {"id": "S01", "label": "온보딩", "description": "일정을 자동으로 정리하고 오늘 할 일의 우선순위를 추천해 드려요.",
         "fields": 0, "image": None, "elements": [{"text": "시작하기", "to": "S02"}]},
        {"id": "S02", "label": "회원가입", "description": "이메일, 비밀번호, 휴대폰 번호 인증이 필요해요.",
         "fields": 3, "image": None, "elements": [{"text": "다음", "to": "S03"}, {"text": "뒤로", "to": "S01"}]},
        {"id": "S03", "label": "학교·학년", "description": "학교명, 학년, 전공을 알려주세요.",
         "fields": 3, "image": None, "elements": [{"text": "다음", "to": "S04"}, {"text": "건너뛰기", "to": "S04"}]},
        {"id": "S04", "label": "관심분야 선택", "description": "관심분야를 5개 이상 골라주세요.",
         "fields": 4, "image": None, "elements": [{"text": "완료", "to": "S05"}, {"text": "건너뛰기", "to": "S05"}]},
        {"id": "S05", "label": "홈", "description": "오늘의 일정과 추천 우선순위", "fields": 2, "image": None, "elements": []},
    ],
}


def import_figma(url: str, mock: bool = False) -> dict:
    token = settings.figma_access_token
    if mock or not token:
        return MOCK_PROTOTYPE
    key = figma_file_key(url)
    if not key:
        raise HTTPException(400, "피그마 링크 형식이 아닙니다 (figma.com/design/... 또는 /proto/...)")
    with httpx.Client(timeout=FIGMA_TIMEOUT_SEC, headers={"X-Figma-Token": token}) as http:
        r = http.get(f"{FIGMA_API}/files/{key}")
        if r.status_code in (403, 404):
            raise HTTPException(400, f"피그마 파일을 열 수 없습니다 ({r.status_code}). 토큰과 링크 권한을 확인하세요.")
        r.raise_for_status()
        data = r.json()
        proto = extract_prototype(data["document"])
        if not proto:
            raise HTTPException(400, "화면(Frame)을 찾지 못했습니다.")
        if not any(s["elements"] for s in proto):
            raise HTTPException(
                400, "화면 간 연결(Prototype 탭의 클릭 연결)이 없습니다. 연결을 설정하거나 수동 입력을 쓰세요."
            )

        ids = ",".join(s["fid"] for s in proto)
        imgs = http.get(f"{FIGMA_API}/images/{key}", params={"ids": ids, "format": "png", "scale": 1}).json()
        urls = imgs.get("images") or {}

        sid = {s["fid"]: f"S{i + 1:02d}" for i, s in enumerate(proto)}
        screens = []
        for s in proto:
            image = None
            if urls.get(s["fid"]):
                png = http.get(urls[s["fid"]])
                if png.status_code == 200:
                    image = "data:image/png;base64," + base64.b64encode(png.content).decode()
            screens.append({
                "id": sid[s["fid"]], "label": s["label"], "description": "", "image": image,
                "elements": [{"text": e["text"], "to": sid[e["to_fid"]]} for e in s["elements"]],
            })
    return {"name": data.get("name", ""), "screens": screens}


# ── 라우트 ───────────────────────────────────────────────────
@app.get("/")
def index():
    return FileResponse(Path(__file__).with_name("index.html"), headers={"Cache-Control": "no-store"})


@app.post("/panel/generate")
def panel_generate(req: PanelRequest):
    return {"personas": sample_panel(req)}


@app.post("/product/extract")
def product_extract(req: ExtractRequest):
    try:
        return extract_product(req)
    except RuntimeError as e:
        raise HTTPException(502, str(e)) from e


@app.post("/ask")
def ask_route(req: AskRequest):
    try:
        return ask(req)
    except RuntimeError as e:
        raise HTTPException(502, str(e)) from e


@app.post("/run")
def run(req: RunRequest):
    return StreamingResponse(agent_loop(req), media_type="application/x-ndjson")


@app.post("/figma/import")
def figma_import(req: FigmaRequest):
    try:
        return import_figma(req.url, req.mock)
    except httpx.HTTPError as e:
        raise HTTPException(502, f"피그마 API 오류: {e}") from e


# 시연 중 한도·오류에 대비해 마지막 결과를 저장했다가 다시 보여준다 (계획서 14장 '캐시 재생')
@app.get("/snapshot")
def snapshot_get():
    if not SNAPSHOT.exists():
        raise HTTPException(404, "저장된 결과가 없습니다")
    return json.loads(SNAPSHOT.read_text(encoding="utf-8"))


@app.put("/snapshot")
def snapshot_put(data: dict):
    SNAPSHOT.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
    return {"saved": True}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, port=8001)
