"""Act 모드 Agent Loop (계획서 8-2). 백엔드 몫.

8-2 의사코드를 그대로 옮겼다. 종료 조건 네 가지(CLAUDE.md 절대 변경 금지)를 지킨다.
· 목표 화면 도달 → complete   · 이탈 선언 → abandon(drop_reason)
· MAX_TURNS 초과 → stop(MAX_TURNS)   · 같은 화면 재방문 → stop(NAVIGATION_LOST)
"""

from collections.abc import Callable

from app.core.config import (
    ACT_ABANDON,
    ACT_CLICK,
    ACT_COMPLETE,
    ACT_STOP,
    DROP_REASON_MAX_TURNS,
    DROP_REASONS,
)
from app.services.act.decide import decide_step

Decide = Callable[[dict, str, dict, list[str]], dict]


def check_step(out: dict, targets: dict[str, str | None]) -> str | None:
    """응답이 형식과 목록을 지키는지. 문제가 있으면 이유를, 없으면 None."""
    if out.get("action") == ACT_ABANDON:
        return None if out.get("drop_reason") in DROP_REASONS else "drop_reason 이 8개 카테고리 밖"
    if out.get("action") != ACT_CLICK:
        return "action 형식 오류"
    if out.get("target") not in targets:
        return "클릭 가능 목록 밖"
    return None


def _row(
    turn: int, screen_id: str, action: str, target=None, drop_reason=None, reason=None
) -> dict:
    return {
        "turn": turn,
        "screen_id": screen_id,
        "action": action,
        "target": target,
        "drop_reason": drop_reason,
        "reason": reason,
    }


def agent_loop(
    persona: dict,
    task: str,
    screens: dict[str, dict],
    start: str,
    goal: str,
    max_turns: int,
    decide: Decide = decide_step,
) -> list[dict]:
    """한 페르소나의 Act 실행. act_logs 에 넣을 행 목록을 돌려준다."""
    rows: list[dict] = []
    current = start
    visited: list[str] = []
    history: list[str] = []
    for turn in range(max_turns):  # 상한 필수
        screen = screens[current]
        targets = {e["text"]: e.get("to") for e in screen["elements"]}
        resp = decide(persona, task, screen, history)
        # 목록 밖 응답 → 다시 묻는다. 턴이 소모되므로 MAX_TURNS 가 막는다
        if check_step(resp, targets):
            continue
        rows.append(
            _row(
                turn,
                current,
                resp["action"],
                resp.get("target"),
                resp.get("drop_reason"),
                resp.get("reason"),
            )
        )
        if resp["action"] == ACT_ABANDON:
            return rows

        history.append(current)
        current = targets[resp["target"]] or current  # 연결이 없는 버튼은 제자리
        if current == goal:
            rows.append(_row(turn, current, ACT_COMPLETE))
            return rows
        if current in visited:  # 같은 화면 반복
            rows.append(_row(turn, current, ACT_STOP, drop_reason="NAVIGATION_LOST"))
            return rows
        visited.append(current)

    rows.append(_row(max_turns, current, ACT_STOP, drop_reason=DROP_REASON_MAX_TURNS))
    return rows
