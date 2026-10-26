"""Ask 모드 (계획서 7장).

ask_persona 는 페르소나 입장에서 제품을 읽고 답하고, check_ask 는 응답을 검증한다.
프롬프트와 스키마는 demo/server.py 에서 이미 돌려 본 것을 옮겼다.
"""

from app.core.config import DROP_REASONS, MAX_WTP, USAGE_INTENTION_RANGE
from app.services.llm import call_llm
from app.services.persona.sample import persona_card

ASK_SYSTEM = (
    "너는 설문 응답자다. 주어진 프로필의 사람으로서 답한다. 반드시 지정된 JSON 형식으로만 답한다. "
    "needed_features 와 unneeded_features 는 기능 목록에 있는 이름 그대로, "
    "서로 겹치지 않게 고른다. "
    "willingness_to_pay 는 유료로 쓴다면 한 달에 낼 수 있는 최대 금액을 "
    "원 단위 정수로 직접 적는다. 안 낸다면 0. "
    "reason 은 이 사람의 말투로 한두 문장."
)


def ask_schema(features: list[str]) -> dict:
    """LLM 이 지킬 응답 모양. 기능은 목록에 있는 이름만, 이유 코드는 8개 안에서만 고르게 한다."""
    names = {"type": "string", "enum": features} if features else {"type": "string"}
    low, high = USAGE_INTENTION_RANGE
    return {
        "type": "object",
        "properties": {
            "usage_intention": {"type": "integer", "enum": list(range(low, high + 1))},
            "needed_features": {"type": "array", "items": names},
            "unneeded_features": {"type": "array", "items": names},
            "concern": {"type": "string", "enum": list(DROP_REASONS)},
            "willingness_to_pay": {"type": "integer", "minimum": 0},
            "reason": {"type": "string"},
        },
        "required": [
            "usage_intention",
            "needed_features",
            "unneeded_features",
            "concern",
            "willingness_to_pay",
            "reason",
        ],
        "additionalProperties": False,
    }


def ask_persona(persona: dict, product: dict, questions: list[dict]) -> dict:
    """페르소나가 제품 정보를 읽고 답한다 (계획서 7-1, 7-2).

    입력: persona = personas.attributes_json, product = {description, features, price},
          questions = [{code, type, text}] (아직 프롬프트에 쓰지 않는다. 질문은 아래 고정 문구)
    출력: {"usage_intention": 1~5, "needed_features": [...], "unneeded_features": [...],
           "concern": "<8개 중 하나>", "willingness_to_pay": 원(정수, 금액 직접), "reason": "..."}
    끝내 검증을 통과하지 못하면 LLMError. 금액은 먼저 보여주지 않고 직접 적게 한다 (CLAUDE.md Q6).
    """
    features = product["features"]
    text = (
        f"Persona\n{persona_card(persona)}\n\n"
        f"Product\n설명: {product['description']}\n"
        f"기능: {', '.join(features)}\n가격: {product['price'] or '(미정)'}\n\n"
        "Question\n"
        "- usage_intention: 이 제품을 쓸 것 같은가 (1 전혀 아니다 ~ 5 매우 그렇다)\n"
        "- needed_features / unneeded_features: 기능 목록에서 필요한 것, 필요 없는 것\n"
        "- concern: 쓰기를 망설이게 하는 가장 큰 이유 하나\n"
        "- willingness_to_pay: 유료로 쓴다면 월 얼마까지 낼 수 있는가 (금액 직접)\n"
        "- reason: 이유"
    )
    return call_llm(ASK_SYSTEM, [text], ask_schema(features), lambda out: check_ask(out, features))


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
