import base64

import pytest

from app.services import browser, site_map


def source():
    files = {
        "index.html": '<title>Home</title><h1>Home</h1><a href="catalog.html">목록</a><a href="#footer">아래</a><a href="https://example.com/">외부</a><a href="logout">로그아웃</a><a href="missing.html">없는 화면</a>',
        "catalog.html": '<title>Catalog</title><h1>목록</h1><a href="detail.html">상세</a><input><button></button>',
        "detail.html": '<title>Detail</title><h1>상세</h1><a href="index.html">홈</a>',
        "orphan.html": "<title>Orphan</title><h1>독립 파일</h1>",
    }
    return {
        "kind": "html",
        "entry": "index.html",
        "files": [
            {"path": k, "data": base64.b64encode(v.encode()).decode()} for k, v in files.items()
        ],
    }


async def test_nested_inventory_reports_load_failures_and_structural_hints_without_llm(monkeypatch):
    monkeypatch.setattr(
        browser, "call_llm", lambda *a, **k: pytest.fail("No model during structure scan")
    )
    result = await site_map.discover(source())
    pages = {p["url"]: p for p in result["pages"]}
    assert set(pages) == {
        "/index.html",
        "/catalog.html",
        "/detail.html",
        "/orphan.html",
        "/missing.html",
    }
    assert pages["/detail.html"]["state"] == "loaded" and pages["/missing.html"]["state"] == "error"
    assert any(e["from"] == "/catalog.html" and e["to"] == "/detail.html" for e in result["edges"])
    assert not any(e["to"] == "/orphan.html" for e in result["edges"])
    assert {i["code"] for i in pages["/catalog.html"]["issues"]} == {"INPUT_LABEL", "BUTTON_LABEL"}
    assert result["excluded_count"] == 2 and not result["limit_reached"]
    assert all("127.0.0.1" not in p["url"] for p in result["pages"])


async def test_inventory_bound_keeps_unscanned_pages_pending(monkeypatch):
    monkeypatch.setattr(site_map, "SITE_SCAN_MAX_PAGES", 2)
    result = await site_map.discover(source())
    assert result["limit_reached"]
    assert sum(p["state"] == "loaded" for p in result["pages"]) == 2
    assert sum(p["state"] == "pending" for p in result["pages"]) >= 2


async def test_site_mode_does_not_terminate_on_a_legacy_goal():
    saved = []

    def decide(persona, task, screen, image, history):
        if not history:
            return {
                "action": "click",
                "target": next(e["id"] for e in screen["elements"] if e["text"] == "목록"),
                "reason": "fixture",
                "drop_reason": None,
            }
        return {
            "action": "abandon",
            "target": None,
            "reason": "fixture",
            "drop_reason": "UNCLEAR_PURPOSE",
        }

    async def save(*args):
        saved.append(args)

    async def cancelled():
        return False

    rows = await browser.explore(
        source(),
        {"exploration": "site", "goal_url": "/catalog.html"},
        {"card_text": "fixture"},
        "전반 탐색",
        3,
        save,
        cancelled,
        decide,
    )
    assert [r["action"] for r in rows] == ["click", "abandon"]
    assert saved[-1][1]["url"] == "/catalog.html"


async def test_assigned_entry_is_observed_and_never_faked_as_a_click():
    saved = []

    def decide(*a):
        return {"action": "abandon", "reason": "fixture", "drop_reason": "UNCLEAR_PURPOSE"}

    async def save(*args):
        saved.append(args)

    async def cancelled():
        return False

    await browser.explore(
        source(),
        {"exploration": "site", "_start_url": "/detail.html"},
        {"card_text": "fixture"},
        "전반 탐색",
        1,
        save,
        cancelled,
        decide,
    )
    assert saved[0][1]["url"] == "/detail.html"
    assert saved[0][1]["exploration"]["entry"] == "assigned"
    assert saved[0][-1]["action"] == "abandon"


def test_entry_selection_skips_visited_errors_and_pending():
    data = {
        "site_map": {
            "pages": [
                {"url": "/index.html", "state": "loaded"},
                {"url": "/broken", "state": "error"},
                {"url": "/later", "state": "pending"},
                {"url": "/catalog.html", "state": "loaded"},
            ]
        }
    }
    assert site_map.next_start(data, set()) is None
    assert site_map.next_start(data, {"/index.html"}) == "/catalog.html"
    assert site_map.site_mode({"exploration": "site", "goal_url": "/old"})
    assert not site_map.site_mode({"goal_url": "/old"})
    assert site_map.site_mode({})


def test_optional_priorities_limits():
    from pydantic import ValidationError

    from app.schemas.workflow import ScopeIn

    assert ScopeIn(exploration="site", priorities=["찾기", "입력"]).goal_url == ""
    from app.core.config import SITE_SCAN_MAX_PRIORITIES, SITE_SCAN_PRIORITY_MAX_CHARS

    assert (
        len(ScopeIn(priorities=["x"] * SITE_SCAN_MAX_PRIORITIES).priorities)
        == SITE_SCAN_MAX_PRIORITIES
    )  # 5개로 막지 않는다
    for priorities in [
        ["x"] * (SITE_SCAN_MAX_PRIORITIES + 1),
        ["x" * (SITE_SCAN_PRIORITY_MAX_CHARS + 1)],
    ]:
        with pytest.raises(ValidationError):
            ScopeIn(priorities=priorities)
