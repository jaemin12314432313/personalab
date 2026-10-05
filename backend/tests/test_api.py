"""입력 → 패널 → 실행까지 한 번에 (계획서 3장 ①~⑦). 실행은 백그라운드 대신 직접 돌린다."""

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
async def client(session):
    started: list[int] = []

    async def record(run_id: int) -> None:
        started.append(run_id)

    app.dependency_overrides[get_session] = lambda: session
    app.dependency_overrides[run_launcher] = lambda: record
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
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


async def test_run_needs_inputs(client):
    sid = await make_study(client)
    res = await client.post(f"/studies/{sid}/runs", json={"mode": "act"})
    assert res.status_code == 409
    assert "AI 패널" in res.json()["detail"]


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
