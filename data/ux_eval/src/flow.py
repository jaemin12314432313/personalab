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


def _has(words, texts) -> bool:
    return any(w.lower() in t.lower() for w in words for t in texts)


def shortest_steps(flow: dict) -> int | None:
    """시작 화면에서 목표 화면까지 최소 몇 번 눌러야 하는지 (도달 불가면 None)."""
    nxt = {s["id"]: [e["to"] for e in s.get("elements", []) if e.get("to")] for s in flow["screens"]}
    start, goal = flow["screens"][0]["id"], flow["goal"]
    seen, frontier, steps = {start}, [start], 0
    while frontier:
        if goal in frontier:
            return steps
        frontier = [t for f in frontier for t in nxt[f] if t not in seen]
        seen.update(frontier)
        steps += 1
    return None


def screen_facts(s: dict) -> dict:
    """코드로 센 화면 사실. LLM이 구조를 잘못 읽지 않게 요약에 함께 넣는다."""
    from . import config as C
    fields = s.get("fields", [])
    buttons = [e["text"] for e in s.get("elements", [])]
    return {"fields": len(fields),
            "required": sum(f.get("required") is True for f in fields),
            "optional": sum(f.get("required") is False for f in fields),
            "unmarked": sum(f.get("required") is None for f in fields),
            "unnamed": sum(not f.get("label") for f in fields),
            "exit": [b for b in buttons if _has(C.EXIT_WORDS, [b])],
            "skip": [b for b in buttons if _has(C.SKIP_WORDS, [b])]}


def flow_facts(flow: dict) -> dict:
    import re

    from . import config as C
    all_text = [t for s in flow["screens"] for t in s.get("texts", []) + [e["text"] for e in s.get("elements", [])]]
    all_text += (flow.get("common") or {}).get("menu", [])
    return {"steps": shortest_steps(flow),
            "fields": sum(len(s.get("fields", [])) for s in flow["screens"]),
            "social": _has(C.SOCIAL_WORDS, all_text),
            "help": _has(C.HELP_WORDS, all_text),
            "progress": any(re.search(C.PROGRESS_PATTERN, t) for t in all_text)}


def render_flow(flow: dict) -> str:
    """프롬프트에 넣는 '화면 전체의 구조 요약'. 입력에 있는 사실만 옮기고, 코드로 센 사실([자동 집계])을 붙인다."""
    label = {s["id"]: s["label"] for s in flow["screens"]}
    start = flow["screens"][0]["id"]
    ff = flow_facts(flow)
    yn = lambda b: "있음" if b else "없음"
    steps = f"{ff['steps']}번" if ff["steps"] is not None else "도달할 수 없음"
    L = [f"과제: {flow['task']}",
         f"시작 화면: {start} {label[start]} / 목표 화면: {flow['goal']} {label[flow['goal']]}",
         f"화면 수: {len(flow['screens'])}",
         f"[자동 집계] 시작에서 목표까지 최소 이동 {steps} · 전체 입력 필드 {ff['fields']}개 · "
         f"소셜/간편 로그인 버튼 {yn(ff['social'])} · 도움말/문의 {yn(ff['help'])} · 진행 단계 표시(예: 2/4) {yn(ff['progress'])}"]
    common = flow.get("common")
    if common:
        from . import config as C
        names = common["menu"]
        more = f" 외 {len(names) - C.SHOW_COMMON_MENU}개" if len(names) > C.SHOW_COMMON_MENU else ""
        L.append(f"공통 메뉴 (모든 화면 상단·하단에 있음, 과제와 관련 없는 페이지로 이동하는 링크 {len(names)}개): "
                 f"{', '.join(names[:C.SHOW_COMMON_MENU])}{more}")
        if common.get("fields"):
            L.append(f"공통 입력칸 (모든 화면에 있음): {', '.join(common['fields'])}")
        if common.get("texts"):
            L.append(f"공통 문구 (모든 화면 하단 등): {' / '.join(common['texts'])}")
    L.append("")
    from . import config as C
    for s in flow["screens"]:
        L.append(f"[{s['id']}] {s['label']}")
        texts = s.get("texts", [])
        for t in texts[:C.MAX_TEXTS]:                           # 메인 뉴스·약관 원문처럼 많은 문구는 앞부분만
            L.append(f"  - 문구: {t}")
        if len(texts) > C.MAX_TEXTS:
            L.append(f"  - (이 밖에 문구 {len(texts) - C.MAX_TEXTS}개 더 있음)")
        for f in s.get("fields", []):
            req = {True: "필수", False: "선택"}.get(f.get("required"), "필수/선택 표시 없음")
            extra = f", 안내: {f['hint']}" if f.get("hint") else ""
            L.append(f"  - 입력 필드: {f.get('label') or '(이름 없음)'} ({f.get('type', 'text')}, {req}{extra})")
        for e in s.get("elements", []):
            to = (f" -> {e['to']} {label[e['to']]}" if e.get("to")
                  else " (과제와 관련 없는 다른 페이지로 이동)" if e.get("outside") else " (화면 이동 없음)")
            L.append(f"  - 클릭 가능: [{e['text']}]{to}")
        if not s.get("elements"):
            L.append("  - 클릭 가능한 요소 없음")
        sf = screen_facts(s)
        exit_ = f"있음({', '.join(sf['exit'])})" if sf["exit"] else "없음"
        skip = f"있음({', '.join(sf['skip'])})" if sf["skip"] else "없음"
        chars = f" · 화면 글자 수 약 {s['chars']:,}자" if s.get("chars") else ""
        L.append(f"  - [자동 집계] 입력 필드 {sf['fields']}개 (필수 {sf['required']} · 선택 {sf['optional']} · "
                 f"표시 없음 {sf['unmarked']} · 이름 없음 {sf['unnamed']}) · 뒤로/이전/취소 버튼 {exit_} · 건너뛰기 버튼 {skip}{chars}")
        L.append("")
    return "\n".join(L).rstrip()


# ── HTML -> 화면 ───────────────────────────────────────────────────────
TEXT_TAGS = ["h1", "h2", "h3", "h4", "p", "li", "small", "strong", "em", "span", "div", "td", "th", "dt", "dd"]
JS_NAV = re.compile(r"""(?:location(?:\.href)?\s*=|location\.assign\()\s*['"]([^'"]+)['"]""")
OUTSIDE = "__outside__"                                       # 흐름에 없는 페이지로 가는 링크


def parse_page(html: str, resolve, label: str | None = None) -> dict:
    """HTML 한 페이지 -> 화면 하나 (id 제외).
    resolve(대상 주소) -> 화면 id / OUTSIDE / None(이동 없음·알 수 없음)."""
    from bs4 import BeautifulSoup

    from . import config as C
    soup = BeautifulSoup(html, "html.parser")
    for t in soup(["script", "style", "noscript", "template"]):
        t.decompose()
    if not label:
        h1 = soup.find("h1")
        label = (soup.title.get_text(strip=True) if soup.title else "") or (h1.get_text(strip=True) if h1 else "")

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
        lab = lab or inp.get("aria-label")                     # name 속성은 화면에 안 보이므로 쓰지 않는다
        req = True if inp.has_attr("required") else None
        if lab and re.search(r"\(선택\)|선택사항|\[선택\]", lab):
            req = False
        elif lab and re.search(r"\(필수\)|\*|\[필수\]", lab):
            req = True
        hint = inp.get("placeholder") or None
        if inp.name == "select":                               # 선택지 수도 '단순함' 판단 재료다
            opts = [o.get_text(strip=True) for o in inp.find_all("option") if o.get_text(strip=True)]
            more = f" 외 {len(opts) - C.SHOW_OPTIONS}개" if len(opts) > C.SHOW_OPTIONS else ""
            hint = f"선택지 {len(opts)}개: {', '.join(opts[:C.SHOW_OPTIONS])}{more}"
        fields.append({"label": lab, "type": typ, "required": req, "hint": hint})

    elements, seen = [], set()

    def add(text, target):
        to = resolve(target) if target else None
        e = {"text": text, "to": None if to == OUTSIDE else to}
        if to == OUTSIDE:
            e["outside"] = True
        key = (e["text"], e["to"], e.get("outside", False))
        if key not in seen:                                    # 같은 버튼이 여러 번 나오면 한 번만
            seen.add(key)
            elements.append(e)

    for a in soup.find_all("a"):
        href = (a.get("href") or "").strip()
        if href.startswith("#") or not (a.get_text(strip=True) or a.get("aria-label")):
            continue                                           # 본문 바로가기 같은 페이지 안 이동은 뺀다
        target = None if href.lower().startswith("javascript:") else href
        add(a.get_text(" ", strip=True) or a.get("aria-label"), target)
    for b in soup.find_all(["button"]) + soup.find_all("input", type=["submit", "button"]):
        text = b.get_text(" ", strip=True) if b.name == "button" else b.get("value", "")
        target = b.get("data-to")
        m = JS_NAV.search(b.get("onclick", ""))
        if not target and m:
            target = m.group(1)
        form = b.find_parent("form")
        if not target and form and (b.get("type") or "submit") == "submit" and form.get("action"):
            target = form["action"]
        add(text or b.get("aria-label") or "(이름 없는 버튼)", target)

    skip = {e["text"] for e in elements} | {f["label"] for f in fields if f["label"]} | {label}
    body_chars = len(" ".join((soup.body or soup).get_text(" ", strip=True).split()))
    texts = []
    for t in soup.find_all(TEXT_TAGS):
        if t.find(TEXT_TAGS) or t.find(["select", "input", "textarea"]) or t.find_parent(["a", "button", "label", "select"]):
            continue                                           # 가장 안쪽 글만, 버튼·라벨 글은 위에서 처리
        s = " ".join(t.get_text(" ", strip=True).split())
        if not s or s in skip or s in texts:
            continue
        if len(s) > C.MAX_TEXT_CHARS:                          # 약관 같은 긴 글: 길다는 사실은 남긴다
            s = f"{s[:C.MAX_TEXT_CHARS]}… (전체 {len(s):,}자)"
        texts.append(s)
    return {"label": label, "texts": texts, "fields": fields, "elements": elements, "chars": body_chars}


def html_to_flow(folder, name: str, task: str, goal: str, start: str | None = None) -> dict:
    """페이지끼리 링크로 이어진 정적 HTML 묶음을 흐름 JSON으로 바꾼다.
    파일 하나 = 화면 하나, 파일 이름(확장자 제외) = 화면 id. 자바스크립트로 그리는 화면은 읽지 못한다."""
    files = sorted(Path(folder).glob("*.html"))
    if not files:
        raise ValueError(f"{folder}에 .html 파일이 없습니다")
    if start:                                                  # 시작 화면을 맨 앞으로
        files.sort(key=lambda p: p.stem != start)
    ids = {fp.stem for fp in files}

    def resolve(target):
        path = target.split("#")[0].split("?")[0]
        if not path.endswith(".html"):
            return None
        stem = Path(path).stem
        return stem if stem in ids else OUTSIDE

    screens = [{"id": fp.stem, **parse_page(fp.read_text(encoding="utf-8"), resolve)} for fp in files]
    flow = {"name": name, "task": task, "goal": goal, "screens": screens}
    validate_flow(flow)
    return flow


def pages_to_flow(spec: dict, html_of) -> dict:
    """실제 사이트 페이지 목록(spec) -> 흐름 JSON. html_of(url) -> HTML 문자열.
    spec: {name, task, goal, pages:[{id, url, label}], extra_screens:[...], patch:[{screen, text, to}]}"""
    from urllib.parse import urljoin, urlsplit

    def norm(u):
        s = urlsplit(u)
        return (s.netloc.lower(), s.path.rstrip("/") or "/", s.query)

    url_id = {norm(p["url"]): p["id"] for p in spec["pages"]}
    screens = []
    for p in spec["pages"]:
        def resolve(target, base=p["url"]):
            u = urljoin(base, target)
            if not u.startswith("http"):
                return None
            return url_id.get(norm(u), OUTSIDE)
        screens.append({"id": p["id"], **parse_page(html_of(p["url"]), resolve, p.get("label"))})
    common = extract_common(screens)
    screens += spec.get("extra_screens", [])
    by_id = {s["id"]: s for s in screens}
    for fix in spec.get("patch", []):                           # 자바스크립트 버튼처럼 자동으로 못 읽는 이동
        hit = [e for e in by_id[fix["screen"]]["elements"] if e["text"] == fix["text"]]
        if not hit:
            raise ValueError(f"보정할 버튼이 없습니다: {fix}")
        for e in hit:
            e["to"] = fix["to"]
            e.pop("outside", None)
    flow = {"name": spec["name"], "task": spec["task"], "goal": spec["goal"], "screens": screens}
    if common["menu"] or common["fields"] or common["texts"]:
        flow["common"] = common
    validate_flow(flow)
    return flow


def extract_common(screens: list[dict]) -> dict:
    """모든 페이지에 똑같이 있는 상단·하단 메뉴(흐름 밖 링크)와 입력칸을 각 화면에서 빼서 한 번만 적는다.
    과제 흐름 안으로 가는 링크(예: 상단 '회원가입')는 각 화면에 남긴다 (경로 계산과 판단에 필요)."""
    from collections import Counter

    from . import config as C
    if len(screens) < 2:
        return {"menu": [], "fields": [], "texts": []}
    need = max(2, round(len(screens) * C.COMMON_SHARE))     # 메인처럼 모양이 다른 페이지가 하나 있어도 묶이게

    def common(items_of):
        cnt = Counter(x for s in screens for x in set(items_of(s)))
        return {x for x, c in cnt.items() if c >= need}

    menu = common(lambda s: [e["text"] for e in s["elements"] if e.get("outside") or not e.get("to")])
    flds = common(lambda s: [f["label"] for f in s["fields"] if f["label"]])
    txts = common(lambda s: s["texts"])
    order = [e["text"] for s in screens for e in s["elements"] if e["text"] in menu]
    for s in screens:
        s["elements"] = [e for e in s["elements"] if not ((e.get("outside") or not e.get("to")) and e["text"] in menu)]
        s["fields"] = [f for f in s["fields"] if f["label"] not in flds]
        s["texts"] = [t for t in s["texts"] if t not in txts]
    return {"menu": list(dict.fromkeys(order)), "fields": sorted(flds),
            "texts": sorted(txts)}
