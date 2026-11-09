from app.services.runner import task_with_context


def test_task_context_adds_product_and_audience_when_present():
    out = task_with_context(
        "사이트 전반을 살펴보세요.",
        "모아북\n읽은 책을 기록하는 서비스",
        {"audience": {"description": "독서 습관을 만들고 싶은 직장인"}},
    )
    assert out.splitlines()[0] == "사이트 전반을 살펴보세요."
    assert "제품 소개: 모아북 — 읽은 책을 기록하는 서비스" in out
    assert "이 테스트의 대상 사용자: 독서 습관을 만들고 싶은 직장인" in out


def test_task_context_skips_empty_parts():
    assert task_with_context("과제", None, {}) == "과제"
    assert (
        task_with_context("과제", "이름만", {"audience": {"description": "  "}})
        == "과제\n제품 소개: 이름만"
    )
