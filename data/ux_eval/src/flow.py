"""화면 흐름 입력: JSON 읽기, 정적 HTML 묶음 -> JSON 변환, 프롬프트용 구조 요약.

흐름 JSON 형식 (화면 하나 = screens의 원소 하나, 첫 화면이 시작 화면):
{
  "name": "signup", "task": "회원가입을 완료한다", "goal": "S05",
  "screens": [
    {"id": "S02", "label": "회원가입",
     "texts": ["학교 인증이 필요해요"],
     "fields": [{"label": "이름", "type": "text", "required": true, "hint": "실명"}],
     "elements": [{"text": "다음", "to": "S03"}, {"text": "뒤로", "to": "S01"}]}
  ]
}
"""
import json
import re
from pathlib import Path


def load_flow(path) -> dict:
    flow = json.loads(Path(path).read_text(encoding="utf-8"))
    validate_flow(flow)
    return flow


def validate_flow(flow: dict) -> None:
    """빠진 칸, 없는 화면으로의 연결을 미리 막는다 (LLM 비용을 쓰기 전에)."""
    for key in ("name", "task", "goal", "screens"):
        if not flow.get(key):
            raise ValueError(f"흐름에 '{key}'가 없습니다")
    ids = [s["id"] for s in flow["screens"]]
    if len(ids) != len(set(ids)):
        raise ValueError(f"화면 id가 중복됩니다: {ids}")
    if flow["goal"] not in ids:
        raise ValueError(f"목표 화면 '{flow['goal']}'이 screens에 없습니다")
    broken = [(s["id"], e["text"], e["to"]) for s in flow["screens"]
              for e in s.get("elements", []) if e.get("to") and e["to"] not in ids]
    if broken:
        raise ValueError(f"없는 화면으로 연결됩니다 (화면, 버튼, 대상): {broken}")


def render_flow(flow: dict) -> str:
    """프롬프트에 넣는 '화면 전체의 구조 요약'. 입력에 있는 사실만 옮긴다."""
    label = {s["id"]: s["label"] for s in flow["screens"]}
    start = flow["screens"][0]["id"]
    L = [f"과제: {flow['task']}",
         f"시작 화면: {start} {label[start]} / 목표 화면: {flow['goal']} {label[flow['goal']]}",
         f"화면 수: {len(flow['screens'])}", ""]
    for s in flow["screens"]:
        L.append(f"[{s['id']}] {s['label']}")
        for t in s.get("texts", []):
            L.append(f"  - 문구: {t}")
        for f in s.get("fields", []):
            req = {True: "필수", False: "선택"}.get(f.get("required"), "필수/선택 표시 없음")
            extra = f", 안내: {f['hint']}" if f.get("hint") else ""
            L.append(f"  - 입력 필드: {f.get('label') or '(이름 없음)'} ({f.get('type', 'text')}, {req}{extra})")
        for e in s.get("elements", []):
            to = f" -> {e['to']} {label[e['to']]}" if e.get("to") else " (화면 이동 없음)"
            L.append(f"  - 클릭 가능: [{e['text']}]{to}")
        if not s.get("elements"):
            L.append("  - 클릭 가능한 요소 없음")
        L.append("")
    return "\n".join(L).rstrip()


# ── 정적 HTML 묶음 -> 흐름 JSON ─────────────────────────────────────────
TEXT_TAGS = ["h1", "h2", "h3", "h4", "p", "li", "small", "strong", "em", "span", "div"]
JS_NAV = re.compile(r"""(?:location(?:\.href)?\s*=|location\.assign\()\s*['"]([^'"]+\.html)['"]""")


def _screen_id(path: Path) -> str:
    return path.stem


def html_to_flow(folder, name: str, task: str, goal: str, start: str | None = None) -> dict:
    """페이지끼리 링크로 이어진 정적 HTML 묶음을 흐름 JSON으로 바꾼다.
    파일 하나 = 화면 하나, 파일 이름(확장자 제외) = 화면 id. 자바스크립트로 그리는 화면은 읽지 못한다."""
    from bs4 import BeautifulSoup

    files = sorted(Path(folder).glob("*.html"))
    if not files:
        raise ValueError(f"{folder}에 .html 파일이 없습니다")
    if start:                                                  # 시작 화면을 맨 앞으로
        files.sort(key=lambda p: p.stem != start)
    screens = []
    for fp in files:
        soup = BeautifulSoup(fp.read_text(encoding="utf-8"), "html.parser")
        for t in soup(["script", "style", "noscript", "template"]):
            t.decompose()
        title = soup.title.get_text(strip=True) if soup.title else ""
        h1 = soup.find("h1")
        label = title or (h1.get_text(strip=True) if h1 else fp.stem)

        fields = []
        for inp in soup.find_all(["input", "select", "textarea"]):
            typ = (inp.get("type") or ("text" if inp.name == "input" else inp.name)).lower()
            if typ in ("hidden", "submit", "button", "image", "reset"):
                continue
            lab = None
            if inp.get("id"):
                tag = soup.find("label", attrs={"for": inp["id"]})
                lab = tag.get_text(" ", strip=True) if tag else None
            if not lab and inp.find_parent("label"):
                lab = inp.find_parent("label").get_text(" ", strip=True)
            lab = lab or inp.get("aria-label")                 # name 속성은 화면에 안 보이므로 쓰지 않는다
            req = True if inp.has_attr("required") else None
            if lab and re.search(r"\(선택\)|선택사항|\[선택\]", lab):
                req = False
            elif lab and re.search(r"\(필수\)|\*|\[필수\]", lab):
                req = True
            fields.append({"label": lab, "type": typ, "required": req,
                           "hint": inp.get("placeholder") or None})

        elements = []
        for a in soup.find_all("a"):
            href = (a.get("href") or "").split("#")[0]
            to = Path(href).stem if href.endswith(".html") else None
            elements.append({"text": a.get_text(" ", strip=True) or a.get("aria-label") or href, "to": to})
        for b in soup.find_all(["button"]) + soup.find_all("input", type=["submit", "button"]):
            text = b.get_text(" ", strip=True) if b.name == "button" else b.get("value", "")
            to = b.get("data-to")                              # <button data-to="S03.html">
            m = JS_NAV.search(b.get("onclick", ""))
            if not to and m:
                to = m.group(1)
            form = b.find_parent("form")
            if not to and form and (form.get("action") or "").endswith(".html"):
                to = form["action"]
            elements.append({"text": text or b.get("aria-label") or "(이름 없는 버튼)",
                             "to": Path(to).stem if to else None})

        skip = {e["text"] for e in elements} | {f["label"] for f in fields if f["label"]} | {label}
        texts = []
        for t in soup.find_all(TEXT_TAGS):
            if t.find(TEXT_TAGS) or t.find_parent(["a", "button", "label"]):
                continue                                       # 가장 안쪽 글만, 버튼·라벨 글은 위에서 처리
            s = t.get_text(" ", strip=True)
            if s and s not in skip and s not in texts:
                texts.append(s)
        screens.append({"id": _screen_id(fp), "label": label, "texts": texts,
                        "fields": fields, "elements": elements})
    flow = {"name": name, "task": task, "goal": goal, "screens": screens}
    validate_flow(flow)
    return flow
