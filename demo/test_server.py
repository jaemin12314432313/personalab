"""LLM·피그마 호출 없이 확인하는 테스트. 실행: backend/.venv/Scripts/python -m pytest demo"""

import json

import server as d

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


# ── Agent Loop 종료 조건 4개 (계획서 8-2) ──
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


# ── Ask 응답 검증 ──
def test_check_ask():
    ok = {"usage_intention": 4, "needed_features": ["A"], "unneeded_features": ["B"], "concern": "PRICE",
          "willingness_to_pay": 3000, "reason": ""}
    assert d.check_ask(ok, ["A", "B"]) is None
    assert d.check_ask({**ok, "needed_features": ["C"]}, ["A", "B"]) == "기능 목록 밖 응답"
    assert d.check_ask({**ok, "unneeded_features": ["A"]}, ["A", "B"]) == "필요/불필요 기능 중복"
    assert d.check_ask({**ok, "concern": "OTHER"}, ["A", "B"]) == "concern 카테고리 밖"


# ── 기획서 정리: 빈 응답은 재시도, 기능은 다듬고 8개까지 ──
def test_check_extract():
    assert d.check_extract({"name": "", "description": "", "features": [], "price": ""}) == "기획서에서 내용을 찾지 못함"
    out = {"name": "앱", "description": "설명", "features": [" A ", "", *"BCDEFGHIJ"], "price": ""}
    assert d.check_extract(out) is None and out["features"] == ["A", *"BCDEFGH"]


# ── 페르소나 샘플링: 범위 안, 같은 seed 면 같은 결과 ──
def test_sample_panel():
    req = d.PanelRequest(count=5, age=(21, 24), price_sensitivity=(0.6, 0.9), seed=1)
    panel = d.sample_panel(req)
    assert len({p["persona_id"] for p in panel}) == 5
    assert all(21 <= p["age"] <= 24 and 0.6 <= p["price_sensitivity"] <= 0.9 for p in panel)
    assert panel == d.sample_panel(req)


# ── 피그마 문서 → 화면·연결 ──
def test_extract_prototype():
    def btn(text, dest, legacy=False):
        node = {"type": "INSTANCE", "name": "Button", "children": [{"type": "TEXT", "characters": text}]}
        if legacy:
            node["transitionNodeID"] = dest
        else:
            node["interactions"] = [{"trigger": {"type": "ON_CLICK"},
                                     "actions": [{"type": "NODE", "destinationId": dest, "navigation": "NAVIGATE"}]}]
        return node

    doc = {"children": [{"type": "CANVAS", "flowStartingPoints": [{"nodeId": "1:2", "name": "Flow"}], "children": [
        {"type": "FRAME", "id": "1:9", "name": "고립된 화면", "children": []},
        {"type": "FRAME", "id": "1:2", "name": "온보딩", "children": [btn("시작하기", "1:3")]},
        {"type": "SECTION", "children": [
            {"type": "FRAME", "id": "1:3", "name": "가입", "children": [btn("다음", "1:4", legacy=True), btn("뒤로", "1:2")]},
            {"type": "FRAME", "id": "1:4", "name": "홈", "children": []},
        ]},
    ]}]}
    out = d.extract_prototype(doc)
    assert [s["label"] for s in out] == ["온보딩", "가입", "홈"]  # 시작 화면부터, 닿지 않는 화면 제외
    assert out[1]["elements"] == [{"text": "다음", "to_fid": "1:4"}, {"text": "뒤로", "to_fid": "1:2"}]


def test_figma_mock_without_token(monkeypatch):
    monkeypatch.setattr(d.settings, "figma_access_token", "")
    out = d.import_figma("https://www.figma.com/proto/anything/x")
    ids = {s["id"] for s in out["screens"]}
    assert out["mock"] and all(e["to"] in ids for s in out["screens"] for e in s["elements"])


def test_figma_file_key():
    assert d.figma_file_key("https://www.figma.com/design/AbC123xyz/My-App?node-id=1-2") == "AbC123xyz"
    assert d.figma_file_key("https://www.figma.com/proto/Zz9/x") == "Zz9"
    assert d.figma_file_key("https://example.com") is None
