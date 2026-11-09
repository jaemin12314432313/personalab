"""AI 호출 없는 규칙 기반 판단: 비용·카드 전송 없이 규칙을 지키며 돌아가는지. DB 없이 돈다."""
import pytest

from app.core.config import ACT_ABANDON, ACT_CLICK, DROP_REASONS, RULE_REASON_PREFIX, settings
from app.services import rule_agent
from app.services.act.loop import agent_loop

PERSONA = {"card_text": "서울에 사는 30대 직장인"}
SCREENS = {
    "A": {"id": "A", "label": "시작", "elements": [{"text": "둘러보기", "to": "B"}, {"text": "도움말", "to": "A"}]},
    "B": {"id": "B", "label": "가입", "elements": [{"text": "가입 완료", "to": "C"}]},
    "C": {"id": "C", "label": "홈", "elements": []},
}


def test_engine_selection(monkeypatch):
    monkeypatch.setattr(settings, "agent_engine", "auto")
    monkeypatch.setattr(settings, "llm_api_key", "")
    monkeypatch.setattr(settings, "allow_persona_transmission", False)
    assert rule_agent.use_rule_engine() is True
    monkeypatch.setattr(settings, "llm_api_key", "key")
    assert rule_agent.use_rule_engine() is True  # 키만 있고 카드 전송 허용이 없으면 여전히 규칙 기반
    monkeypatch.setattr(settings, "allow_persona_transmission", True)
    assert rule_agent.use_rule_engine() is False
    monkeypatch.setattr(settings, "agent_engine", "rule")
    assert rule_agent.use_rule_engine() is True


def test_manual_screens_complete_without_any_model_call():
    rows = agent_loop(PERSONA, "가입을 완료하세요", SCREENS, "A", "C", 6, decide=rule_agent.decide_screens)
    assert rows[-1]["action"] == "complete"
    assert all((r["reason"] or "").startswith(RULE_REASON_PREFIX) for r in rows if r["action"] == ACT_CLICK)


def test_screens_without_buttons_abandon_with_a_valid_code():
    out = rule_agent.decide_screens(PERSONA, "", {"elements": []}, [])
    assert out["action"] == ACT_ABANDON and out["drop_reason"] in DROP_REASONS and out["engine"] == "rule"


def element(i, text, kind="a", **extra):
    return {"id": f"pl-{i}", "text": text, "kind": kind, "type": extra.pop("type", ""), "filled": False, **extra}


def test_browser_never_repeats_or_touches_sensitive_controls():
    screen = {"elements": [element(0, "결제하기", "button"), element(1, "상품 보기"), element(2, "삭제", "button")]}
    first = rule_agent.decide_browser(PERSONA, "상품을 찾는다", screen, None, [])
    assert first["action"] == ACT_CLICK and first["target"] == "pl-1"
    done = [{"target": "상품 보기"}]
    out = rule_agent.decide_browser(PERSONA, "상품을 찾는다", screen, None, done)
    assert out["action"] == ACT_ABANDON and out["drop_reason"] in DROP_REASONS  # 남은 것은 결제·삭제뿐이라 멈춘다


def test_browser_fills_an_empty_input_once_before_clicking():
    screen = {"elements": [element(0, "이메일", "input", type="email"), element(1, "다음", "button")]}
    first = rule_agent.decide_browser(PERSONA, "", screen, None, [])
    assert first["action"] == "fill" and first["target"] == "pl-0" and first["value"]
    second = rule_agent.decide_browser(PERSONA, "", screen, None, [{"target": "이메일"}])
    assert second["action"] == ACT_CLICK and second["target"] == "pl-1"


def test_different_personas_can_take_different_equal_choices():
    screen = {"elements": [element(i, f"메뉴{i}") for i in range(6)]}
    picks = {rule_agent.decide_browser({"card_text": f"사람 {n}"}, "", screen, None, [])["target"] for n in range(12)}
    assert len(picks) > 1


@pytest.mark.parametrize("text", ["구매 확정", "탈퇴", "게시", "송금"])
def test_sensitive_words_are_not_clicked(text):
    out = rule_agent.decide_browser(PERSONA, "", {"elements": [element(0, text, "button")]}, None, [])
    assert out["action"] == ACT_ABANDON



def test_browser_stays_on_the_same_site():
    """다른 출처 링크와 로그인류 버튼을 누르면 허용 범위 밖 요청으로 실행이 멈추므로 고르지 않는다."""
    screen = {"url": "https://app.example.com/home", "elements": [
        element(0, "Google 계정으로 로그인", "a", href="https://accounts.google.com/signin"),
        element(1, "로그인", "button"),
        element(2, "문의 메일", "a", href="mailto:help@example.com"),
        element(3, "설정", "a", href="https://app.example.com/settings"),
    ]}
    out = rule_agent.decide_browser(PERSONA, "", screen, None, [])
    assert out["action"] == ACT_CLICK and out["target"] == "pl-3"
    only_leaving = {"url": "https://app.example.com/", "elements": [element(0, "로그인", "button"), element(1, "외부", "a", href="https://other.com/x")]}
    assert rule_agent.decide_browser(PERSONA, "", only_leaving, None, [])["action"] == ACT_ABANDON


def test_html_prototype_external_links_are_skipped():
    screen = {"url": "/index.html", "elements": [element(0, "외부 사이트", "a", href="https://example.org/"), element(1, "다음", "a", href="/next.html")]}
    assert rule_agent.decide_browser(PERSONA, "", screen, None, [])["target"] == "pl-1"


def test_same_site_login_link_is_still_skipped():
    screen = {"url": "https://app.example.com/", "elements": [element(0, "로그인", "a", href="https://app.example.com/login"), element(1, "요금제", "a", href="https://app.example.com/pricing")]}
    assert rule_agent.decide_browser(PERSONA, "", screen, None, [])["target"] == "pl-1"


def test_links_are_preferred_over_buttons():
    """버튼은 클릭 시 데이터를 보내는 요청으로 실행이 멈추기 쉬워 같은 사이트 링크를 먼저 고른다."""
    screen = {"url": "https://app.example.com/", "elements": [element(0, "업로드 및 도구", "button"), element(1, "이미지", "a", href="https://app.example.com/images")]}
    assert rule_agent.decide_browser(PERSONA, "", screen, None, [])["target"] == "pl-1"


def test_decisions_take_human_like_time_when_a_delay_is_configured(monkeypatch):
    from app.core.config import settings
    from app.services import rule_agent
    slept=[]
    monkeypatch.setattr(rule_agent.time,'sleep',lambda s:slept.append(s))
    monkeypatch.setattr(settings,'rule_step_delay_ms',2000)
    screen={'elements':[{'id':'E1','text':'시작','kind':'button'}]}
    rule_agent.decide_browser({'source':{'persona_id':'P1'}},'과제',screen,None,[])
    rule_agent.decide_browser({'source':{'persona_id':'P2'}},'과제',screen,None,[])
    assert len(slept)==2 and all(1.2<=s<=2.8 for s in slept) and slept[0]!=slept[1]
    monkeypatch.setattr(settings,'rule_step_delay_ms',0);slept.clear()
    rule_agent.decide_browser({'source':{'persona_id':'P1'}},'과제',screen,None,[])
    assert slept==[]
