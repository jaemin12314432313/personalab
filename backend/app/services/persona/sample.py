"""AI 패널 생성 (계획서 6장)."""

import random


def sample_personas(conditions: dict, n: int, seed: int) -> list[dict]:
    """⚠️ AI/Data 교체 지점. 조건에 맞는 페르소나 n명을 뽑는다 (data/persona_engine).

    입력: conditions = {"age": "20-29", "job": ["학생"], ...}
                       (Persona Engine make_panel 옵션과 같은 이름)
          seed = 같으면 같은 결과
    출력: personas.attributes_json 목록. 형식은 아래 네 칸으로 맞춘다.
          profile   나이·성별·지역·직업군 (실제 참가자와 같은 기준으로 비교할 때)
          card_text 프롬프트에 넣는 카드 문장 (숫자 없음)
          traits    가격 민감도 등 등급 (리포트 분석용, 프롬프트에 넣지 않음)
          source    NVIDIA·미디어패널 원본 id, 매칭 수준 (근거 보기·재현용)

    지금은 형식만 맞춘 임시 구현이다.
    """
    rng = random.Random(seed)
    levels = ("낮음", "중간", "높음")
    people = []
    for i in range(n):
        age = rng.randint(20, 29)
        people.append(
            {
                "profile": {
                    "age": age,
                    "sex": rng.choice(("남", "여")),
                    "region": "수도권",
                    "job_group": "학생",
                },
                "card_text": f"{age}세 대학생이다. (임시 카드)",
                "traits": {
                    "price": rng.choice(levels),
                    "digital": rng.choice(levels),
                    "privacy": rng.choice(levels),
                },
                "source": {"stub": True, "index": i},
            }
        )
    return people
