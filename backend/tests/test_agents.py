"""Ask·Act 에이전트와 임시 페르소나. 실제 LLM 은 부르지 않는다 (가짜 call_llm).

가짜는 진짜 call_llm 처럼 check 로 응답을 검증하고, 문제가 있으면 LLMError 를 던진다.
"""

import re

import pytest

from app.core.config import DROP_REASONS
from app.services import llm
from app.services.act import decide
from app.services.ask import answer
from app.services.persona.sample import persona_card, sample_personas

PERSONA = {"card_text": "24세 여자 대학생이고 수도권 지역에 산다.", "traits": {"price": "높음"}}
PRODUCT = {"description": "일정 정리", "features": ["자동 정리", "친구 공유"], "price": "기본 무료"}
SCREEN = {
    "id": "S02",
    "label": "회원가입",
    "description": "이메일과 휴대폰 번호 인증이 필요해요.",
    "elements": [{"text": "다음", "to": "S03"}, {"text": "뒤로", "to": "S01"}],
}


class FakeLLM:
    """out 을 돌려주되, 진짜처럼 check 가 문제를 찾으면 LLMError. 받은 인자는 calls 에 쌓는다."""

    def __init__(self, out):
        self.out, self.calls = out, []

    def __call__(self, system, contents, schema, check=None):
        self.calls.append({"system": system, "contents": contents, "schema": schema})
        problem = check(self.out) if check else None
        if problem:
            raise llm.LLMError(problem)
        return self.out


def good_ask(**change):
    out = {
        "usage_intention": 2,
        "needed_features": ["자동 정리"],
        "unneeded_features": ["친구 공유"],
        "concern": "PRIVACY",
        "willingness_to_pay": 0,
        "reason": "개인정보가 걱정돼요.",
    }
    return {**out, **change}


# ── Ask ─────────────────────────────────────────────────────
def test_ask_sends_card_and_product_and_limits_the_answer_shape(monkeypatch):
    fake = FakeLLM(good_ask())
    monkeypatch.setattr(answer, "call_llm", fake)

    assert answer.ask_persona(PERSONA, PRODUCT, []) == good_ask()

    sent = fake.calls[0]["contents"][0]
    assert PERSONA["card_text"] in sent and "자동 정리, 친구 공유" in sent and "기본 무료" in sent
    props = fake.calls[0]["schema"]["properties"]
    assert props["needed_features"]["items"]["enum"] == PRODUCT["features"]
    assert props["concern"]["enum"] == list(DROP_REASONS)


def test_ask_rejects_feature_outside_the_list(monkeypatch):
    monkeypatch.setattr(answer, "call_llm", FakeLLM(good_ask(needed_features=["없는 기능"])))
    with pytest.raises(llm.LLMError, match="기능 목록 밖"):
        answer.ask_persona(PERSONA, PRODUCT, [])


# ── Act ─────────────────────────────────────────────────────
def test_act_click_keeps_only_listed_target(monkeypatch):
    fake = FakeLLM(
        {"action": "click", "target": "다음", "drop_reason": "PRIVACY", "reason": "계속 갈게요"}
    )
    monkeypatch.setattr(decide, "call_llm", fake)

    out = decide.decide_step(PERSONA, "가입하세요", SCREEN, ["S01"])

    assert out == {
        "action": "click",
        "target": "다음",
        "reason": "계속 갈게요",
    }  # 클릭엔 이탈 이유 없음
    assert fake.calls[0]["schema"]["properties"]["target"]["enum"] == ["다음", "뒤로", None]
    sent = fake.calls[0]["contents"][0]
    assert "[다음] [뒤로]" in sent and "S01 → (현재)" in sent and "가입하세요" in sent


def test_act_abandon_carries_one_of_the_eight_reasons(monkeypatch):
    fake = FakeLLM(
        {"action": "abandon", "target": None, "drop_reason": "PRIVACY", "reason": "부담돼요"}
    )
    monkeypatch.setattr(decide, "call_llm", fake)
    out = decide.decide_step(PERSONA, "가입하세요", SCREEN, [])
    assert out == {
        "action": "abandon",
        "target": None,
        "drop_reason": "PRIVACY",
        "reason": "부담돼요",
    }


@pytest.mark.parametrize(
    "bad, why",
    [
        ({"action": "click", "target": "로그인", "drop_reason": None, "reason": "x"}, "목록 밖"),
        ({"action": "abandon", "target": None, "drop_reason": "BORED", "reason": "x"}, "8개 밖"),
        ({"action": "scroll", "target": None, "drop_reason": None, "reason": "x"}, "형식 오류"),
    ],
)
def test_act_rejects_answers_the_prototype_cannot_take(monkeypatch, bad, why):
    monkeypatch.setattr(decide, "call_llm", FakeLLM(bad))
    with pytest.raises(llm.LLMError, match=why):
        decide.decide_step(PERSONA, "가입하세요", SCREEN, [])


def test_act_with_no_buttons_gives_up_without_calling_llm(monkeypatch):
    fake = FakeLLM({})
    monkeypatch.setattr(decide, "call_llm", fake)
    out = decide.decide_step(PERSONA, "가입하세요", {**SCREEN, "elements": []}, [])
    assert (out["action"], out["drop_reason"]) == ("abandon", "NAVIGATION_LOST")
    assert fake.calls == []


# ── 임시 페르소나 ────────────────────────────────────────────
def test_sample_personas_follow_the_engine_shape_and_are_repeatable():
    people = sample_personas({}, 4, seed=7)
    assert people == sample_personas({}, 4, seed=7)
    assert people != sample_personas({}, 4, seed=8)
    for p in people:
        assert set(p) == {"profile", "card_text", "traits", "source"}
        assert set(p["profile"]) == {"age", "sex", "region", "job_group"}
        assert set(p["traits"]) == {"price", "digital", "privacy"}
        assert p["source"]["stand_in"] is True


def test_sample_personas_read_age_and_job_conditions():
    for cond in ({"age": "30-39", "job": ["사무·관리"]}, {"age": [30, 39], "job": "사무·관리"}):
        for p in sample_personas(cond, 10, seed=1):
            assert 30 <= p["profile"]["age"] <= 39
            assert p["profile"]["job_group"] == "사무·관리"
    assert all(
        20 <= p["profile"]["age"] <= 29 for p in sample_personas({"age": "엉터리"}, 5, seed=1)
    )


def test_card_text_has_no_money_or_score_numbers_besides_age():
    for p in sample_personas({}, 20, seed=3):
        digits = re.findall(r"\d+", p["card_text"])
        assert digits == [str(p["profile"]["age"])]  # 숫자는 나이 하나뿐 (엔진 카드와 같은 원칙)


def test_persona_card_falls_back_to_whole_attributes():
    assert persona_card({"card_text": "카드"}) == "카드"
    assert "age" in persona_card({"age": 24})
