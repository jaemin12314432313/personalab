"""명시 조건으로 추린 보유 카드의 다양한 구성을 만든다. 의미 매칭/대표성 추정 없음."""

from collections import Counter

from app.core.config import AUDIENCE_AGE_BAND_YEARS


def dimensions(row):
    attributes = row.attributes_json
    profile = attributes.get("profile") or {}
    age = profile.get("age")
    return {
        "age": int(age) // AUDIENCE_AGE_BAND_YEARS if isinstance(age, (int, float)) else None,
        "digital": (attributes.get("traits") or {}).get("digital"),
        "job": profile.get("job_group"),
    }


def recommend(rows, count):
    # 원본 후보의 안정적인 순서로 동률을 해소한다. 내부 점수는 고객에게 보내지 않는다.
    remaining = list(rows)
    chosen = []
    counts = {field: Counter() for field in ("age", "digital", "job")}
    while remaining and len(chosen) < count:

        def diversity(row):
            return sum(
                1 / (1 + counts[field][value])
                for field, value in dimensions(row).items()
                if value not in (None, "")
            )

        row = max(remaining, key=diversity)
        remaining.remove(row)
        chosen.append(row)
        for field, value in dimensions(row).items():
            if value not in (None, ""):
                counts[field][value] += 1
    return chosen
