"""입력 → 패널 → 실행까지 한 번에 (계획서 3장 ①~⑦). 실행은 백그라운드 대신 직접 돌린다."""

from functools import partial

import pytest
from httpx import ASGITransport, AsyncClient

from app.api.studies import run_launcher
from app.core.db import get_session
from app.main import app
from app.repositories import run as run_repo
from app.services.runner import execute_run

SCREENS = [
    {"id": "S01", "label": "온보딩", "elements": [{"text": "시작하기", "to": "S02"}]},
    {"id": "S02", "label": "회원가입", "elements": [{"text": "다음", "to": "S03"}]},
    {"id": "S03", "label": "홈", "elements": []},
]


@pytest.fixture
async def client(session, monkeypatch):
    # API/DB 통합 테스트에서는 외부 데이터 다운로드와 유료 LLM 호출을 하지 않는다.
    from app.api import studies
    from app.core.config import settings

    monkeypatch.setattr(settings, "allow_persona_transmission", True)
    from app.services import runner
    from app.services.act.loop import agent_loop

    def sample(_conditions, n, _seed):
        return [
            {
                "card_text": "20세 대학생",
                "profile": {"age": 20, "job_group": "학생"},
                "traits": {},
                "source": {},
            }
            for _ in range(n)
        ]

    def ask(_persona, product, _questions):
        return {
            "usage_intention": 3,
            "needed_features": product["features"][:1],
            "unneeded_features": [],
            "concern": "PRICE",
            "willingness_to_pay": 0,
            "reason": "테스트 응답",
        }

    def decide(_persona, _task, screen, _history):
        return {
            "action": "click",
            "target": screen["elements"][0]["text"],
            "drop_reason": None,
            "reason": "테스트 선택",
        }

    monkeypatch.setattr(studies, "sample_personas", sample)
    monkeypatch.setattr(runner, "ask_persona", ask)
    monkeypatch.setattr(runner, "agent_loop", partial(agent_loop, decide=decide))
    started: list[int] = []

    async def record(run_id: int) -> None:
        started.append(run_id)

    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[run_launcher] = lambda: record
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
        headers={"X-Requested-With": "PersonaLab"},
    ) as c:
        registered = await c.post(
            "/auth/register",
            json={"email": "api-integration@example.com", "password": "integration-password-2026"},
        )
        assert registered.status_code == 201
        c.started = started
        yield c
    app.dependency_overrides.clear()


async def make_study(client) -> int:
    res = await client.post("/studies", json={"name": "일정메이트 온보딩"})
    assert res.status_code == 201
    return res.json()["id"]


async def test_full_flow(client, session):
    sid = await make_study(client)
    product = {"description": "일정 정리", "features": ["자동 정리", "친구 공유"], "price": "무료"}
    question = {"code": "Q1", "type": "scale", "text": "무슨 앱인지 알겠는가"}
    task = {"description": "가입하세요", "goal_screen_id": "S03"}

    assert (await client.post(f"/studies/{sid}/product", json=product)).status_code == 200
    res = await client.post(f"/studies/{sid}/prototype/manual", json={"screens": SCREENS})
    assert res.status_code == 200
    assert (await client.post(f"/studies/{sid}/task", json=task)).status_code == 200
    res = await client.post(f"/studies/{sid}/questions", json={"questions": [question]})
    assert res.status_code == 200
    res = await client.post(f"/studies/{sid}/panel/generate", json={"n": 3})
    assert len(res.json()) == 3

    for mode in ("ask", "act"):
        res = await client.post(f"/studies/{sid}/runs", json={"mode": mode})
        assert res.status_code == 202
        run_id = res.json()["id"]
        assert client.started[-1] == run_id

        await execute_run(session, run_id)
        status = (await client.get(f"/runs/{run_id}/status")).json()
        assert status["status"] == "done"
        assert status["progress"] == 1.0

    ask_run, act_run = client.started
    assert len(await run_repo.list_ask_responses(session, ask_run)) == 3
    logs = await run_repo.list_act_logs(session, act_run)
    # 임시 decide 는 첫 버튼만 눌러 목표에 닿는다
    assert [r.action for r in logs].count("complete") == 3

    # 리포트: 두 실행의 결과가 페르소나별로 묶여 나온다
    report = (await client.get(f"/studies/{sid}/report")).json()
    assert (report["ask_run_id"], report["act_run_id"]) == (ask_run, act_run)
    assert len(report["results"]) == 3
    first = report["results"][0]
    assert first["ask"] is not None and first["persona_id"].startswith("P")
    assert first["act"]["path"] == ["S01", "S02", "S03"]
    assert first["act"]["end"]["result"] == "complete"


async def test_report_before_any_run_has_empty_sides(client):
    sid = await make_study(client)
    await client.post(f"/studies/{sid}/panel/generate", json={"n": 2})
    report = (await client.get(f"/studies/{sid}/report")).json()
    assert report["ask_run_id"] is None and report["act_run_id"] is None
    assert [(r["ask"], r["act"]) for r in report["results"]] == [(None, None), (None, None)]


async def test_report_of_unknown_study_is_404(client):
    assert (await client.get("/studies/999999/report")).status_code == 404


async def test_study_detail_restores_inputs_panel_and_latest_run(client, session):
    sid = await make_study(client)
    await client.post(
        f"/studies/{sid}/product",
        json={"description": "제품 이름\n원본 설명", "features": ["정리"], "price": "무료"},
    )
    await client.post(f"/studies/{sid}/prototype/manual", json={"screens": SCREENS})
    await client.post(
        f"/studies/{sid}/task", json={"description": "홈으로 이동", "goal_screen_id": "S03"}
    )
    await client.post(f"/studies/{sid}/panel/generate", json={"n": 2})
    run = await run_repo.create_run(session, sid, "ask")
    detail = (await client.get(f"/studies/{sid}")).json()
    assert detail["product"]["description"] == "제품 이름\n원본 설명"
    assert detail["prototype"]["screens"][0]["id"] == "S01"
    assert detail["task"]["goal_screen_id"] == "S03"
    assert len(detail["personas"]) == 2
    assert detail["runs"][0]["id"] == run.id


async def test_study_detail_is_owned_by_current_user(client, session):
    from app.repositories import study as study_repo

    other_user = await study_repo.get_or_create_user(session, "other-workspace-user@example.test")
    other_study = await study_repo.create_study(session, other_user.id, "다른 사용자 스터디")
    assert (await client.get(f"/studies/{other_study.id}")).status_code == 404


async def test_run_needs_inputs(client):
    sid = await make_study(client)
    res = await client.post(f"/studies/{sid}/runs", json={"mode": "act"})
    assert res.status_code == 409
    assert "AI 패널" in res.json()["detail"]


async def test_running_report_exposes_only_saved_results(client, session):
    sid = await make_study(client)
    await client.post(
        f"/studies/{sid}/product",
        json={"description": "일정 정리", "features": ["자동 정리"], "price": "무료"},
    )
    await client.post(f"/studies/{sid}/panel/generate", json={"n": 2})
    run = await run_repo.create_run(session, sid, "ask")
    from app.repositories import study as study_repo

    panel = await study_repo.list_personas(session, sid)
    await run_repo.set_run_state(session, run, status="running", progress=0.5)
    await run_repo.add_ask_response(
        session,
        run.id,
        panel[0].id,
        {
            "usage_intention": 2,
            "willingness_to_pay": 0,
            "needed_features": [],
            "unneeded_features": [],
            "concern": "PRIVACY",
            "reason": "저장된 응답",
        },
    )
    report = (await client.get(f"/runs/{run.id}/report")).json()
    assert report["ask_run_id"] == run.id
    assert report["results"][0]["ask"]["reason"] == "저장된 응답"
    assert report["results"][1]["ask"] is None
    assert all(r["act"] is None for r in report["results"])
    assert (await client.get("/runs/999999/report")).status_code == 404


async def test_run_report_cannot_read_another_users_results(client, session):
    from app.repositories import study as study_repo

    other_user = await study_repo.get_or_create_user(session, "other-report-user@example.test")
    other_study = await study_repo.create_study(session, other_user.id, "다른 사용자")
    other_run = await run_repo.create_run(session, other_study.id, "ask")
    assert (await client.get(f"/runs/{other_run.id}/report")).status_code == 404


async def test_prototype_rejects_broken_link(client):
    sid = await make_study(client)
    broken = [{"id": "S01", "label": "시작", "elements": [{"text": "다음", "to": "S99"}]}]
    res = await client.post(f"/studies/{sid}/prototype/manual", json={"screens": broken})
    assert res.status_code == 422


async def test_task_goal_must_exist(client):
    sid = await make_study(client)
    await client.post(f"/studies/{sid}/prototype/manual", json={"screens": SCREENS})
    res = await client.post(
        f"/studies/{sid}/task", json={"description": "가입", "goal_screen_id": "S99"}
    )
    assert res.status_code == 422


async def test_unknown_study_is_404(client):
    assert (await client.get("/studies/999999")).status_code == 404


async def test_deferred_persona_transmission_does_not_queue_a_run(client, session, monkeypatch):
    from sqlalchemy import func, select

    from app.core.config import settings
    from app.models import Run

    monkeypatch.setattr(settings, "allow_persona_transmission", False)
    sid = await make_study(client)
    before = await session.scalar(select(func.count()).select_from(Run))
    for mode in ("act", "ask"):
        response = await client.post(f"/studies/{sid}/runs", json={"mode": mode})
        assert response.status_code == 409
        assert "전송이 보류" in response.json()["detail"]
    assert await session.scalar(select(func.count()).select_from(Run)) == before
    assert client.started == []


async def test_rule_engine_lets_act_start_without_transmission_or_a_key(
    client, session, monkeypatch
):
    from app.core.config import settings

    monkeypatch.setattr(settings, "agent_engine", "rule")
    monkeypatch.setattr(settings, "allow_persona_transmission", False)
    monkeypatch.setattr(settings, "llm_api_key", "")
    caps = (await client.get("/capabilities")).json()
    assert caps["agent_engine"] == "rule" and not any("LLM API 키" in m for m in caps["missing"])
    sid = await make_study(client)
    # 입력이 모자라면 규칙 기반이어도 먼저 입력을 요구한다(전송 보류로 막히지 않고 다음 검사로
    # 넘어간다)
    response = await client.post(f"/studies/{sid}/runs", json={"mode": "act"})
    assert response.status_code == 409 and "전송이 보류" not in response.json()["detail"]
    # Ask(모델 호출)는 규칙 기반이 대신할 수 없으므로 여전히 막힌다
    ask = await client.post(f"/studies/{sid}/runs", json={"mode": "ask"})
    assert ask.status_code == 409 and "전송이 보류" in ask.json()["detail"]


async def test_figma_import_applies_owned_document_and_refuses_run_history(
    client, session, monkeypatch
):
    from app.api import studies

    calls = []

    async def fake_import(url):
        calls.append(url)
        return SCREENS, ["이미지 분석은 포함하지 않습니다."]

    monkeypatch.setattr(studies, "import_file", fake_import)
    sid = await make_study(client)
    response = await client.post(
        f"/studies/{sid}/prototype", json={"url": "https://www.figma.com/design/ABC123/test"}
    )
    assert response.status_code == 200
    assert len(response.json()["screens"]) == 3
    assert response.json()["warnings"] == ["이미지 분석은 포함하지 않습니다."]
    assert (
        (await client.get(f"/studies/{sid}"))
        .json()["prototype"]["figma_url"]
        .startswith("https://www.figma.com/")
    )
    await run_repo.create_run(session, sid, "act")
    assert (
        await client.post(
            f"/studies/{sid}/prototype", json={"url": "https://www.figma.com/design/ABC123/test"}
        )
    ).status_code == 409
    assert len(calls) == 1
    assert (
        await client.post(
            "/studies/999999/prototype", json={"url": "https://www.figma.com/design/ABC123/test"}
        )
    ).status_code == 404
    assert len(calls) == 1


async def test_persona_summary_keeps_execution_builder_private_without_model_call(
    client, session, monkeypatch
):
    from app.core.config import settings
    from app.services.act import decide

    monkeypatch.setattr(settings, "allow_persona_transmission", False)
    calls = []
    monkeypatch.setattr(decide, "call_llm", lambda *args: calls.append(args))
    sid = await make_study(client)
    await client.post(f"/studies/{sid}/prototype/manual", json={"screens": SCREENS})
    await client.post(
        f"/studies/{sid}/task", json={"description": "가입하세요", "goal_screen_id": "S03"}
    )
    panel = (await client.post(f"/studies/{sid}/panel/generate", json={"n": 1})).json()
    pid = panel[0]["id"]
    response = await client.get(f"/studies/{sid}/personas/{pid}/prompt")
    assert response.status_code == 200
    data = response.json()
    assert data["persona_id"] == pid
    assert data["system"] == "" and data["contents"] == [] and data["response_schema"] == {}
    assert data["preview_kind"] == "public_persona_summary"
    assert data["card_text"] == panel[0]["attributes"]["card_text"]
    assert data["screen_id"] == "S01"
    assert not calls
    assert "S03" not in str(data["contents"])
    other = await make_study(client)
    assert (await client.get(f"/studies/{other}/personas/{pid}/prompt")).status_code == 404
    assert (await client.get(f"/studies/999999/personas/{pid}/prompt")).status_code == 404
    await client.post("/auth/logout", json={})
    assert (await client.get(f"/studies/{sid}/personas/{pid}/prompt")).status_code == 401


async def test_act_report_is_saved_once_and_does_not_mix_ask(client, session):
    from app.repositories import study as study_repo
    from app.services.runner import save_report_snapshot

    sid = await make_study(client)
    await client.post(
        f"/studies/{sid}/product",
        json={"description": "일정 정리", "features": ["자동 정리"], "price": "무료"},
    )
    await client.post(f"/studies/{sid}/panel/generate", json={"n": 2})
    panel = await study_repo.list_personas(session, sid)
    ask = await run_repo.create_run(session, sid, "ask")
    await run_repo.add_ask_response(
        session,
        ask.id,
        panel[0].id,
        {
            "usage_intention": 2,
            "willingness_to_pay": 0,
            "needed_features": [],
            "unneeded_features": [],
            "concern": "PRIVACY",
            "reason": "기획 응답",
        },
    )
    await run_repo.set_run_state(session, ask, status="done", progress=1)
    act = await run_repo.create_run(session, sid, "act")
    rows = [
        {
            "turn": 0,
            "screen_id": "S01",
            "action": "click",
            "target": "시작",
            "drop_reason": None,
            "reason": "눌러요",
        },
        {
            "turn": 1,
            "screen_id": "S02",
            "action": "complete",
            "target": None,
            "drop_reason": None,
            "reason": None,
        },
    ]
    await run_repo.add_ai_act_logs(session, act.id, panel[0].id, rows)
    before = (await client.get(f"/runs/{act.id}/report")).json()
    assert before["outcome"] is None  # 아직 저장 전이면 계산값
    assert before["ask_run_id"] is None and all(r["ask"] is None for r in before["results"])

    await save_report_snapshot(session, act, "cancelled")
    # 저장 뒤에 로그가 더 생겨도 저장된 결과는 그대로이고, 두 번째 저장은 무시된다
    await run_repo.add_ai_act_logs(session, act.id, panel[1].id, rows)
    await save_report_snapshot(session, act, "done")
    saved = (await client.get(f"/runs/{act.id}/report")).json()
    assert saved["outcome"] == "cancelled" and saved["saved_at"]
    assert saved["results"][0]["act"]["end"]["result"] == "complete"
    assert saved["results"][1]["act"] is None
    assert saved["ask_run_id"] is None and all(r["ask"] is None for r in saved["results"])


async def test_llm_interview_is_refused_while_the_rule_engine_is_on(client, session, monkeypatch):
    """모델 비용이 없는 모드에서는 인터뷰의 유료 질문(llm)을 막고 기록 조회(records)만 남긴다."""
    from app.core.config import RULE_ENGINE_INTERVIEW_NOTICE, settings

    monkeypatch.setattr(settings, "agent_engine", "rule")
    assert (await client.get("/capabilities")).json()["interview_llm_ready"] is False
    sid = await make_study(client)
    run = await run_repo.create_run(session, sid, "act")
    await run_repo.set_run_state(session, run, status="done", progress=1)
    from app.repositories import study as study_repo

    await study_repo.replace_personas(
        session,
        sid,
        [
            {
                "card_text": "직접 만든 가상 인물",
                "profile": {"age": 30},
                "traits": {},
                "source": {"persona_id": "FIXTURE"},
            }
        ],
    )
    person = (await study_repo.list_personas(session, sid))[0]
    res = await client.post(
        f"/runs/{run.id}/personas/{person.id}/interview",
        json={"question": "왜 멈췄나요?", "mode": "llm"},
    )
    assert res.status_code == 409 and RULE_ENGINE_INTERVIEW_NOTICE in res.json()["detail"]
