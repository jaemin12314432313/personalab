"""OpenAI용 call_llm. backend/app/services/llm.py(Gemini)와 같은 모양·규칙으로 맞췄다.

· JSON 스키마로 형식을 강제(strict)하고, check로 값까지 검증한다
· 문제가 있으면 그 이유를 알려주며 다시 묻는다. 최대 settings.llm_max_retries 회
· 429(호출 한도)·5xx는 기다렸다 재시도, 잔액 부족·인증·요청 오류는 바로 실패
· 실제 사용 토큰을 USAGE에 쌓는다 (비용 계산용)
"""
import copy
import json
import time

from openai import (APIConnectionError, APIStatusError, APITimeoutError, InternalServerError, OpenAI,
                    RateLimitError)

from app.core.config import LLM_RATE_LIMIT_WAIT_SEC, LLM_SERVER_BUSY_WAIT_SEC, settings
from app.services.llm import LLMError

USAGE = {"calls": 0, "input": 0, "output": 0, "reasoning": 0, "retry_reasons": []}
_client = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.llm_api_key, timeout=settings.llm_timeout, max_retries=0)
    return _client


def strict_schema(schema: dict) -> dict:
    """OpenAI strict 모드 규칙: 모든 object에 additionalProperties=false, 모든 속성 required."""
    s = copy.deepcopy(schema)

    def walk(node):
        if isinstance(node, dict):
            if node.get("type") == "object" and "properties" in node:
                node["additionalProperties"] = False
                node["required"] = list(node["properties"])
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)
    walk(s)
    return s


def call_llm(system: str, contents: list, schema: dict, check=None) -> dict:
    messages = [{"role": "system", "content": system}, {"role": "user", "content": "\n\n".join(contents)}]
    fmt = {"type": "json_schema", "json_schema": {"name": "result", "schema": strict_schema(schema), "strict": True}}
    last_err = None
    for _ in range(settings.llm_max_retries):
        try:
            r = _get_client().chat.completions.create(model=settings.llm_model, messages=messages,
                                                       response_format=fmt)
        except RateLimitError as e:
            if getattr(e, "code", None) == "insufficient_quota" or "insufficient_quota" in str(e):
                raise LLMError("OpenAI 잔액(크레딧)이 부족합니다") from e
            last_err = str(e)
            time.sleep(LLM_RATE_LIMIT_WAIT_SEC)
            continue
        except (APITimeoutError, APIConnectionError, InternalServerError) as e:
            last_err = str(e)
            time.sleep(LLM_SERVER_BUSY_WAIT_SEC)
            continue
        except APIStatusError as e:                           # 인증·모델 이름·요청 형식 오류: 다시 해도 같다
            raise LLMError(f"LLM 호출 오류: {e}") from e

        u = r.usage
        USAGE["calls"] += 1
        USAGE["input"] += u.prompt_tokens
        USAGE["output"] += u.completion_tokens
        details = getattr(u, "completion_tokens_details", None)
        USAGE["reasoning"] += (getattr(details, "reasoning_tokens", 0) or 0) if details else 0

        msg = r.choices[0].message
        if msg.refusal:
            last_err = f"응답 거부: {msg.refusal}"
            continue
        try:
            out = json.loads(msg.content or "null")
        except json.JSONDecodeError:
            last_err = f"JSON 아님: {msg.content}"
            continue
        problem = check(out) if check and isinstance(out, dict) else (None if isinstance(out, dict) else "형식 오류")
        if problem is None:
            return out
        last_err = f"{problem}: {msg.content}"
        USAGE["retry_reasons"].append(problem)                 # 어떤 검증에 걸려 다시 물었는지
        messages += [{"role": "assistant", "content": msg.content},       # 무엇이 틀렸는지 알려주고 다시 묻는다
                     {"role": "user", "content": f"응답 검증 실패: {problem}. 규칙을 지켜 같은 형식으로 다시 답하라."}]
    raise LLMError(f"LLM 응답 실패 ({settings.llm_max_retries}회 시도): {last_err}")
