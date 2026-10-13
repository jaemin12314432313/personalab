"""LLM 공용 호출. Ask·Act·제품 정리 등 LLM 을 부르는 곳은 모두 여기를 거친다 (CLAUDE.md).

demo/server.py 의 call_llm 을 옮겼다. 하는 일:
· JSON 스키마로 응답 형식을 강제하고, check 로 값까지 검증한다 (CLAUDE.md "LLM 응답 처리 원칙")
· 형식이 틀리거나 값이 이상하면 다시 묻는다. 최대 settings.llm_max_retries 회
· 429(호출 한도)·503(과부하)은 기다렸다 재시도, 400·403 처럼 다시 해도 같은 오류는 바로 실패

사용 예 (services/ask/answer.py 의 ask_persona 안에서):

    from app.services.llm import call_llm

    out = call_llm(
        system="너는 주어진 프로필의 사람이다. ...",
        contents=[persona_card, product_text],
        schema=ASK_SCHEMA,   # JSON Schema dict
        check=lambda out: check_ask(out, product["features"]),  # 문제면 이유 문자열, 괜찮으면 None
    )

이미지(Act 화면 캡처)를 같이 보낼 때는 image_part(data_url) 를 contents 에 넣는다.
"""

import base64
import json
import time
from collections.abc import Callable
from functools import cache

from google import genai
from google.genai import errors, types

from app.core.config import (
    LLM_DEFAULT_MODEL,
    LLM_IMAGE_TYPES,
    LLM_RATE_LIMIT_WAIT_SEC,
    LLM_SERVER_BUSY_WAIT_SEC,
    settings,
)

Check = Callable[[dict], str | None]
HTTP_TOO_MANY_REQUESTS = 429


class LLMError(RuntimeError):
    """재시도해도 쓸 만한 응답을 못 받았거나, 다시 해도 소용없는 오류."""


@cache
def get_client() -> genai.Client:
    """키가 없어도 서버는 뜨도록 첫 호출 때 만든다."""
    if not settings.llm_api_key:
        raise LLMError(".env 에 LLM_API_KEY 를 넣으세요 (https://aistudio.google.com/apikey)")
    return genai.Client(
        api_key=settings.llm_api_key,
        http_options=types.HttpOptions(timeout=settings.llm_timeout * 1000),
    )


def call_llm(system: str, contents: list, schema: dict, check: Check | None = None) -> dict:
    """system 지시문과 contents 로 LLM 을 불러 schema 모양의 dict 를 돌려준다.

    check(out) 가 문자열(문제 이유)을 돌려주면 다시 묻는다. 끝내 실패하면 LLMError.
    """
    config = types.GenerateContentConfig(
        system_instruction=system,
        response_mime_type="application/json",
        response_json_schema=schema,
    )
    last_err = None
    for _ in range(settings.llm_max_retries):
        try:
            resp = get_client().models.generate_content(
                model=settings.llm_model or LLM_DEFAULT_MODEL, contents=contents, config=config
            )
            out = json.loads(resp.text or "null")  # 안전 필터에 막히면 text 가 None
            if not isinstance(out, dict):
                last_err = f"형식 오류: {resp.text}"
                continue
            problem = check(out) if check else None
            if problem is None:
                return out
            last_err = f"{problem}: {resp.text}"
        except json.JSONDecodeError:
            last_err = f"JSON 아님: {resp.text}"
        except errors.ServerError as e:  # 503 과부하 등: 잠깐 뒤 재시도
            last_err = str(e)
            time.sleep(LLM_SERVER_BUSY_WAIT_SEC)
        except errors.ClientError as e:  # 400·403 등은 다시 해도 같다
            if e.code != HTTP_TOO_MANY_REQUESTS:
                raise LLMError(f"LLM 호출 오류: {e}") from e
            last_err = str(e)
            time.sleep(LLM_RATE_LIMIT_WAIT_SEC)
    raise LLMError(f"LLM 응답 실패 ({settings.llm_max_retries}회 시도): {last_err}")


def image_part(data_url: str) -> types.Part | None:
    """data URL(base64) 이미지를 LLM 에 보낼 조각으로. 허용하지 않는 형식이면 None."""
    head, _, data = data_url.partition(",")
    media = head.removeprefix("data:").removesuffix(";base64")
    if media not in LLM_IMAGE_TYPES or not data:
        return None
    return types.Part.from_bytes(data=base64.b64decode(data), mime_type=media)
