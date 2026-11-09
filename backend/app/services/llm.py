"""공급자와 무관한 JSON 호출. 키·원본 응답을 오류와 로그에 노출하지 않는다."""
import base64
from copy import deepcopy
import json
import logging
import time
from collections.abc import Callable
from functools import cache

import httpx
from google import genai
from google.genai import errors, types

from app.core.config import (
    LLM_DEFAULT_MODEL, LLM_IMAGE_TYPES, LLM_RATE_LIMIT_WAIT_SEC,
    LLM_SERVER_BUSY_WAIT_SEC, OPENAI_API_BASE, OPENAI_DEFAULT_MODEL, PERSONA_TRANSMISSION_BLOCKED,
    OPENAI_RETRY_WAIT_SEC, settings,
)

Check = Callable[[dict], str | None]
HTTP_TOO_MANY_REQUESTS = 429
log = logging.getLogger("uvicorn.error.llm")


class LLMError(RuntimeError):
    """비밀정보를 포함하지 않는 실행 실패."""


class RetryableLLMError(LLMError):
    pass


def require_persona_transmission() -> None:
    if not settings.allow_persona_transmission:
        raise LLMError(PERSONA_TRANSMISSION_BLOCKED)


@cache
def get_client() -> genai.Client:
    if not settings.llm_api_key:
        raise LLMError("서버에 LLM_API_KEY를 설정해 주세요.")
    return genai.Client(api_key=settings.llm_api_key,
                        http_options=types.HttpOptions(timeout=settings.llm_timeout * 1000))


@cache
def get_openai_client() -> httpx.Client:
    return httpx.Client(base_url=OPENAI_API_BASE + "/", timeout=settings.llm_timeout,
                        follow_redirects=False)


def strict_schema(schema: dict) -> dict:
    result = deepcopy(schema)
    def visit(node):
        if isinstance(node, dict):
            if node.get("type") == "object":
                node.setdefault("properties", {})
                node["required"] = list(node["properties"])
                node["additionalProperties"] = False
            for value in node.values():
                visit(value)
        elif isinstance(node, list):
            for value in node:
                visit(value)
    visit(result)
    return result


def openai_text(system: str, contents: list, schema: dict) -> str:
    if not settings.llm_api_key:
        raise LLMError("서버에 LLM_API_KEY를 설정해 주세요.")
    user_content = []
    for part in contents:
        if isinstance(part, str):
            user_content.append({"type": "input_text", "text": part})
        elif isinstance(part, dict) and part.get("type") == "input_image":
            user_content.append(part)
        else:
            raise LLMError("지원하지 않는 LLM 입력 형식입니다.")
    model = settings.llm_model or OPENAI_DEFAULT_MODEL
    payload = {
        "model": model, "instructions": system,
        "input": [{"role": "user", "content": user_content}],
        "text": {"format": {"type": "json_schema", "name": "personalab_response",
                              "strict": True, "schema": strict_schema(schema)}},
        "max_output_tokens": settings.llm_max_output_tokens, "store": False,
    }
    if model.startswith("gpt-5.4"):
        payload["reasoning"] = {"effort": "none"}
    response = get_openai_client().post("responses", json=payload,
        headers={"Authorization": "Bearer " + settings.llm_api_key})
    try:
        body = response.json()
    except ValueError:
        body = {}
    if isinstance(body, dict) and isinstance(body.get("usage"), dict):
        usage = body.get("usage") or {}
        log.info("LLM provider=openai model=%s input_tokens=%s output_tokens=%s",
                 model, usage.get("input_tokens", 0), usage.get("output_tokens", 0))
    status = response.status_code
    if status >= 400:
        error = body.get("error", {}) if isinstance(body, dict) else {}
        code = error.get("code") if isinstance(error, dict) else None
        if status == 429 and code == "insufficient_quota":
            raise LLMError("OpenAI API 크레딧 또는 결제 한도를 확인해 주세요. (insufficient_quota)")
        if status in (401, 403):
            raise LLMError(f"OpenAI 키 또는 프로젝트의 모델 접근 권한을 확인해 주세요. (HTTP {status})")
        if status == 429 or status >= 500:
            raise RetryableLLMError(f"OpenAI 일시적 호출 제한 또는 서버 오류 (HTTP {status})")
        raise LLMError(f"OpenAI 요청 형식 또는 모델 설정을 확인해 주세요. (HTTP {status})")
    if not isinstance(body, dict) or body.get("status") != "completed":
        raise LLMError("OpenAI 응답이 완료되지 않았습니다. 출력 한도와 모델 상태를 확인해 주세요.")
    texts = []
    for item in body.get("output", []):
        if item.get("type") != "message":
            continue
        for content in item.get("content", []):
            if content.get("type") == "refusal":
                raise LLMError("모델이 이 요청에 응답하지 못했습니다.")
            if content.get("type") == "output_text":
                texts.append(content.get("text", ""))
    return "".join(texts)


def call_llm(system: str, contents: list, schema: dict, check: Check | None = None) -> dict:
    last_error = "사용할 수 있는 JSON 응답이 없습니다."
    for attempt in range(settings.llm_max_retries):
        try:
            if settings.llm_provider == "openai":
                text = openai_text(system, contents, schema)
            else:
                config = types.GenerateContentConfig(
                    system_instruction=system, response_mime_type="application/json",
                    response_json_schema=schema, max_output_tokens=settings.llm_max_output_tokens)
                response = get_client().models.generate_content(
                    model=settings.llm_model or LLM_DEFAULT_MODEL, contents=contents, config=config)
                text = response.text or "null"
            out = json.loads(text)
            if not isinstance(out, dict):
                last_error = "JSON 객체가 아닌 응답"
                continue
            problem = check(out) if check else None
            if problem is None:
                return out
            last_error = problem
        except json.JSONDecodeError:
            last_error = "JSON 형식이 아닌 응답"
        except RetryableLLMError as exc:
            last_error = str(exc)
            if attempt + 1 < settings.llm_max_retries:
                time.sleep(OPENAI_RETRY_WAIT_SEC * (attempt + 1))
        except httpx.RequestError:
            last_error = "OpenAI 연결 시간이 초과됐거나 연결할 수 없습니다."
            if attempt + 1 < settings.llm_max_retries:
                time.sleep(OPENAI_RETRY_WAIT_SEC)
        except errors.ServerError:
            last_error = "Gemini 서버가 일시적으로 응답하지 않습니다."
            time.sleep(LLM_SERVER_BUSY_WAIT_SEC)
        except errors.ClientError as exc:
            if exc.code != HTTP_TOO_MANY_REQUESTS:
                raise LLMError(f"LLM 호출 오류: 공급자 요청 확인 필요 (HTTP {exc.code})") from None
            last_error = "Gemini 호출 한도에 도달했습니다."
            time.sleep(LLM_RATE_LIMIT_WAIT_SEC)
    raise LLMError(f"LLM 응답 실패 ({settings.llm_max_retries}회 시도): {last_error}")


def image_part(data_url: str):
    head, _, data = data_url.partition(",")
    media = head.removeprefix("data:").removesuffix(";base64")
    if media not in LLM_IMAGE_TYPES or not data:
        return None
    try:
        decoded = base64.b64decode(data, validate=True)
    except (ValueError, base64.binascii.Error):
        return None
    if settings.llm_provider == "openai":
        return {"type": "input_image", "image_url": data_url}
    return types.Part.from_bytes(data=decoded, mime_type=media)
