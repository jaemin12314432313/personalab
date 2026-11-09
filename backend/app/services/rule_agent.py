"""AI 호출 없는 규칙 기반 판단. 모델 비용이 들지 않고 페르소나 카드도 외부로 보내지 않는다.

실제 AI 페르소나의 판단처럼 보이지 않도록 모든 판단에 engine='rule'을 남기고 이유 문장에 '규칙 기반'을 밝힌다.
감정·시선·체류 시간 같은 값은 만들지 않는다. 눌러 볼 요소를 고르는 기준만 설명한다.
"""
import hashlib
import random
import re
import time
from urllib.parse import urlsplit

from app.core.config import ACT_ABANDON, ACT_CLICK, RULE_REASON_PREFIX, settings

ENGINE_RULE = "rule"
ENGINE_LLM = "llm"
# 화면에서 다음 행동으로 이어지기 쉬운 문구
CTA_WORDS = ("시작", "가입", "다음", "계속", "보기", "더보기", "검색", "확인", "로그인", "둘러", "예약", "신청", "만들기", "추가")
NO_FILL_TYPES = {"file", "hidden", "checkbox", "radio", "submit", "button", "image", "reset"}
FILL_KINDS = {"input", "textarea"}
# 다른 사이트(예: 계정 로그인 창)로 나가 실행이 멈추는 일을 막는다. 버튼에는 주소가 없어 글자로 거른다
LEAVES_SITE = re.compile(r"로그인|로그아웃|sign\s*in|log\s*in|login|continue\s+with|google\s*계정|계정\s*선택", re.I)
# 더 눌러 볼 곳이 없을 때 쓰는 종료 코드(CLAUDE.md의 8개 중 하나). 규칙 기반에서는 길을 잃었다는 뜻이 아니라 탐색이 끝났다는 뜻이며, 이유 문장에 그렇게 적는다
DROP_NOTHING_LEFT = "NAVIGATION_LOST"


def use_rule_engine() -> bool:
    """auto: 모델 키가 있고 카드 전송이 허용될 때만 LLM을 쓴다. 그 밖에는 규칙 기반으로 돌린다."""
    mode = settings.agent_engine
    if mode == ENGINE_RULE:
        return True
    if mode == ENGINE_LLM:
        return False
    return not (settings.llm_api_key and settings.allow_persona_transmission)


def _seed(persona: dict) -> int:
    text = str(persona.get("card_text") or persona.get("profile") or "")
    return int(hashlib.sha1(text.encode()).hexdigest()[:8], 16)


def _stays_on_site(element: dict, screen: dict) -> bool:
    """같은 사이트 안에서 이어지는 요소만 고른다. 다른 출처 링크, 메일·전화·스크립트 링크, 로그인류 버튼은 제외."""
    # 같은 사이트 주소여도 눌러 보면 계정 로그인 창으로 넘어가는 링크가 흔해서 글자로도 거른다
    if LEAVES_SITE.search(element.get("text") or ""):
        return False
    href = element.get("href") or ""
    if href:
        parts = urlsplit(href)
        if parts.scheme in ("mailto", "tel", "javascript", "sms"):
            return False
        if parts.netloc and parts.netloc != urlsplit(screen.get("url") or "").netloc:
            return False
    return True


def _words(task: str) -> set[str]:
    return {w for w in re.findall(r"[가-힣A-Za-z]{2,}", task or "")}


def _score(text: str, words: set[str]) -> int:
    label = text or ""
    return 3 * sum(1 for w in words if w in label) + 2 * sum(1 for c in CTA_WORDS if c in label)


def _pick(candidates: list[tuple[int, int, object]], seed: int):
    """점수가 같은 후보는 페르소나마다 다른 순서로 고른다(사람마다 같은 길만 가지 않게)."""
    best = max(score for score, _, _ in candidates)
    top = [item for score, _, item in candidates if score == best]
    return top[seed % len(top)]


def _row(action: str, target, reason: str, drop_reason=None) -> dict:
    return {"action": action, "target": target, "drop_reason": drop_reason, "reason": reason, "engine": ENGINE_RULE}


def _think() -> None:
    """실제 에이전트처럼 한 번 판단하는 데 걸리는 시간을 흉내 낸다. 모두 같은 간격이면 기계처럼 보여서 조금씩 흔든다."""
    base = settings.rule_step_delay_ms
    if base > 0:
        time.sleep(random.uniform(base * 0.6, base * 1.4) / 1000)


def decide_screens(persona: dict, task: str, screen: dict, history: list) -> dict:
    _think()
    """직접 등록한 화면(버튼 이름 목록)용 판단."""
    from app.services.browser import SENSITIVE

    elements = [e for e in screen.get("elements", []) if e.get("text") and not SENSITIVE.search(e["text"])]
    if not elements:
        return _row(ACT_ABANDON, None, f"{RULE_REASON_PREFIX}: 더 눌러 볼 버튼이 없어 탐색을 마쳤어요. 사람이 길을 잃은 것은 아니에요.", DROP_NOTHING_LEFT)
    words = _words(task)
    chosen = _pick([(_score(e["text"], words), i, e) for i, e in enumerate(elements)], _seed(persona))
    return _row(ACT_CLICK, chosen["text"], f"{RULE_REASON_PREFIX}: 과제와 가까워 보이는 '{chosen['text']}' 버튼을 눌렀어요.")


def decide_browser(persona: dict, task: str, screen: dict, image, history: list) -> dict:
    """실제 브라우저 화면(관찰한 요소 id)용 판단. 같은 요소를 반복해서 누르지 않는다."""
    _think()
    from app.services.browser import SENSITIVE

    done = {str(h.get("target")) for h in history if isinstance(h, dict)}
    elements = [e for e in screen.get("elements", []) if e.get("text")]
    # 입력칸이 비어 있으면 한 번 채워 본다(보호된 형식은 실행기가 알아서 안전한 값으로 바꾼다)
    for e in elements:
        if e.get("kind") in FILL_KINDS and e.get("type") not in NO_FILL_TYPES and not e.get("filled") and e["text"] not in done:
            return {**_row("fill", e["id"], f"{RULE_REASON_PREFIX}: 비어 있는 '{e['text']}' 입력칸을 채워 봤어요."), "value": "테스트"}
    clickable = [e for e in elements if e.get("kind") not in FILL_KINDS and not SENSITIVE.search(e["text"]) and e["text"] not in done and _stays_on_site(e, screen)]
    if not clickable:
        return _row(ACT_ABANDON, None, f"{RULE_REASON_PREFIX}: 더 눌러 볼 요소가 없어 탐색을 마쳤어요. 사람이 길을 잃은 것은 아니에요.", DROP_NOTHING_LEFT)
    words = _words(task)
    # 같은 사이트 안의 링크는 이동이 GET이라 안전하게 이어진다. 버튼은 클릭하면 서비스가 데이터를 보내는 요청을 일으켜 실행이 멈추는 일이 잦아 뒤로 둔다
    scored = [(_score(e["text"], words) + (4 if e.get("href") else 0) + (2 if e.get("dialog") else 0) - (1 if e.get("navigation") and e.get("selected") else 0), i, e) for i, e in enumerate(clickable)]
    chosen = _pick(scored, _seed(persona))
    return _row(ACT_CLICK, chosen["id"], f"{RULE_REASON_PREFIX}: 아직 누르지 않은 '{chosen['text']}'을(를) 눌렀어요.")
