import base64

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.studies import run_launcher
from app.api.workflow import exploration_launcher
from app.core.config import settings
from app.core.db import get_session
from app.main import app
from app.repositories import run as run_repo
from app.repositories import study as study_repo
from app.repositories import workflow as repo
from app.services import browser

HTML = (
    '<html lang="ko"><head><title>가상 화면 점검</title></head><body><h1>시작 화면</h1><a '
    'href="done.html">결과 보기</a><input aria-label="이름" /></body></html>'
)
DONE = "<html><head><title>완료 화면</title></head><body><h1>점검 완료</h1></body></html>"


def bundle():
    return {
        "kind": "html",
        "entry": "index.html",
        "files": [
            {"path": name, "data": base64.b64encode(content.encode()).decode()}
            for name, content in [("index.html", HTML), ("done.html", DONE)]
        ],
    }


async def test_real_html_observation_and_scoped_navigation_without_model():
    source = bundle()
    preview = await browser.inspect(source, "desktop")
    assert preview["title"] == "가상 화면 점검"
    assert preview["preview"].startswith("data:image/jpeg;base64,")
    assert preview["suggestions"][0]["url"] == "/done.html"
    saved = []

    async def save(*args):
        saved.append(args)

    async def cancelled():
        return False

    def decide(persona, task, screen, image, history):
        target = next(e for e in screen["elements"] if e["text"] == "결과 보기")
        return {
            "action": "click",
            "target": target["id"],
            "value": None,
            "drop_reason": None,
            "reason": "검증용 가상 판단",
        }

    rows = await browser.explore(
        source,
        {"viewport": "desktop", "goal_url": "/done.html"},
        {"card_text": "원본 카드가 아닌 단위 검증용 가상 인물"},
        "완료 화면 열기",
        3,
        save,
        cancelled,
        decide,
    )
    assert [r["action"] for r in rows] == ["click", "complete"]
    assert len(saved) == 2 and "점검 완료" in saved[-1][1]["description"]
    assert saved[0][2].startswith("data:image/jpeg;base64,")


async def test_browser_cancellation_never_calls_model():
    async def cancelled():
        return True

    async def save(*a):
        pytest.fail("Cancellation must happen before observation")

    def decide(*a):
        pytest.fail("No model after cancellation")

    with pytest.raises(browser.BrowserCancelled):
        await browser.explore(
            bundle(),
            {"viewport": "mobile", "goal_url": "/done.html"},
            {"card_text": "가상"},
            "검증",
            3,
            save,
            cancelled,
            decide,
        )


async def test_browser_loop_and_turn_guards():
    async def cancelled():
        return False

    async def save(*a):
        pass

    def stay(persona, task, screen, image, history):
        return {
            "action": "scroll",
            "target": None,
            "value": None,
            "drop_reason": None,
            "reason": "가상 스크롤",
        }

    rows = await browser.explore(
        bundle(),
        {"goal_url": "/missing.html"},
        {"card_text": "가상"},
        "검증",
        3,
        save,
        cancelled,
        stay,
    )
    assert rows[-1]["drop_reason"] == "NAVIGATION_LOST"
    rows = await browser.explore(
        bundle(),
        {"goal_url": "/missing.html"},
        {"card_text": "가상"},
        "검증",
        0,
        save,
        cancelled,
        stay,
    )
    assert rows[-1]["drop_reason"] == "MAX_TURNS"

    def abandon(*args):
        return {
            "action": "abandon",
            "target": None,
            "value": None,
            "drop_reason": "PRIVACY",
            "reason": "검증용 중단",
        }

    rows = await browser.explore(
        bundle(), {}, {"card_text": "가상"}, "검증", 3, save, cancelled, abandon
    )
    assert rows[-1]["action"] == "abandon" and rows[-1]["drop_reason"] == "PRIVACY"


async def test_source_validation_blocks_private_targets_and_bad_files(monkeypatch):
    monkeypatch.setattr(settings, "local_tools_enabled", False)
    for url in [
        "http://127.0.0.1:8000/",
        "file:///C:/secrets",
        "http://user:pass@example.com",
        "http://169.254.169.254/",
    ]:
        with pytest.raises(browser.BrowserError):
            await browser.validate_url(url)
    for name in ["../index.html", "/index.html", "C:/index.html", "run.exe"]:
        with pytest.raises(browser.BrowserError):
            browser.decode_files([{"path": name, "data": "YQ=="}], name)


@pytest.fixture
async def client(session, monkeypatch):
    monkeypatch.setattr(settings, "allow_persona_transmission", False)
    app.dependency_overrides[get_session] = lambda: session

    async def queue_only(*args):
        pass

    app.dependency_overrides[exploration_launcher] = lambda: queue_only
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"X-Requested-With": "PersonaLab"},
        ) as c:
            assert (
                await c.post(
                    "/auth/register",
                    json={"email": "workflow-check@example.com", "password": "1234"},
                )
            ).status_code == 201
            yield c
    finally:
        app.dependency_overrides.clear()


async def test_authenticated_source_revisions_and_frozen_evidence(client, session, monkeypatch):
    sid = (await client.post("/studies", json={"name": "회차 검증"})).json()["id"]
    source = bundle()
    body = {k: source[k] for k in ("files", "entry")}
    response = await client.post(f"/studies/{sid}/sources/html", json=body)
    assert response.status_code == 200, response.text
    saved = response.json()
    assert saved["source"]["kind"] == "html" and "files" not in saved["source"]
    scope = {
        "mode": "focused",
        "focus": "안내 확인",
        "goal_url": "/done.html",
        "viewport": "desktop",
        "scenario": "완료 화면 보기",
    }
    assert (await client.post(f"/studies/{sid}/workflow", json={"scope": scope})).status_code == 200
    await study_repo.set_product(session, sid, "제품\n화면 검증", ["이동"], "")
    await study_repo.replace_personas(
        session,
        sid,
        [
            {
                "card_text": "가상의 테스트 인물",
                "profile": {"age": 30, "job_group": "검증"},
                "traits": {},
                "source": {"persona_id": "FIXTURE"},
            }
        ],
    )
    assert (await client.post(f"/studies/{sid}/runs", json={"mode": "act"})).status_code == 409
    run = await run_repo.create_run(session, sid, "act")
    await run_repo.set_run_state(session, run, status="done", progress=1)
    assert (await client.post(f"/studies/{sid}/workflow", json={"scope": scope})).status_code == 409
    child = (await client.post(f"/studies/{sid}/revisions", json={})).json()["id"]
    rows = (await client.get(f"/studies/{child}/revisions")).json()
    assert [r["revision"] for r in rows] == [2, 1]
    assert len((await client.get(f"/studies/{child}")).json()["personas"]) == 1
    assert (await client.get(f"/studies/{child}")).json()["runs"] == []
    assert (await client.get(f"/studies/{child}/workflow")).json()["root_study_id"] == sid
    # 수정 회차는 화면을 다시 받아야 하고, 다시 받아도 이전 회차의 탐색 범위는 그대로 이어진다
    carried = (await client.get(f"/studies/{child}/workflow")).json()
    assert carried["source"]["needs_reconnect"] is True
    redo = await client.post(f"/studies/{child}/sources/recapture")
    assert redo.status_code == 200, redo.text
    assert (
        "needs_reconnect" not in redo.json()["source"]
        and redo.json()["scope"]["focus"] == "안내 확인"
        and redo.json()["screens"]
    )
    assert (
        await client.post(f"/studies/{sid}/sources/recapture")
    ).status_code == 409  # 실행한 회차는 다시 연결할 수 없다
    renamed = await client.post(f"/studies/{child}/name", json={"name": "바뀐 테스트 이름"})
    assert renamed.status_code == 200 and renamed.json()["name"] == "바뀐 테스트 이름"
    assert (
        await client.post(f"/studies/{sid}/name", json={"name": "기록 변경 금지"})
    ).status_code == 409
    persona = (await study_repo.list_personas(session, sid))[0]
    await repo.add_evidence(
        session,
        run.id,
        persona.id,
        0,
        saved["screens"][0],
        saved["source"]["preview"],
        {"action": "complete"},
    )
    evidence = (await client.get(f"/runs/{run.id}/evidence")).json()[0]
    image = await client.get(evidence["image"].removeprefix("/api"))
    assert image.status_code == 200 and image.headers["content-type"] == "image/jpeg"
    assert image.headers["cache-control"] == "private, no-store"
    pending = await run_repo.create_run(session, child, "act")
    assert (await client.post(f"/runs/{pending.id}/cancel", json={})).json()[
        "cancel_requested"
    ] is True
    await client.post("/auth/logout", json={})
    await client.post(
        "/auth/register", json={"email": "workflow-other@example.com", "password": "1234"}
    )
    for path in [
        f"/studies/{sid}/workflow",
        f"/studies/{sid}/revisions",
        f"/runs/{pending.id}/evidence",
        f"/runs/{pending.id}/control",
        evidence["image"].removeprefix("/api"),
    ]:
        assert (await client.get(path)).status_code == 404
    assert (await client.post(f"/studies/{sid}/revisions", json={})).status_code == 404
    assert (await client.post(f"/runs/{pending.id}/cancel", json={})).status_code == 404


async def test_runner_stores_browser_evidence_report_and_scoped_interview(
    client, session, monkeypatch
):
    from app.repositories import interview as interview_repo
    from app.services import runner

    # 실제 패널이나 외부 모델을 사용하지 않는 독립 가상 데이터 경로다.
    sid = (await client.post("/studies", json={"name": "브라우저 실행 연결 점검"})).json()["id"]
    source = bundle()
    response = await client.post(
        f"/studies/{sid}/sources/html", json={"files": source["files"], "entry": source["entry"]}
    )
    assert response.status_code == 200
    await study_repo.set_product(session, sid, "가상 화면", ["이동"], "")
    await study_repo.replace_personas(
        session,
        sid,
        [
            {
                "card_text": "자체 검증용 가상 인물",
                "profile": {"age": 30},
                "traits": {},
                "source": {"persona_id": "FIXTURE"},
            }
        ],
    )
    persona = (await study_repo.list_personas(session, sid))[0]
    assert (
        await client.post(
            f"/studies/{sid}/workflow",
            json={"scope": {"exploration": "journey", "goal_url": "/done.html"}},
        )
    ).status_code == 200
    run = await run_repo.create_run(session, sid, "act")
    original = browser.explore

    def decide(persona, task, screen, image, history):
        element = next(e for e in screen["elements"] if e["text"] == "결과 보기")
        return {
            "action": "click",
            "target": element["id"],
            "value": None,
            "drop_reason": None,
            "reason": "가상 인물이 완료 화면을 선택한 검증 기록",
        }

    async def simulated(*args, **kw):
        return await original(*args, decide=decide, **kw)

    monkeypatch.setattr(runner, "require_persona_transmission", lambda: None)
    monkeypatch.setattr(browser, "explore", simulated)
    monkeypatch.setattr(browser, "call_llm", lambda *a, **kw: pytest.fail("외부 모델 호출 금지"))
    await runner.execute_run(session, run.id)
    assert (await run_repo.get_run(session, run.id)).status == "done"
    evidence = (await client.get(f"/runs/{run.id}/evidence")).json()
    assert len(evidence) == 2 and evidence[-1]["screen"]["label"] == "완료 화면"
    report = (await client.get(f"/runs/{run.id}/report")).json()
    assert report["results"][0]["act"]["end"]["result"] == "complete"
    owner = (await client.get("/auth/me")).json()["id"]
    context = await interview_repo.context(session, run.id, persona.id, owner)
    assert any(s["label"] == "완료 화면" for s in context["screens"])
    answer = await client.post(
        f"/runs/{run.id}/personas/{persona.id}/interview",
        json={"question": "어느 화면을 보았나요?", "mode": "records"},
    )
    assert answer.status_code == 201 and answer.json()["evidence"]
    assert (
        await client.post(
            f"/runs/{run.id}/personas/{persona.id}/interview",
            json={"question": "왜?", "mode": "llm"},
        )
    ).status_code == 409


@pytest.mark.parametrize("product_kind", ["ios", "android"])
async def test_app_html_inspects_mobile_and_preserves_kind_in_revision(
    client, product_kind, monkeypatch
):
    sid = (await client.post("/studies", json={"name": "App prototype fixture"})).json()["id"]
    source = bundle()
    observed_viewports = []
    inspect = browser.inspect

    async def record_viewport(source, viewport):
        observed_viewports.append(viewport)
        return await inspect(source, viewport)

    monkeypatch.setattr(browser, "inspect", record_viewport)
    response = await client.post(
        f"/studies/{sid}/sources/html",
        json={
            "files": source["files"],
            "entry": source["entry"],
            "product_kind": product_kind,
            "viewport": "desktop",
        },
    )
    assert response.status_code == 200, response.text
    result = response.json()
    assert observed_viewports == ["mobile"]
    assert result["source"]["kind"] == "html" and result["source"]["preview"].startswith(
        "data:image/jpeg;base64,"
    )
    assert (
        result["scope"]["product_kind"] == product_kind and result["scope"]["viewport"] == "mobile"
    )
    scope = {**result["scope"], "viewport": "desktop", "goal_url": "/done.html"}
    updated = (await client.post(f"/studies/{sid}/workflow", json={"scope": scope})).json()
    assert updated["scope"]["viewport"] == "mobile"
    child = (await client.post(f"/studies/{sid}/revisions", json={})).json()["id"]
    copied = (await client.get(f"/studies/{child}/workflow")).json()
    assert copied["scope"] == updated["scope"] and copied["source"]["kind"] == "html"


async def test_source_inspection_reports_observed_structure_and_missing_content_without_input_values():  # noqa: E501
    html = (
        '<html lang="ko"><title>예약 관리</title><body><header><nav aria-label="주 메뉴"><a '
        'href="done.html">예약 확인</a></nav></header><main><h1>예약 관리</h1><h2>이름 '
        '입력</h2><input aria-label="이름" '
        'value="DO_NOT_EXPOSE_FIELD_VALUE"><button>다음</button><img src="missing.png" '
        'width="40" height="40"><iframe src="done.html" title="별도 화면" width="100" '
        'height="60"></iframe></main><footer>문의</footer></body></html>'
    )
    source = bundle()
    source["files"][0]["data"] = base64.b64encode(html.encode()).decode()
    result = await browser.inspect(source, "mobile")
    meta = result["inspection"]
    assert meta["viewport"] == {"width": 390, "height": 844}
    assert [h["text"] for h in meta["headings"]] == ["예약 관리", "이름 입력"]
    assert {landmark["role"] for landmark in meta["landmarks"]} == {
        "banner",
        "navigation",
        "main",
        "contentinfo",
    }
    assert meta["element_count"] == 3 and meta["elements_truncated"] is False
    assert (
        meta["image_count"] == 1 and meta["unloaded_image_count"] == 1 and meta["frame_count"] == 1
    )
    assert meta["html_documents"] == ["index.html", "done.html"] and meta["captured_at"]
    assert result["observed_screen"]["elements"][0]["href"] == "/done.html"
    import json

    assert "DO_NOT_EXPOSE_FIELD_VALUE" not in json.dumps(meta) + json.dumps(
        result["observed_screen"]
    )
    assert "127.0.0.1" not in json.dumps(result["observed_screen"])


async def test_inspection_reports_element_limit_without_changing_actor_limits(monkeypatch):
    monkeypatch.setattr(browser, "BROWSER_MAX_ELEMENTS", 2)
    source = bundle()
    source["files"][0]["data"] = base64.b64encode(
        b"<html><title>Limits</title><body><button>A</button><button>B</button><button>C</button></body></html>"
    ).decode()
    result = await browser.inspect(source, "desktop")
    assert (
        result["inspection"]["element_count"] == 3
        and result["inspection"]["elements_truncated"] is True
    )
    assert len(result["observed_screen"]["elements"]) == 2


async def test_checkbox_selection_and_history_are_real_observed_states():
    html = """<meta charset="utf-8"><title>입력 검증</title><input type="checkbox" aria-label="안내 확인"><select aria-label="분류"><option value="a">전체</option><option value="b">책</option></select><a href="done.html">완료</a>"""  # noqa: E501
    source = bundle()
    source["files"][0]["data"] = base64.b64encode(html.encode()).decode()
    histories = []
    saved = []

    def decide(persona, task, screen, image, history):
        histories.append(list(history))
        elements = screen["elements"]
        checkbox = next(e for e in elements if e["type"] == "checkbox")
        selector = next(e for e in elements if e["kind"] == "select")
        if not checkbox["checked"]:
            target = checkbox
            action = "click"
            value = None
        elif selector["selected_options"] != ["b"]:
            target = selector
            action = "fill"
            value = "b"
        else:
            target = next(e for e in elements if e["text"] == "완료")
            action = "click"
            value = None
        return {
            "action": action,
            "target": target["id"],
            "value": value,
            "reason": "가상 상태 검증",
            "drop_reason": None,
        }

    async def save(*args):
        saved.append(args)

    async def cancelled():
        return False

    rows = await browser.explore(
        source,
        {"goal_url": "/done.html"},
        {"card_text": "단위 검증용"},
        "입력",
        3,
        save,
        cancelled,
        decide,
    )
    assert [r["action"] for r in rows] == ["click", "fill", "click", "complete"]
    assert histories[1][0]["action"] == "click" and histories[2][1]["target"] == "분류"
    assert saved[0][1]["viewport"] == {"width": 1365, "height": 900}
    assert saved[0][1]["elements"][0]["rect"]["width"] > 0


def test_scope_accepts_bounded_saved_turn_limit():
    from pydantic import ValidationError

    from app.schemas.workflow import ScopeIn

    assert ScopeIn(max_turns=12).max_turns == 12
    assert ScopeIn().max_turns is None
    for value in (0, 31):
        with pytest.raises(ValidationError):
            ScopeIn(max_turns=value)


async def test_new_connection_defaults_to_site_mode_and_runs_without_goal(
    client, session, monkeypatch
):
    sid = (await client.post("/studies", json={"name": "Whole site fixture"})).json()["id"]
    src = bundle()
    result = (
        await client.post(
            f"/studies/{sid}/sources/html", json={"files": src["files"], "entry": src["entry"]}
        )
    ).json()
    assert result["scope"]["exploration"] == "site" and not result["scope"]["goal_url"]
    assert result["source"]["exploration"]["status"] == "queued"
    assert "preflight" not in result["source"] and "site_map" not in result["source"]
    assert result["scope"]["max_turns"] == 12
    saved = await client.post(
        f"/studies/{sid}/workflow",
        json={
            "scope": {
                "exploration": "site",
                "goal_url": "old-hidden-goal",
                "priorities": ["메뉴 이해"],
            }
        },
    )
    assert saved.status_code == 200 and saved.json()["scope"]["priorities"] == ["메뉴 이해"]
    await study_repo.replace_personas(
        session, sid, [{"card_text": "fixture", "profile": {"age": 30}, "traits": {}, "source": {}}]
    )
    launched = []

    async def launch(run_id):
        launched.append(run_id)

    app.dependency_overrides[run_launcher] = lambda: launch
    monkeypatch.setattr(settings, "allow_persona_transmission", True)
    assert (await client.post(f"/studies/{sid}/runs", json={"mode": "act"})).status_code == 409
    await client.post(f"/studies/{sid}/exploration", json={"action": "pause"})
    assert (
        await client.post(
            f"/studies/{sid}/exploration/review",
            json={"job_id": result["source"]["exploration"]["id"]},
        )
    ).status_code == 200
    response = await client.post(f"/studies/{sid}/runs", json={"mode": "act"})
    assert response.status_code == 202, response.text
    assert launched == [response.json()["id"]]


async def test_general_runner_assigns_unvisited_page_to_next_persona(client, session, monkeypatch):
    from app.services import runner

    sid = (await client.post("/studies", json={"name": "Coverage fixture"})).json()["id"]
    src = bundle()
    await client.post(
        f"/studies/{sid}/sources/html", json={"files": src["files"], "entry": src["entry"]}
    )
    from contextlib import asynccontextmanager

    from app.services import exploration

    @asynccontextmanager
    async def job_session():
        yield session

    connected = await repo.get(session, sid)
    await exploration.run_job(sid, connected.source_json["exploration"]["id"], job_session)
    await study_repo.replace_personas(
        session,
        sid,
        [
            {"card_text": "fixture", "profile": {"age": 30}, "traits": {}, "source": {}}
            for _ in range(2)
        ],
    )
    run = await run_repo.create_run(session, sid, "act")
    original = browser.explore

    def decide(*a):
        return {"action": "abandon", "reason": "fixture only", "drop_reason": "UNCLEAR_PURPOSE"}

    async def simulate(*args, **kw):
        return await original(*args, decide=decide, **kw)

    monkeypatch.setattr(browser, "explore", simulate)
    monkeypatch.setattr(runner, "require_persona_transmission", lambda: None)
    monkeypatch.setattr(browser, "call_llm", lambda *a, **k: pytest.fail("No external model"))
    await runner.execute_run(session, run.id)
    records = (await client.get(f"/runs/{run.id}/evidence")).json()
    assert [r["screen"]["url"] for r in records] == ["/index.html", "/done.html"]
    assert records[1]["screen"]["exploration"]["entry"] == "assigned"
    assert (await run_repo.get_run(session, run.id)).status == "done"


async def test_live_capture_waits_for_entry_fade_without_changing_agent_actions():
    import base64

    src = {
        "kind": "html",
        "entry": "index.html",
        "files": [
            {
                "path": "index.html",
                "data": base64.b64encode(
                    b"<title>Action fade</title><body style='opacity:0'><h1>Ready "
                    b"screen</h1><script>setTimeout(()=>document.body.style.opacity=1,650)</script>"
                ).decode(),
            }
        ],
    }
    saved = []

    async def save(*args):
        saved.append(args)

    async def cancelled():
        return False

    def decide(*args):
        return {
            "action": "abandon",
            "target": None,
            "reason": "fixture end",
            "drop_reason": "PRIVACY",
        }

    rows = await browser.explore(
        src,
        {"exploration": "site"},
        {"card_text": "self-authored fixture"},
        "fixture",
        1,
        save,
        cancelled,
        decide,
    )
    assert saved[0][1]["capture_ready"] is True
    assert saved[0][2].startswith("data:image/jpeg;base64,")
    assert [row["action"] for row in rows] == ["abandon"]


def test_passive_blocks_never_expand_request_permissions():
    from types import SimpleNamespace

    blocks = browser.BlockedRequests()
    for kind in ("image", "font", "stylesheet", "media", "script"):
        blocks.record(
            SimpleNamespace(method="GET", resource_type=kind, is_navigation_request=lambda: False)
        )
    assert len(blocks) == 5 and blocks.stop_count == 0
    for method, kind, nav in [
        ("POST", "image", False),
        ("GET", "document", True),
        ("GET", "fetch", False),
    ]:
        blocks.record(
            SimpleNamespace(
                method=method, resource_type=kind, is_navigation_request=lambda nav=nav: nav
            )
        )
    assert len(blocks) == 8 and blocks.stop_count == 3


async def test_failed_browser_action_preserves_capture_without_success_log(monkeypatch):
    saved = []

    async def save(*args):
        saved.append(args)

    async def cancelled():
        return False

    async def denied(*args):
        raise browser.BrowserError("검증용 차단")

    def decide(persona, task, screen, image, history):
        return {
            "action": "fill",
            "target": screen["elements"][0]["id"],
            "value": "must-not-be-saved",
            "reason": "검증용 판단",
        }

    monkeypatch.setattr(browser, "act", denied)
    with pytest.raises(browser.BrowserError, match="검증용 차단"):
        await browser.explore(
            bundle(), {}, {"card_text": "자체 작성 가상 카드"}, "검증", 3, save, cancelled, decide
        )
    assert len(saved) == 1 and saved[0][2].startswith("data:image/jpeg;base64,")
    assert saved[0][3]["status"] == "failed" and saved[0][3]["error"] == "검증용 차단"
    assert "value" not in saved[0][3] and saved[0][4] is None


async def test_real_input_and_navigation_save_matching_preaction_screen():
    saved = []

    async def save(*args):
        saved.append(args)

    async def cancelled():
        return False

    def decide(persona, task, screen, image, history):
        label = "이름" if not history else "결과 보기"
        target = next(e for e in screen["elements"] if e["text"] == label)
        return {
            "action": "fill" if not history else "click",
            "target": target["id"],
            "value": "Synthetic name",
            "reason": label,
        }

    rows = await browser.explore(
        bundle(),
        {"goal_url": "/done.html", "exploration": "journey"},
        {"card_text": "자체 작성 가상 카드"},
        "검증",
        3,
        save,
        cancelled,
        decide,
    )
    assert [row["action"] for row in rows] == ["fill", "click", "complete"]
    for _, screen, _image, action, row in saved[:2]:
        target = next(e for e in screen["elements"] if e["id"] == action["target"])
        assert target["text"] == row["target"] and target["rect"]["width"] > 0
    assert next(e for e in saved[1][1]["elements"] if e["text"] == "이름")["filled"]
    assert len({r[2] for r in saved}) == 3
    assert saved[-1][1]["label"] == "완료 화면"


async def test_runner_failed_action_keeps_owned_capture_without_inventing_report(
    client, session, monkeypatch
):
    from app.services import runner

    sid = (await client.post("/studies", json={"name": "자체 실패 검증"})).json()["id"]
    source = bundle()
    assert (
        await client.post(
            f"/studies/{sid}/sources/html",
            json={"files": source["files"], "entry": source["entry"]},
        )
    ).status_code == 200
    await study_repo.set_product(session, sid, "자체 가상 화면", ["이동"], "")
    await study_repo.replace_personas(
        session,
        sid,
        [
            {
                "card_text": "검증용 가상 인물",
                "profile": {"age": 30},
                "traits": {},
                "source": {"persona_id": "FIXTURE"},
            }
        ],
    )
    run = await run_repo.create_run(session, sid, "act")
    original = browser.explore

    def decide(persona, task, screen, image, history):
        return {"action": "click", "target": screen["elements"][0]["id"], "reason": "검증용 이동"}

    async def simulated(*args, **kw):
        return await original(*args, decide=decide, **kw)

    async def denied(*args):
        raise browser.BrowserError("검증용 실행 차단")

    monkeypatch.setattr(runner, "require_persona_transmission", lambda: None)
    monkeypatch.setattr(browser, "explore", simulated)
    monkeypatch.setattr(browser, "act", denied)
    await runner.execute_run(session, run.id)
    assert (await run_repo.get_run(session, run.id)).status == "failed"
    evidence = (await client.get(f"/runs/{run.id}/evidence")).json()
    assert len(evidence) == 1 and evidence[0]["action"]["status"] == "failed"
    assert (await client.get(evidence[0]["image"].removeprefix("/api"))).status_code == 200
    report = (await client.get(f"/runs/{run.id}/report")).json()
    assert report["results"][0]["act"] is None
    pid = report["results"][0]["id"]
    assert (
        await client.post(
            f"/runs/{run.id}/personas/{pid}/interview", json={"question": "왜?", "mode": "records"}
        )
    ).status_code == 409


async def test_llm_mode_allows_revisit_up_to_the_screen_limit_but_rule_mode_stops_at_once():
    async def cancelled():
        return False

    async def save(*a):
        pass

    calls = []

    def stay(persona, task, screen, image, history):
        calls.append(1)
        return {
            "action": "scroll",
            "target": None,
            "value": None,
            "drop_reason": None,
            "reason": "가상 스크롤",
        }

    rows = await browser.explore(
        bundle(),
        {"goal_url": "/missing.html"},
        {"card_text": "가상"},
        "검증",
        9,
        save,
        cancelled,
        stay,
        allow_revisit=True,
    )
    # 같은 화면에서 최대 3번까지 판단한 뒤에만 NAVIGATION_LOST로 막는다(무한 반복·비용 방지)
    assert len(calls) == 3
    assert (
        rows[-1]["action"] == "stop"
        and rows[-1]["drop_reason"] == "NAVIGATION_LOST"
        and rows[-1]["reason"] is None
    )
    calls.clear()
    rows = await browser.explore(
        bundle(),
        {"goal_url": "/missing.html"},
        {"card_text": "가상"},
        "검증",
        9,
        save,
        cancelled,
        stay,
    )
    assert len(calls) == 1 and rows[-1]["drop_reason"] == "NAVIGATION_LOST"


async def _two_persona_run(client, session):
    sid = (await client.post("/studies", json={"name": "실패 격리 점검"})).json()["id"]
    source = bundle()
    assert (
        await client.post(
            f"/studies/{sid}/sources/html",
            json={"files": source["files"], "entry": source["entry"]},
        )
    ).status_code == 200
    await study_repo.set_product(session, sid, "가상 화면", ["이동"], "")
    await study_repo.replace_personas(
        session,
        sid,
        [
            {
                "card_text": "A 가상 인물",
                "profile": {"age": 30},
                "traits": {},
                "source": {"persona_id": "FIX-A"},
            },
            {
                "card_text": "B 가상 인물",
                "profile": {"age": 31},
                "traits": {},
                "source": {"persona_id": "FIX-B"},
            },
        ],
    )
    assert (
        await client.post(
            f"/studies/{sid}/workflow",
            json={"scope": {"exploration": "journey", "goal_url": "/done.html"}},
        )
    ).status_code == 200
    return sid, await run_repo.create_run(session, sid, "act")


async def test_one_persona_failure_does_not_stop_the_others(client, session, monkeypatch):
    from app.services import runner

    sid, run = await _two_persona_run(client, session)
    original = browser.explore

    def decide(persona, task, screen, image, history):
        element = next(e for e in screen["elements"] if e["text"] == "결과 보기")
        return {
            "action": "click",
            "target": element["id"],
            "value": None,
            "drop_reason": None,
            "reason": "가상 인물의 선택",
        }

    async def simulated(*args, **kw):
        if args[2]["card_text"].startswith("A"):
            raise runner.LLMError("LLM 응답 실패 (3회 시도): 가상 일시 오류")
        return await original(*args, decide=decide, **kw)

    monkeypatch.setattr(runner, "require_persona_transmission", lambda: None)
    monkeypatch.setattr(browser, "explore", simulated)
    await runner.execute_run(session, run.id)
    assert (await run_repo.get_run(session, run.id)).status == "done"
    results = (await client.get(f"/runs/{run.id}/report")).json()["results"]
    by = {r["persona_id"]: r for r in results}
    assert by["FIX-A"]["act"] is None  # 실패한 사람은 '결과 없음'으로 남는다
    assert by["FIX-B"]["act"]["end"]["result"] == "complete"  # 나머지는 정상 완료
    control = await repo.control(session, run.id)
    assert "1명은 실행 중 오류" in control.error


async def test_fatal_llm_error_still_stops_the_whole_run(client, session, monkeypatch):
    from app.services import runner
    from app.services.llm import FatalLLMError

    sid, run = await _two_persona_run(client, session)

    async def simulated(*args, **kw):
        raise FatalLLMError(
            "OpenAI API 크레딧 또는 결제 한도를 확인해 주세요. (insufficient_quota)"
        )

    monkeypatch.setattr(runner, "require_persona_transmission", lambda: None)
    monkeypatch.setattr(browser, "explore", simulated)
    await runner.execute_run(session, run.id)
    assert (await run_repo.get_run(session, run.id)).status == "failed"
    assert "insufficient_quota" in (await repo.control(session, run.id)).error


async def test_all_personas_failing_marks_the_run_failed(client, session, monkeypatch):
    from app.services import runner

    sid, run = await _two_persona_run(client, session)

    async def simulated(*args, **kw):
        raise runner.LLMError("LLM 응답 실패 (3회 시도): 가상 오류")

    monkeypatch.setattr(runner, "require_persona_transmission", lambda: None)
    monkeypatch.setattr(browser, "explore", simulated)
    await runner.execute_run(session, run.id)
    assert (await run_repo.get_run(session, run.id)).status == "failed"


async def test_shared_browser_is_launched_once_and_reused_then_closed():
    async with browser.shared_browser() as holder:
        assert holder._browser is None  # 처음 쓰기 전에는 아무것도 띄우지 않는다
        async with browser.open_page(bundle(), "desktop") as (page, base, blocked):
            first = holder._browser
            assert first is not None and await page.title() is not None
        async with browser.open_page(bundle(), "desktop") as (page, base, blocked):
            assert holder._browser is first  # 두 번째 사람도 같은 크로미움을 쓴다
    assert holder._browser is None  # 실행이 끝나면 닫힌다
    # 공유 블록 밖에서는 이전처럼 호출마다 따로 띄운다
    async with browser.open_page(bundle(), "desktop") as (page, base, blocked):
        assert page is not None


async def test_run_meta_records_engine_model_prompt_revision_and_usage(
    client, session, monkeypatch
):
    from app.core.config import PROMPT_REVISION
    from app.services import llm, runner

    sid, run = await _two_persona_run(client, session)
    original = browser.explore

    def decide(persona, task, screen, image, history):
        element = next(e for e in screen["elements"] if e["text"] == "결과 보기")
        return {
            "action": "click",
            "target": element["id"],
            "value": None,
            "drop_reason": None,
            "reason": "가상 선택",
        }

    async def simulated(*args, **kw):
        # 실제 호출 없이 사용량 수집기에 두 번의 호출을 흉내 낸다(재시도도 과금되므로 호출마다
        # 더한다)
        sink = llm._USAGE.get()
        sink.add(2000, 100)
        sink.add(2600, 90)
        return await original(*args, decide=decide, **kw)

    monkeypatch.setattr(runner, "require_persona_transmission", lambda: None)
    monkeypatch.setattr(runner.rule_agent, "use_rule_engine", lambda: False)
    monkeypatch.setattr(browser, "explore", simulated)
    await runner.execute_run(session, run.id)
    report = (await client.get(f"/runs/{run.id}/report")).json()
    meta = report["meta"]
    assert (
        meta["engine"] == "llm"
        and meta["prompt_rev"] == PROMPT_REVISION
        and meta["failed_personas"] == 0
    )
    assert meta["usage"] == {
        "calls": 4,
        "input_tokens": 9200,
        "output_tokens": 380,
    }  # 두 사람 × 두 번
    live = (await client.get(f"/studies/{sid}/report")).json()
    assert live["meta"]["usage"]["calls"] == 4


async def test_observations_are_saved_with_the_action_and_show_up_in_the_report(
    client, session, monkeypatch
):
    from app.services import runner

    sid, run = await _two_persona_run(client, session)
    original = browser.explore

    def decide(persona, task, screen, image, history):
        element = next(e for e in screen["elements"] if e["text"] == "결과 보기")
        obs = (
            [
                {
                    "dimension": "신뢰",
                    "polarity": "issue",
                    "severity": "moderate",
                    "note": "왜 이 정보가 필요한지 화면에 설명이 없다",
                },
                {
                    "dimension": "시각",
                    "polarity": "good",
                    "severity": None,
                    "note": "버튼이 눈에 잘 띈다",
                },
            ]
            if persona["card_text"].startswith("A")
            else []
        )
        return {
            "action": "click",
            "target": element["id"],
            "value": None,
            "drop_reason": None,
            "reason": "가상 선택",
            "observations": obs,
        }

    async def simulated(*args, **kw):
        return await original(*args, decide=decide, **kw)

    monkeypatch.setattr(runner, "require_persona_transmission", lambda: None)
    monkeypatch.setattr(browser, "explore", simulated)
    await runner.execute_run(session, run.id)
    results = {
        r["persona_id"]: r for r in (await client.get(f"/runs/{run.id}/report")).json()["results"]
    }
    first = results["FIX-A"]["act"]["events"][0]
    assert first["observations"] == [
        {
            "dimension": "신뢰",
            "polarity": "issue",
            "severity": "moderate",
            "note": "왜 이 정보가 필요한지 화면에 설명이 없다",
        },
        {"dimension": "시각", "polarity": "good", "severity": None, "note": "버튼이 눈에 잘 띈다"},
    ]
    assert (
        results["FIX-A"]["act"]["end"]["result"] == "complete"
    )  # 문제가 있었지만 목표에는 도달했다
    assert results["FIX-B"]["act"]["events"][0]["observations"] == []


def test_browser_decision_schema_asks_for_observations_and_rejects_malformed_ones(monkeypatch):
    seen = {}

    def fake(system, contents, schema, check=None):
        seen.update(system=system, schema=schema, check=check)
        return {}

    monkeypatch.setattr(browser, "require_persona_transmission", lambda: None)
    monkeypatch.setattr(browser, "call_llm", fake)
    monkeypatch.setattr(browser, "image_part", lambda i: None)
    screen = {
        "id": "S",
        "elements": [{"id": "pl-0", "text": "다음", "kind": "a", "type": "", "in_view": True}],
    }
    browser.decide_browser({"card_text": "가상"}, "과제", screen, None, [])
    assert (
        "observations" in seen["schema"]["properties"]
        and "observations" in seen["schema"]["required"]
    )
    assert "observations" in seen["system"] and "blocking" in seen["system"]
    check = seen["check"]
    ok = {"action": "click", "target": "pl-0", "value": None, "drop_reason": None, "reason": "r"}
    good = {"dimension": "시각", "polarity": "good", "severity": None, "note": "위계가 분명하다"}
    issue = {
        "dimension": "이해",
        "polarity": "issue",
        "severity": "blocking",
        "note": "무슨 서비스인지 알 수 없다",
    }
    assert check({**ok, "observations": []}) is None
    assert check({**ok, "observations": [good, issue]}) is None
    assert check({**ok})  # 목록이 없으면 다시 요청
    assert check({**ok, "observations": [{**issue, "dimension": "없는차원"}]})
    assert check({**ok, "observations": [{**issue, "severity": None}]})  # 문제인데 심각도 없음
    assert check({**ok, "observations": [{**good, "severity": "minor"}]})  # 잘 된 점에 심각도
    assert check({**ok, "observations": [{**issue, "note": "  "}]})
    assert check({**ok, "observations": [issue, issue, issue, issue]})  # 최대 3개


def test_llm_only_sees_and_may_choose_elements_that_are_on_screen(monkeypatch):
    seen = {}

    def fake(system, contents, schema, check=None):
        seen.update(contents=contents, check=check, system=system)
        return {}

    monkeypatch.setattr(browser, "require_persona_transmission", lambda: None)
    monkeypatch.setattr(browser, "call_llm", fake)
    monkeypatch.setattr(browser, "image_part", lambda i: None)
    screen = {
        "id": "S",
        "elements": [
            {
                "id": "pl-0",
                "text": "지금 보이는 버튼",
                "kind": "button",
                "type": "",
                "in_view": True,
            },
            {
                "id": "pl-1",
                "text": "화면 아래 숨은 버튼",
                "kind": "button",
                "type": "",
                "in_view": False,
            },
        ],
    }
    browser.decide_browser({"card_text": "가상"}, "과제", screen, None, [])
    import json

    shown = json.loads(seen["contents"][0])["current_screen"]
    assert [e["id"] for e in shown["elements"]] == ["pl-0"] and shown["below_fold_elements"] == 1
    ok = {"action": "click", "value": None, "drop_reason": None, "reason": "r", "observations": []}
    assert seen["check"]({**ok, "target": "pl-0"}) is None
    assert seen["check"]({**ok, "target": "pl-1"})  # 화면 밖 요소는 스크롤하기 전에는 고를 수 없다
    assert (
        seen["check"](
            {
                "action": "scroll",
                "target": None,
                "value": None,
                "drop_reason": None,
                "reason": "내려 본다",
                "observations": [],
            }
        )
        is None
    )
    # 보이는 요소가 하나도 없으면(예: 측정 실패) 막히지 않도록 전체를 보여 준다
    seen.clear()
    browser.decide_browser(
        {"card_text": "가상"},
        "과제",
        {
            "id": "S",
            "elements": [{"id": "pl-9", "text": "x", "kind": "a", "type": "", "in_view": False}],
        },
        None,
        [],
    )
    assert [e["id"] for e in json.loads(seen["contents"][0])["current_screen"]["elements"]] == [
        "pl-9"
    ]


async def test_workflow_without_images_drops_capture_data_but_keeps_settings(client, session):
    sid = (await client.post("/studies", json={"name": "이미지 제외 점검"})).json()["id"]
    source = bundle()
    assert (
        await client.post(
            f"/studies/{sid}/sources/html",
            json={"files": source["files"], "entry": source["entry"]},
        )
    ).status_code == 200
    full = await client.get(f"/studies/{sid}/workflow")
    light = await client.get(f"/studies/{sid}/workflow?images=0")
    assert full.status_code == 200 and light.status_code == 200
    assert (
        full.json()["source"].get("preview", "").startswith("data:image")
    )  # 기본은 지금까지와 똑같이 이미지를 준다
    assert "preview" not in light.json()["source"]  # 설정값만 필요한 호출에는 이미지를 뺀다
    assert (
        light.json()["source"]["kind"] == "html" and light.json()["scope"] == full.json()["scope"]
    )
    assert len(light.content) < len(full.content)


def test_extra_good_observations_are_trimmed_not_rejected(monkeypatch):
    """잘 된 점이 여럿이어도 그 사람의 실행을 버리지 않고 첫 번째만 남긴다."""
    good = {"dimension": "이해", "polarity": "good", "severity": None, "note": "첫 번째"}
    other = {"dimension": "시각", "polarity": "good", "severity": None, "note": "두 번째"}
    issue = {"dimension": "신뢰", "polarity": "issue", "severity": "minor", "note": "문제"}

    def fake(system, contents, schema, check=None):
        out = {"action": "click", "target": "pl-0", "observations": [good, other, issue]}
        assert (
            check({**out, "value": None, "drop_reason": None, "reason": "r"}) is None
        )  # 검사는 통과시키고, 자르기는 반환 후에 한다
        return out

    monkeypatch.setattr(browser, "require_persona_transmission", lambda: None)
    monkeypatch.setattr(browser, "call_llm", fake)
    monkeypatch.setattr(browser, "image_part", lambda i: None)
    screen = {
        "id": "S",
        "elements": [{"id": "pl-0", "text": "다음", "kind": "a", "type": "", "in_view": True}],
    }
    result = browser.decide_browser({"card_text": "가상"}, "과제", screen, None, [])
    assert result["observations"] == [good, issue]
