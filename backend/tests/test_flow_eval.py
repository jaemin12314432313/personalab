from app.services import flow_eval

EVIDENCE = [
    {
        "turn": 1,
        "screen": {
            "url": "https://x.test/",
            "label": "시작",
            "description": "Plani\n시간표를 한곳에서",
            "elements": [
                {"id": "e1", "text": "시작하기", "kind": "button", "in_view": True},
                {"id": "e2", "text": "도움말", "kind": "link", "in_view": False},
            ],
        },
        "action": {"action": "click", "target": "e1"},
    },
    {
        "turn": 2,
        "screen": {
            "url": "https://x.test/join",
            "label": "가입",
            "description": "이메일을 입력하세요",
            "elements": [
                {"id": "e3", "text": "이메일", "kind": "input", "in_view": True},
                {"id": "e4", "text": "이전", "kind": "button", "in_view": True},
            ],
        },
        "action": {"action": "abandon"},
    },
]


def valid_output():
    criteria = {
        key: {
            "label": "나쁨" if key == "control" else "보통",
            "evidence": "S02 가입 화면에서 확인",
            "importance": "높음",
            "importance_reason": "이 사람은 빠르게 끝내고 싶어 한다",
        }
        for key in flow_eval.CRITERIA
    }
    return {
        "criteria": criteria,
        "complete": "아니오",
        "complete_reason": "입력할 게 많아서 귀찮아 그만둘래요",
        "drop_screen": "S02",
        "drop_reason": "TOO_MANY_STEPS",
        "opinions": {
            "screen_comments": [{"screen": "S02", "comment": "이메일부터 묻네요"}],
            "liked": "시작 화면이 간단했다",
            "disliked": "가입에서 바로 막혔다",
            "suggestion": "소셜 로그인을 넣어 주세요",
        },
    }


def test_build_flow_maps_screens_fields_and_click_target():
    flow = flow_eval.build_flow("가입하기", EVIDENCE)
    assert [s["id"] for s in flow["screens"]] == ["S01", "S02"]
    assert flow["path"] == ["S01", "S02"]
    assert flow["screens"][0]["elements"][0]["to"] == "S02"  # 누른 버튼이 다음 화면으로 이어짐
    assert flow["screens"][1]["fields"][0]["label"] == "이메일"


def test_build_flow_returns_none_without_screens():
    assert flow_eval.build_flow("과제", []) is None


def test_revisit_reuses_screen_id():
    again = [*EVIDENCE, {**EVIDENCE[0], "turn": 3, "action": {"action": "scroll"}}]
    flow = flow_eval.build_flow("과제", again)
    assert len(flow["screens"]) == 2
    assert flow["path"] == ["S01", "S02", "S01"]


def test_render_contains_path_and_auto_facts():
    text = flow_eval.render_flow(flow_eval.build_flow("가입하기", EVIDENCE))
    assert "S01 시작 → S02 가입" in text
    assert "[자동 집계]" in text
    assert "뒤로/이전/취소 버튼 있음(이전)" in text


def test_check_eval_accepts_valid_and_rejects_bad():
    flow = flow_eval.build_flow("가입하기", EVIDENCE)
    assert flow_eval.check_eval(valid_output(), flow) is None
    out = valid_output()
    out["drop_screen"] = "S09"
    assert "화면 id" in flow_eval.check_eval(out, flow)
    out = valid_output()
    out["drop_reason"] = "BORING"
    assert flow_eval.check_eval(out, flow) is not None
    out = valid_output()
    del out["criteria"]["error"]
    assert "기준 누락" in flow_eval.check_eval(out, flow)


def test_evaluate_flow_passes_token_limit_and_adds_screen_names(monkeypatch):
    flow = flow_eval.build_flow("가입하기", EVIDENCE)
    seen = {}

    def fake_call(system, contents, schema, check=None, max_output_tokens=None):
        seen["tokens"] = max_output_tokens
        seen["check"] = check(valid_output())
        return valid_output()

    monkeypatch.setattr(flow_eval, "call_llm", fake_call)
    out = flow_eval.evaluate_flow("30대 직장인", flow)
    assert seen == {"tokens": flow_eval.MAX_OUTPUT_TOKENS, "check": None}
    assert out["screens"] == {"S01": "시작", "S02": "가입"}
