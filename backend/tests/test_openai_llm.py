"""OpenAI payload, retry bounds, refusal and credential-safe errors."""
import json

import httpx
import pytest

from app.services import llm


@pytest.fixture
def transport(monkeypatch):
    monkeypatch.setattr(llm.settings, "llm_provider", "openai")
    monkeypatch.setattr(llm.settings, "llm_model", "gpt-5.4-mini")
    monkeypatch.setattr(llm.settings, "llm_api_key", "test-secret-not-real")
    monkeypatch.setattr(llm.time, "sleep", lambda _: None)
    calls = []
    responses = []
    def handle(request):
        calls.append(request)
        return responses.pop(0)
    client = httpx.Client(transport=httpx.MockTransport(handle), base_url="https://api.openai.com/v1/")
    monkeypatch.setattr(llm, "get_openai_client", lambda: client)
    yield calls, responses
    client.close()


def success(value):
    return httpx.Response(200, json={"status": "completed", "output": [
        {"type": "message", "content": [{"type": "output_text", "text": json.dumps(value)}]}],
        "usage": {"input_tokens": 10, "output_tokens": 5}})


def test_openai_sends_strict_server_only_payload(transport):
    calls, responses = transport
    responses.append(success({"ok": True}))
    assert llm.call_llm("rules", ["persona"], {"type": "object",
        "properties": {"ok": {"type": "boolean"}}}) == {"ok": True}
    body = json.loads(calls[0].content)
    assert calls[0].url == "https://api.openai.com/v1/responses"
    assert body["text"]["format"]["strict"] is True
    assert body["text"]["format"]["schema"]["additionalProperties"] is False
    assert body["text"]["format"]["schema"]["required"] == ["ok"]
    assert body["store"] is False
    assert body["max_output_tokens"] == llm.settings.llm_max_output_tokens
    assert body["reasoning"] == {"effort": "none"}
    assert "test-secret-not-real" not in calls[0].content.decode()


@pytest.mark.parametrize("status,code", [(401, "invalid_api_key"), (403, "permission_denied"),
                                        (429, "insufficient_quota"), (400, "bad_request")])
def test_permanent_errors_never_retry_or_echo_secrets(transport, status, code):
    calls, responses = transport
    responses.append(httpx.Response(status, json={"error": {
        "code": code, "message": "test-secret-not-real should never be exposed"}}))
    with pytest.raises(llm.LLMError) as error:
        llm.call_llm("rules", ["persona"], {"type": "object"})
    assert len(calls) == 1
    assert "test-secret-not-real" not in str(error.value)


def test_transient_error_then_schema_rejection_are_bounded(transport):
    calls, responses = transport
    responses.extend([httpx.Response(503, json={"error": {}}), success({"target": "invented"}),
                      success({"target": "다음"})])
    value = llm.call_llm("rules", ["persona"], {"type": "object"},
                         lambda out: None if out["target"] == "다음" else "목록 밖")
    assert value["target"] == "다음"
    assert len(calls) == llm.settings.llm_max_retries


def test_refusal_is_not_parsed_as_a_persona_response(transport):
    calls, responses = transport
    responses.append(httpx.Response(200, json={"status": "completed", "output": [
        {"type": "message", "content": [{"type": "refusal", "refusal": "private"}]}]}))
    with pytest.raises(llm.LLMError, match="응답하지 못"):
        llm.call_llm("rules", ["persona"], {"type": "object"})
    assert len(calls) == 1
