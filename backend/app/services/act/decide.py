"""Act 한 턴의 판단 (계획서 8-3, 8-4).

루프·종료 조건·검증은 백엔드(loop.py)가 맡는다. 여기서는 한 화면에서 할 행동 하나만 정한다.
프롬프트는 demo/server.py 에서 이미 돌려 본 것을 옮겼다.
"""

from app.core.config import ACT_ABANDON, ACT_CLICK, DROP_REASONS
from app.services.llm import call_llm
from app.services.persona.sample import persona_card

ACT_SYSTEM = (
    "너는 앱을 처음 써보는 사용자다. 주어진 프로필의 사람으로서 행동한다. "
    "클릭 가능한 요소 목록에 없는 것은 선택할 수 없다. "
    "계속할 수 없다고 판단되면 그만둔다고 답한다. "
    "계속할 때는 target 에 누를 요소의 글자를 그대로, drop_reason 은 null. "
    "그만둘 때는 target 은 null, drop_reason 을 반드시 하나 고른다. "
    "reason 은 이 사람의 말투로 한 문장."
)


def act_schema(targets: list[str]) -> dict:
    """계획서 8-4 출력 모양. target 은 지금 화면의 버튼 글자만, drop_reason 은 8개 안에서만."""
    return {
        "type": "object",
        "properties": {
            "action": {"type": "string", "enum": [ACT_CLICK, ACT_ABANDON]},
            "target": {"type": ["string", "null"], "enum": [*targets, None]},
            "drop_reason": {"type": ["string", "null"], "enum": [*DROP_REASONS, None]},
            "reason": {"type": "string"},
        },
        "required": ["action", "target", "drop_reason", "reason"],
        "additionalProperties": False,
    }


def check_act(out: dict, targets: list[str]) -> str | None:
    """LLM 응답을 그대로 믿지 않는다. 목록 밖 버튼, 8개 밖 이탈 이유는 다시 묻는다."""
    if out.get("action") == ACT_CLICK:
        return None if out.get("target") in targets else "클릭 가능 목록 밖"
    if out.get("action") == ACT_ABANDON:
        return None if out.get("drop_reason") in DROP_REASONS else "drop_reason 이 8개 밖"
    return "action 형식 오류"


def decide_step(persona: dict, task: str, screen: dict, history: list[str]) -> dict:
    """페르소나가 현재 화면에서 할 행동 하나를 고른다.

    입력: persona = personas.attributes_json, task = 과제 문장,
          screen = {id, label, description, elements: [{text, to}]},
          history = 지금까지 지나온 화면 id 목록
    출력: {"action": "click", "target": "<elements 의 text>", "reason": "..."}
          또는 {"action": "abandon", "target": None,
                "drop_reason": "<8개 중 하나>", "reason": "..."}
    누를 버튼이 없는 화면은 AI 를 부르지 않고 NAVIGATION_LOST 로 그만둔다.
    끝내 검증을 통과하지 못하면 LLMError.
    """
    targets = [e["text"] for e in screen["elements"]]
    if not targets:
        return {
            "action": ACT_ABANDON,
            "target": None,
            "drop_reason": "NAVIGATION_LOST",
            "reason": "누를 것이 없다",
        }
    text = (
        f"Persona\n{persona_card(persona)}\n\n"
        f"Task\n{task}\n\n"
        f"Screen\n현재 화면: {screen['label']}\n"
        f"화면 설명: {screen.get('description') or '(설명 없음)'}\n"
        f"클릭 가능: {' '.join(f'[{t}]' for t in targets)}\n\n"
        f"History\n지금까지: {' → '.join([*history, '(현재)'])}"
    )
    out = call_llm(ACT_SYSTEM, [text], act_schema(targets), lambda o: check_act(o, targets))
    if out["action"] == ACT_CLICK:  # 클릭에는 이탈 이유를 남기지 않는다
        return {"action": ACT_CLICK, "target": out["target"], "reason": out["reason"]}
    return {
        "action": ACT_ABANDON,
        "target": None,
        "drop_reason": out["drop_reason"],
        "reason": out["reason"],
    }
