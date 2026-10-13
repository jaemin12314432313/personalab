"""services/llm.py 재시도·검증 규칙. 실제 LLM 은 부르지 않는다 (가짜 클라이언트)."""

from types import SimpleNamespace

import pytest
from google.genai import errors

from app.services import llm


class FakeClient:
    """outputs 를 차례로 낸다. 문자열은 응답 text, 예외는 그대로 던진다."""

    def __init__(self, *outputs):
        self.outputs = list(outputs)
        self.calls = 0
        self.models = self

    def generate_content(self, **kwargs):
        self.calls += 1
        out = self.outputs.pop(0)
        if isinstance(out, Exception):
            raise out
        return SimpleNamespace(text=out)


@pytest.fixture
def fake(monkeypatch):
    """get_client 를 가짜로 바꾸고 대기 시간(sleep)을 기록만 한다."""
    slept = []
    monkeypatch.setattr(llm.time, "sleep", slept.append)

    def install(*outputs):
        client = FakeClient(*outputs)
        monkeypatch.setattr(llm, "get_client", lambda: client)
        return client, slept

    return install


def ask(check=None):
    return llm.call_llm("system", ["contents"], {"type": "object"}, check)


def test_returns_dict_on_first_valid_answer(fake):
    client, _ = fake('{"score": 3}')
    assert ask() == {"score": 3}
    assert client.calls == 1


def test_retries_when_check_rejects(fake):
    client, _ = fake('{"score": 9}', '{"score": 3}')
    out = ask(check=lambda o: None if o["score"] <= 5 else "범위 밖")
    assert out == {"score": 3}
    assert client.calls == 2


def test_retries_on_broken_json_and_non_object(fake):
    client, _ = fake("not json", "[1, 2]", '{"ok": true}')
    assert ask() == {"ok": True}
    assert client.calls == 3


def test_rate_limit_waits_then_retries(fake):
    client, slept = fake(errors.ClientError(429, {"error": {"message": "quota"}}), '{"ok": true}')
    assert ask() == {"ok": True}
    assert slept == [llm.LLM_RATE_LIMIT_WAIT_SEC]


def test_other_client_error_fails_immediately(fake):
    client, _ = fake(errors.ClientError(400, {"error": {"message": "bad"}}), '{"ok": true}')
    with pytest.raises(llm.LLMError, match="LLM 호출 오류"):
        ask()
    assert client.calls == 1


def test_gives_up_after_max_retries(fake):
    client, _ = fake(*["null"] * llm.settings.llm_max_retries)
    with pytest.raises(llm.LLMError, match="응답 실패"):
        ask()
    assert client.calls == llm.settings.llm_max_retries


def test_image_part_rejects_unknown_types():
    assert llm.image_part("data:text/html;base64,PGI+") is None
    assert llm.image_part("data:image/png;base64,iVBORw0KGgo=") is not None
