"""Agent Loop 종료 조건 4개 확인 (LLM 호출 없이). 실행: backend/.venv/Scripts/python -m pytest demo"""

import json

import act_demo as d

SCREENS = [
    {"id": "S01", "label": "온보딩", "elements": [{"text": "시작하기", "to": "S02"}]},
    {"id": "S02", "label": "가입", "elements": [{"text": "다음", "to": "S03"}, {"text": "뒤로", "to": "S01"}]},
    {"id": "S03", "label": "홈"},
]


def run(answers, monkeypatch):
    it = iter(answers)
    monkeypatch.setattr(d, "llm", lambda *a: next(it))
    req = d.RunRequest(persona={}, task="가입", goal="S03", screens=SCREENS)
    return [json.loads(line) for line in d.agent_loop(req)][-1]


def click(t):
    return {"action": "click", "target": t, "drop_reason": None, "reason": ""}


def test_complete(monkeypatch):
    assert run([click("시작하기"), click("다음")], monkeypatch)["result"] == "complete"


def test_abandon(monkeypatch):
    end = run([{"action": "abandon", "target": None, "drop_reason": "PRIVACY", "reason": ""}], monkeypatch)
    assert (end["result"], end["drop_reason"]) == ("drop", "PRIVACY")


def test_visited_loop(monkeypatch):
    end = run([click("시작하기"), click("뒤로"), click("시작하기")], monkeypatch)
    assert end["drop_reason"] == "NAVIGATION_LOST"


def test_max_turns(monkeypatch):
    end = run([click("없는버튼")] * d.settings.max_turns, monkeypatch)
    assert end["drop_reason"] == d.DROP_REASON_MAX_TURNS
