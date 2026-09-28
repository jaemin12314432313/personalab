"""변경 금지 상수가 바뀌면 여기서 실패한다. 실패했다면 팀 논의 없이 바꾼 것이다."""

from app.core.config import (
    ACT_LOG_DROP_REASONS,
    BENCHMARK_CATEGORIES,
    DROP_REASONS,
)


def test_drop_reasons_are_frozen():
    assert DROP_REASONS == (
        "UNCLEAR_PURPOSE",
        "TOO_MANY_STEPS",
        "PRIVACY",
        "PRICE",
        "TRUST",
        "FEATURE_MISSING",
        "SWITCHING_COST",
        "NAVIGATION_LOST",
    )


def test_system_codes_are_not_categories():
    assert "MAX_TURNS" not in DROP_REASONS
    assert "OTHER" not in DROP_REASONS
    assert set(ACT_LOG_DROP_REASONS) - set(DROP_REASONS) == {"MAX_TURNS"}
    assert set(BENCHMARK_CATEGORIES) - set(DROP_REASONS) == {"OTHER"}
