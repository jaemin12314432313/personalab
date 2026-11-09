"""실제 연결 함수의 입력 경계와 관찰 범위를 유료 호출 없이 확인한다."""

from types import SimpleNamespace

import pytest

from app.services.act import decide
from app.services.ask import answer
from app.services.persona import sample


def test_missing_source_files_fail_before_engine_loading(monkeypatch, tmp_path):
    monkeypatch.setattr(sample, "_ENGINE", tmp_path / "data" / "persona_engine" / "src")
    with pytest.raises(FileNotFoundError, match="p24v32_KMP_spss.sav"):
        sample._engine_api()


def test_sampling_forwards_conditions_and_seed(monkeypatch):
    calls = []
    fake = SimpleNamespace(
        parse_conditions=lambda conditions: calls.append(("validate", conditions)),
        generate=lambda conditions, n, seed: [{"card_text": f"{n}/{seed}", "source": {}}],
    )
    monkeypatch.setattr(sample, "_engine_api", lambda: fake)
    assert sample.sample_personas({"preset": "univ"}, 5, 42)[0]["card_text"] == "5/42"
    assert calls == [("validate", {"preset": "univ"})]


def test_ask_uses_card_without_numeric_traits(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "allow_persona_transmission", True)
    captured = {}
    expected = {
        "usage_intention": 3,
        "needed_features": ["정리"],
        "unneeded_features": [],
        "concern": "PRICE",
        "willingness_to_pay": 0,
        "reason": "가격을 확인하고 싶다",
    }

    def fake_call(_system, contents, schema, check):
        captured["contents"] = contents
        assert check(expected) is None
        return expected

    monkeypatch.setattr(answer, "call_llm", fake_call)
    persona = {"card_text": "20세 대학생", "traits": {"price": 0.987654}}
    assert (
        answer.ask_persona(
            persona, {"description": "일정 정리", "features": ["정리"], "price": "무료"}, []
        )
        == expected
    )
    assert "0.987654" not in str(captured["contents"])


def test_act_only_sees_current_screen_and_validates_choices(monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "allow_persona_transmission", True)

    def fake_call(_system, contents, _schema, check):
        text = "\n".join(contents)
        assert "S02" in text
        assert '"to"' not in text
        assert "S99" not in text
        assert "0.987654" not in text
        assert check(
            {"action": "click", "target": "없는 버튼", "drop_reason": None, "reason": "이동"}
        )
        out = {
            "action": "click",
            "target": "다음",
            "drop_reason": None,
            "reason": "다음으로 이동한다",
        }
        assert check(out) is None
        return out

    monkeypatch.setattr(decide, "call_llm", fake_call)
    screen = {
        "id": "S02",
        "label": "가입",
        "description": "학교 인증",
        "elements": [{"text": "다음", "to": "S99"}],
    }
    out = decide.decide_step(
        {"card_text": "20세 대학생", "traits": {"price": 0.987654}}, "가입하세요", screen, ["S01"]
    )
    assert out["target"] == "다음"


def test_ask_rejects_boolean_and_invalid_lists():
    assert answer.check_ask({"usage_intention": True}, ["정리"])
    assert answer.check_ask(
        {"usage_intention": 3, "needed_features": "정리", "unneeded_features": []}, ["정리"]
    )


def test_card_transmission_is_blocked_before_any_provider_call(monkeypatch):
    from app.core.config import settings
    from app.services.llm import LLMError

    monkeypatch.setattr(settings, "allow_persona_transmission", False)
    calls = []
    monkeypatch.setattr(decide, "call_llm", lambda *args: calls.append("act"))
    monkeypatch.setattr(answer, "call_llm", lambda *args: calls.append("ask"))
    with pytest.raises(LLMError, match="외부 전송이 보류"):
        decide.decide_step(
            {"card_text": "원본 카드"}, "가입", {"id": "S1", "label": "시작", "elements": []}, []
        )
    with pytest.raises(LLMError, match="외부 전송이 보류"):
        answer.ask_persona(
            {"card_text": "원본 카드"},
            {"description": "설명", "features": ["기능"], "price": "무료"},
            [],
        )
    assert calls == []
