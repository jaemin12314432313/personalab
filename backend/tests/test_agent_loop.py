"""Agent Loop 종료 조건 네 가지 (계획서 8-2, CLAUDE.md 절대 변경 금지). DB 없이 돈다."""

from app.services.act.loop import agent_loop

SCREENS = {
    "S01": {"id": "S01", "label": "온보딩", "elements": [{"text": "시작하기", "to": "S02"}]},
    "S02": {
        "id": "S02",
        "label": "회원가입",
        "elements": [{"text": "다음", "to": "S03"}, {"text": "뒤로", "to": "S01"}],
    },
    "S03": {"id": "S03", "label": "홈", "elements": []},
}


def press(*answers):
    """answers 를 차례로 내는 가짜 decide. 다 쓰면 마지막 것을 반복. 문자열은 그 버튼 클릭."""
    seq = list(answers)

    def decide(persona, task, screen, history):
        a = seq.pop(0) if len(seq) > 1 else seq[0]
        return a if isinstance(a, dict) else {"action": "click", "target": a, "reason": "테스트"}

    return decide


def run(decide, max_turns=10):
    return agent_loop({}, "가입하세요", SCREENS, "S01", "S03", max_turns, decide)


def test_goal_reached():
    rows = run(press("시작하기", "다음"))
    assert [r["action"] for r in rows] == ["click", "click", "complete"]
    assert rows[-1]["screen_id"] == "S03"


def test_abandon_records_reason():
    quit_ = {
        "action": "abandon",
        "target": None,
        "drop_reason": "PRIVACY",
        "reason": "정보를 너무 묻는다",
    }
    rows = run(press("시작하기", quit_))
    assert rows[-1]["action"] == "abandon"
    assert rows[-1]["drop_reason"] == "PRIVACY"
    assert rows[-1]["screen_id"] == "S02"


def test_revisit_stops_with_navigation_lost():
    rows = run(press("시작하기", "뒤로", "시작하기"))
    assert rows[-1]["action"] == "stop"
    assert rows[-1]["drop_reason"] == "NAVIGATION_LOST"


def test_invalid_answers_hit_max_turns():
    rows = run(press("없는 버튼"), max_turns=3)
    assert len(rows) == 1
    assert rows[0]["action"] == "stop"
    assert rows[0]["drop_reason"] == "MAX_TURNS"


def test_drop_reason_outside_categories_is_retried():
    bad = {"action": "abandon", "target": None, "drop_reason": "BORED", "reason": "?"}
    rows = run(press(bad, "시작하기", "다음"))
    assert [r["action"] for r in rows] == ["click", "click", "complete"]
