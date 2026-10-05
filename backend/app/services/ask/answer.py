"""Ask 모드 (계획서 7장). ask_persona 는 ⚠️ AI/Data 팀 교체 지점, check_ask 는 백엔드 검증."""

from app.core.config import DROP_REASONS, MAX_WTP, USAGE_INTENTION_RANGE


def ask_persona(persona: dict, product: dict, questions: list[dict]) -> dict:
    """⚠️ AI/Data 교체 지점. 페르소나가 제품 정보를 읽고 답한다 (계획서 7-1, 7-2).

    입력: persona = personas.attributes_json, product = {description, features, price},
          questions = [{code, type, text}]
    출력: {"usage_intention": 1~5, "needed_features": [...], "unneeded_features": [...],
           "concern": "<8개 중 하나>", "willingness_to_pay": 원(정수, 금액 직접), "reason": "..."}

    지금은 LLM 없이 고정 답을 내는 임시 구현이다.
    """
    features = product["features"]
    return {
        "usage_intention": 3,
        "needed_features": features[:1],
        "unneeded_features": features[-1:] if len(features) > 1 else [],
        "concern": "PRICE",
        "willingness_to_pay": 0,
        "reason": "(임시 구현) 고정 응답",
    }


def check_ask(out: dict, features: list[str]) -> str | None:
    """LLM 응답을 그대로 믿지 않는다 (CLAUDE.md). 문제가 있으면 이유를, 없으면 None."""
    lo, hi = USAGE_INTENTION_RANGE
    intent = out.get("usage_intention")
    if not isinstance(intent, int) or not lo <= intent <= hi:
        return "usage_intention 범위 밖"
    need, unneed = set(out.get("needed_features", [])), set(out.get("unneeded_features", []))
    if not (need | unneed) <= set(features):
        return "기능 목록 밖 응답"
    if need & unneed:
        return "필요·불필요 기능 중복"
    if out.get("concern") not in DROP_REASONS:
        return "concern 이 8개 카테고리 밖"
    wtp = out.get("willingness_to_pay")
    if not isinstance(wtp, int) or not 0 <= wtp <= MAX_WTP:
        return "willingness_to_pay 범위 밖"
    return None
