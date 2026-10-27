"""평가 프롬프트, 응답 JSON 스키마, 응답 검증."""
from . import config as C

_criteria = "\n".join(f"{i}. {name}: {desc}" for i, (name, desc) in enumerate(C.CRITERIA.values(), start=1))
_reasons = "\n".join(f"- {code}: {ko}" for code, ko in C.DROP_REASON_KO.items())

SYSTEM = f"""너는 아래 페르소나의 사용자로서, 과제를 수행하는 화면 흐름을 평가한다. 입력은 화면 전체의 구조 요약(화면 이름, 문구, 입력 필드, 클릭 가능 요소, 화면 연결)이다.
아래 기준마다 좋음/보통/나쁨/판단불가 중 하나의 라벨을 입력에서 확인되는 사실로만 판단하여 고르고, 근거 문장을 쓴다. 근거에는 해당 화면의 id(예: S02)를 적는다.
흐름 전체에 관한 근거는 '전체 흐름'이라고 적고, 관련 화면 id가 있으면 함께 적는다.
[자동 집계] 줄은 코드로 센 사실이다. 버튼 유무, 입력 필드 수, 단계 수는 이 줄을 그대로 따르고 다르게 말하지 않는다.
있어야 할 요소가 입력에 분명히 없다면 '나쁨', 입력에 정보 자체가 없어서 알 수 없는 것(속도, 색, 글자 크기, 배치)은 추측하지 말고 '판단불가'로 쓴다.
라벨과 별개로, 이 페르소나에게 그 기준이 얼마나 중요한지(높음/중간/낮음)와 이유를 페르소나의 특성에 근거해 쓴다.
마지막으로 이 페르소나 입장에서 과제를 끝까지 할 것인지 여부(예/아니오)와 그 이유를 페르소나의 말투로 한두 문장 쓴다(코드만 쓰지 않는다). 완주 여부는 평가 라벨과 따로 판단한다. 불편한 점이 있다는 것과 그만둔다는 것은 다르다. 이 페르소나는 과제를 하려고 이 흐름을 시작했다. 카드에 적힌 성향(새 앱 적응, 개인정보에 대한 태도, 돈을 쓰는 태도)으로 볼 때 정말 그만둘 정도인지 판단한다.
'아니오'면 그만둘 화면의 id와 이탈 이유를 아래 8개 중 하나로 고른다. '예'면 두 칸을 빈 문자열로 둔다.

평가 기준
{_criteria}

이탈 이유
{_reasons}

반드시 지정된 JSON 형식으로만 답한다."""

_criterion = {
    "type": "object",
    "properties": {
        "label": {"type": "string", "enum": C.LABELS},
        "evidence": {"type": "string"},
        "importance": {"type": "string", "enum": C.IMPORTANCE},
        "importance_reason": {"type": "string"},
    },
    "required": ["label", "evidence", "importance", "importance_reason"],
}
SCHEMA = {
    "type": "object",
    "properties": {
        "criteria": {"type": "object", "properties": {k: _criterion for k in C.CRITERIA},
                     "required": list(C.CRITERIA)},
        "complete": {"type": "string", "enum": C.COMPLETE},
        "complete_reason": {"type": "string"},
        "drop_screen": {"type": "string"},
        "drop_reason": {"type": "string", "enum": ["", *C.DROP_REASONS]},
    },
    "required": ["criteria", "complete", "complete_reason", "drop_screen", "drop_reason"],
}


def build_contents(card_text: str, flow_text: str) -> list[str]:
    return [f"[페르소나]\n{card_text}", f"[화면 흐름]\n{flow_text}"]


def check_eval(out: dict, flow: dict) -> str | None:
    """응답을 그대로 믿지 않는다 (CLAUDE.md). 문제가 있으면 이유를, 없으면 None -> call_llm이 다시 묻는다."""
    ids = {s["id"] for s in flow["screens"]}
    names = {s["label"] for s in flow["screens"]}
    crit = out.get("criteria") or {}
    for key, (name, _) in C.CRITERIA.items():
        c = crit.get(key)
        if not isinstance(c, dict):
            return f"기준 누락: {name}"
        if c.get("label") not in C.LABELS or c.get("importance") not in C.IMPORTANCE:
            return f"{name}: 라벨 또는 중요도가 정해진 값이 아님"
        if not str(c.get("evidence", "")).strip() or not str(c.get("importance_reason", "")).strip():
            return f"{name}: 근거 또는 중요도 이유가 비어 있음"
        if c["label"] != C.NOT_JUDGED and not any(x in c["evidence"] for x in ids | names | set(C.FLOW_REFS)):
            return f"{name}: 근거에 화면 id나 화면 이름이 없음 (입력에서 확인한 사실인지 알 수 없음)"
    if out.get("complete") not in C.COMPLETE:
        return "완주 여부가 없음"
    reason = str(out.get("complete_reason", "")).strip()
    if len(reason) < C.MIN_REASON_CHARS or reason in C.DROP_REASONS:
        return "완주 이유가 문장이 아님 (코드나 한두 단어만 씀)"
    if out["complete"] == "아니오":
        if out.get("drop_screen") not in ids:
            return "그만둘 화면 id가 흐름에 없음"
        if out.get("drop_reason") not in C.DROP_REASONS:
            return "이탈 이유가 8개 카테고리 밖"
    elif out.get("drop_screen") or out.get("drop_reason"):
        return "완주하는데 이탈 화면·이유가 채워짐"
    return None
