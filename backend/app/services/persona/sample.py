"""AI 패널 생성 (계획서 6장).

⚠️ Persona Engine(data/persona_engine)을 연결하기 전까지 쓰는 임시 표본 추출기다.
엔진은 원본 데이터(data/raw, git 에 없음)와 NVIDIA 데이터가 있어야 돌아서 저장소만으로는
돌릴 수 없다. 출력 모양은 엔진이 돌려줄 모양(profile, card_text, traits, source)과 같게
맞췄으므로, 엔진을 붙일 때는 sample_personas 안쪽만 바꾸면 된다.
"""

import json
import random

SEXES = ("남", "여")
REGIONS = ("수도권", "광역시", "기타")
LEVELS = ("낮음", "중간", "높음")
DEFAULT_AGE_RANGE = (20, 29)
DEFAULT_JOBS = ("학생",)
STUDENT = "학생"

# 카드 문장. 엔진 카드와 같은 원칙으로 금액·점수 같은 숫자를 넣지 않는다
# (숫자가 있으면 AI 의 가격 응답이 그 숫자로 쏠린다 - data/persona_engine/README.md)
PRICE_LINE = {
    "높음": "꼭 필요한 서비스에만 돈을 낸다. 무료로 쓰던 서비스가 유료로 바뀌면 그만 쓰는 편이다.",
    "중간": "필요하다고 느끼면 유료 서비스에도 돈을 낸다.",
    "낮음": "마음에 들면 구독료는 크게 따지지 않고 쓴다.",
}
DIGITAL_LINE = {
    "높음": "새 앱에 금방 익숙해지고 사용법을 따로 찾아보지 않는다.",
    "중간": "새 앱은 몇 번 써 보면 익숙해진다.",
    "낮음": "새 앱은 사용법을 익히는 데 시간이 걸리고 어렵게 느낀다.",
}
PRIVACY_LINE = {  # 높음 = 개인정보 우려가 크다
    "높음": "가입할 때 개인정보를 입력하는 것이 꺼려져서 꼭 필요한 정보만 넣으려 한다.",
    "중간": "필요한 정보라면 입력하지만, 많이 요구하면 망설인다.",
    "낮음": "가입할 때 개인정보를 입력하는 것에 크게 신경 쓰지 않는다.",
}


def _age_range(value) -> tuple[int, int]:
    """ "20-29" 또는 [20, 29] 를 (최소, 최대)로. 읽을 수 없으면 기본값."""
    try:
        if isinstance(value, str):
            low, _, high = value.partition("-")
            low, high = int(low), int(high)
        else:
            low, high = int(value[0]), int(value[1])
    except (TypeError, ValueError, IndexError):
        return DEFAULT_AGE_RANGE
    return min(low, high), max(low, high)


def _jobs(value) -> tuple[str, ...]:
    if isinstance(value, str):
        value = [value]
    return tuple(value) if value else DEFAULT_JOBS


def _card_text(age: int, sex: str, job: str, region: str, traits: dict) -> str:
    who = "대학생" if job == STUDENT else f"{job} 분야에서 일하는 사람"
    head = f"{age}세 {'남자' if sex == SEXES[0] else '여자'} {who}이고 {region} 지역에 산다."
    return " ".join(
        [
            head,
            PRICE_LINE[traits["price"]],
            DIGITAL_LINE[traits["digital"]],
            PRIVACY_LINE[traits["privacy"]],
        ]
    )


def sample_personas(conditions: dict, n: int, seed: int) -> list[dict]:
    """조건에 맞는 페르소나 n명을 뽑는다.

    입력: conditions = {"age": "20-29", "job": ["학생"], ...}
                       (Persona Engine make_panel 옵션과 같은 이름. 지금은 age, job 만 읽는다)
          seed = 같으면 같은 결과
    출력: personas.attributes_json 목록.
          profile   나이·성별·지역·직업군 (실제 참가자와 같은 기준으로 비교할 때)
          card_text 프롬프트에 넣는 카드 문장 (금액·점수 없음)
          traits    가격 민감도 등 등급 (리포트 분석용, 프롬프트에 넣지 않음)
          source    표본 근거. 임시 추출기는 {"stand_in": True, ...}, 엔진은 원본 id·매칭 수준
    """
    rng = random.Random(seed)
    low, high = _age_range(conditions.get("age"))
    jobs = _jobs(conditions.get("job"))
    people = []
    for i in range(n):
        age, sex, job = rng.randint(low, high), rng.choice(SEXES), rng.choice(jobs)
        region = rng.choice(REGIONS)
        traits = {key: rng.choice(LEVELS) for key in ("price", "digital", "privacy")}
        people.append(
            {
                "profile": {"age": age, "sex": sex, "region": region, "job_group": job},
                "card_text": _card_text(age, sex, job, region, traits),
                "traits": traits,
                "source": {"stand_in": True, "seed": seed, "index": i},
            }
        )
    return people


def persona_card(persona: dict) -> str:
    """프롬프트에 넣는 페르소나 설명. 카드 문장이 없으면 속성 전체를 그대로 보여 준다."""
    return persona.get("card_text") or json.dumps(persona, ensure_ascii=False)
