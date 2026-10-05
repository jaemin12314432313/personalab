"""⚠️ AI/Data 팀 교체 지점. Act 한 턴의 판단 (계획서 8-3, 8-4).

루프·종료 조건·검증은 백엔드(loop.py)가 맡는다. 여기서는 한 화면에서 할 행동 하나만 정한다.
"""

from app.core.config import ACT_ABANDON, ACT_CLICK


def decide_step(persona: dict, task: str, screen: dict, history: list[str]) -> dict:
    """페르소나가 현재 화면에서 할 행동 하나를 고른다.

    입력: persona = personas.attributes_json, task = 과제 문장,
          screen = {id, label, description, elements: [{text, to}]},
          history = 지금까지 지나온 화면 id 목록
    출력: {"action": "click", "target": "<elements 의 text>", "reason": "..."}
          또는 {"action": "abandon", "target": None,
                "drop_reason": "<8개 중 하나>", "reason": "..."}
    목록 밖 target, 8개 밖 drop_reason 은 loop.py 가 무효로 보고 다시 묻는다.

    지금은 LLM 없이 첫 번째 버튼을 누르는 임시 구현이다.
    """
    elements = screen["elements"]
    if not elements:
        return {
            "action": ACT_ABANDON,
            "target": None,
            "drop_reason": "NAVIGATION_LOST",
            "reason": "누를 것이 없다",
        }
    return {
        "action": ACT_CLICK,
        "target": elements[0]["text"],
        "reason": "(임시 구현) 첫 번째 버튼",
    }
