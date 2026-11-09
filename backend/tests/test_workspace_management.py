import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select

from app.core.config import settings
from app.core.db import get_session
from app.main import app
from app.models import (
    InterviewThread,
    PersonaLibraryEntry,
    Run,
    Study,
)
from app.repositories import run as runs
from app.repositories import study as studies


@pytest.fixture
async def client(session, monkeypatch):
    monkeypatch.setattr(settings, "allow_persona_transmission", False)
    monkeypatch.setattr(settings, "local_tools_enabled", True)
    app.dependency_overrides[get_session] = lambda: session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"X-Requested-With": "PersonaLab"},
        ) as c:
            assert (
                await c.post(
                    "/auth/register",
                    json={"email": "manage-fixture@example.com", "password": "1234"},
                )
            ).status_code == 201
            yield c
    finally:
        app.dependency_overrides.clear()


async def create(client, session, name="관리 점검"):
    sid = (await client.post("/studies", json={"name": name})).json()["id"]
    await studies.set_product(session, sid, "원본 제품 이름\n원본 설명", ["이동"], "")
    await studies.set_prototype(
        session,
        sid,
        None,
        [
            {
                "id": "A",
                "label": "시작",
                "description": "원본 화면",
                "elements": [{"text": "다음", "to": "B"}],
            },
            {"id": "B", "label": "완료", "elements": []},
        ],
    )
    await studies.set_task(session, sid, "완료 화면으로 이동", "B")
    await studies.replace_personas(
        session,
        sid,
        [
            {
                "card_text": "자체 작성 가상 인물",
                "profile": {"age": 30},
                "traits": {},
                "source": {"persona_id": "FIXTURE"},
            }
        ],
    )
    return sid


async def manage(client, sid, action, **fields):
    return await client.post(f"/studies/{sid}/manage", json={"action": action, **fields})


async def test_rename_keeps_completed_inputs_and_applies_to_every_round(client, session):
    sid = await create(client, session)
    run = await runs.create_run(session, sid, "act")
    await runs.set_run_state(session, run, status="done")
    child = (await client.post(f"/studies/{sid}/revisions", json={})).json()["id"]
    renamed = await manage(client, child, "rename", name="새 표시 이름")
    assert renamed.status_code == 200 and renamed.json()["affected_study_ids"] == [sid, child]
    for value in (sid, child):
        detail = (await client.get(f"/studies/{value}")).json()
        assert detail["workspace"]["display_name"] == "새 표시 이름"
        assert detail["product"]["description"] == "원본 제품 이름\n원본 설명"
    assert (await manage(client, sid, "rename", name="   ")).status_code == 422


async def test_duplicate_copies_inputs_to_an_independent_test_without_results(client, session):
    sid = await create(client, session)
    run = await runs.create_run(session, sid, "act")
    await runs.set_run_state(session, run, status="done")
    r = await manage(client, sid, "duplicate")
    assert r.status_code == 200
    copy = r.json()["duplicate_id"]
    assert copy != sid
    a = (await client.get(f"/studies/{sid}")).json()
    b = (await client.get(f"/studies/{copy}")).json()
    assert (
        b["product"]["description"] == a["product"]["description"]
        and b["prototype"]["screens"] == a["prototype"]["screens"]
    )

    def shown(
        person,
        # 고객 응답은 원본 식별자를 숨기고 DB 번호로 표시 ID를 만들므로, 복제본과 표시 ID는 달라도
        # 된다
    ):
        attrs = {**person["attributes"]}
        attrs["source"] = {k: v for k, v in attrs.get("source", {}).items() if k != "persona_id"}
        return attrs

    assert (
        shown(b["personas"][0]) == shown(a["personas"][0])
        and b["personas"][0]["id"] != a["personas"][0]["id"]
    )
    assert b["runs"] == [] and b["workspace"]["display_name"] == "관리 점검 복사본"
    assert (await client.get(f"/studies/{copy}/workflow")).json()["root_study_id"] == copy


async def test_archive_trash_restore_and_protected_records(client, session):
    sid = await create(client, session)
    run = await runs.create_run(session, sid, "act")
    await runs.set_run_state(session, run, status="done")
    person = (await studies.list_personas(session, sid))[0]
    await runs.add_ai_act_logs(
        session,
        run.id,
        person.id,
        [
            {
                "turn": 1,
                "screen_id": "A",
                "action": "abandon",
                "target": None,
                "drop_reason": "PRIVACY",
                "reason": "가상 기록",
            }
        ],
    )
    child = (await client.post(f"/studies/{sid}/revisions", json={})).json()["id"]
    assert (await manage(client, sid, "archive")).status_code == 200
    assert (await client.get("/studies")).json() == []
    assert len((await client.get("/studies?include_hidden=true")).json()) == 2
    assert (await client.get(f"/studies/{sid}")).status_code == 200
    assert (await manage(client, child, "trash")).status_code == 200
    for path in [
        f"/studies/{sid}",
        f"/studies/{child}",
        f"/runs/{run.id}/report",
        f"/runs/{run.id}/evidence",
        f"/runs/{run.id}/personas/{person.id}/interview",
    ]:
        assert (await client.get(path)).status_code == 404, path
    assert (await manage(client, sid, "restore")).status_code == 200
    assert len((await client.get("/studies")).json()) == 2
    assert (await client.get(f"/runs/{run.id}/report")).status_code == 200


async def test_running_round_blocks_destructive_group_actions(client, session):
    sid = await create(client, session)
    child = (await client.post(f"/studies/{sid}/revisions", json={})).json()["id"]
    run = await runs.create_run(session, sid, "act")
    for action in ("trash", "archive", "duplicate", "delete"):
        assert (await manage(client, child, action, confirmation="관리 점검")).status_code == 409
    assert (await manage(client, child, "rename", name="실행 중 이름 변경")).status_code == 200
    await runs.set_run_state(session, run, status="failed")
    assert (await manage(client, child, "trash")).status_code == 200


async def test_permanent_delete_requires_trash_and_name_and_preserves_shared_library(
    client, session
):
    count = await session.scalar(select(func.count()).select_from(PersonaLibraryEntry))
    local = (await client.post("/local/demo", json={})).json()
    sid = local["study_id"]
    rid = local["run_id"]
    person = (await studies.list_personas(session, sid))[0]
    await client.post(
        f"/runs/{rid}/personas/{person.id}/interview",
        json={"question": "어떤 경로였나요?", "mode": "records"},
    )
    child = (await client.post(f"/studies/{sid}/revisions", json={})).json()["id"]
    # 별도 보관함과 이 테스트의 스냅샷은 삭제 범위가 다르다.
    name = "영구 삭제 점검"
    assert (await manage(client, sid, "rename", name=name)).status_code == 200
    assert (await manage(client, sid, "delete", confirmation=name)).status_code == 409
    assert (await manage(client, child, "trash")).status_code == 200
    assert (await manage(client, child, "delete", confirmation="다른 이름")).status_code == 422
    response = await manage(client, child, "delete", confirmation=name)
    assert response.status_code == 200 and response.json()["deleted"]
    assert not list(await session.scalars(select(Study.id).where(Study.id.in_([sid, child]))))
    assert not list(await session.scalars(select(Run.id).where(Run.study_id.in_([sid, child]))))
    assert not list(
        await session.scalars(select(InterviewThread.id).where(InterviewThread.run_id == rid))
    )
    assert await session.scalar(select(func.count()).select_from(PersonaLibraryEntry)) == count


async def test_other_account_cannot_manage_any_action(client, session):
    sid = await create(client, session)
    await client.post("/auth/logout", json={})
    await client.post(
        "/auth/register", json={"email": "other-manager@example.com", "password": "1234"}
    )
    for action in ("rename", "duplicate", "archive", "unarchive", "trash", "restore", "delete"):
        assert (
            await manage(client, sid, action, name="침범", confirmation="관리 점검")
        ).status_code == 404
    assert (await client.get("/studies?include_hidden=true")).json() == []


async def test_revision_note_is_saved_per_round(client, session):
    sid = await create(client, session)
    child = (
        await client.post(f"/studies/{sid}/revisions", json={"note": "  온보딩 v3 · 가입 흐름  "})
    ).json()["id"]
    rows = (await client.get(f"/studies/{child}/revisions")).json()
    assert [(r["revision"], r["note"]) for r in rows] == [(2, "온보딩 v3 · 가입 흐름"), (1, "")]
    # 본문 없이 만들면 이전 회차의 상세를 이어받지 않고 빈 값
    third = (await client.post(f"/studies/{child}/revisions", json={})).json()["id"]
    assert (await client.get(f"/studies/{third}/revisions")).json()[0]["note"] == ""
    assert (
        await client.post(f"/studies/{child}/revisions", json={"note": "x" * 201})
    ).status_code == 422


async def test_study_list_exposes_product_and_test_title_from_scope(client, session):
    sid = await create(client, session)
    scope = {"product_id": "p-abc", "test_title": "가입 흐름", "round_note": "온보딩 v3"}
    saved = await client.post(f"/studies/{sid}/workflow", json={"scope": scope})
    assert saved.status_code == 200, saved.text
    rows = (await client.get("/studies")).json()
    row = next(r for r in rows if r["id"] == sid)
    assert (row["product_id"], row["test_title"], row["round_note"]) == (
        "p-abc",
        "가입 흐름",
        "온보딩 v3",
    )
    child = (await client.post(f"/studies/{sid}/revisions", json={"note": "가입 개선"})).json()[
        "id"
    ]
    row2 = next(r for r in (await client.get("/studies")).json() if r["id"] == child)
    # 제품과 테스트 이름은 회차로 이어지고, 회차 상세만 새로 적는다
    assert (row2["product_id"], row2["test_title"], row2["round_note"]) == (
        "p-abc",
        "가입 흐름",
        "가입 개선",
    )


async def test_empty_trash_deletes_only_trashed_groups_and_skips_running(client, session):
    keep = await create(client, session, "남길 테스트")
    gone = await create(client, session, "지울 테스트")
    busy = await create(client, session, "실행 중 테스트")
    child = (await client.post(f"/studies/{gone}/revisions", json={})).json()[
        "id"
    ]  # 회차 묶음 전체가 같이 지워져야 한다
    for sid in (gone, busy):
        assert (await manage(client, sid, "trash")).status_code == 200
    running = await runs.create_run(session, busy, "act")
    await runs.set_run_state(session, running, status="running")
    assert (
        await client.post("/studies/trash/empty", json={"confirmation": "아무거나"})
    ).status_code == 422
    out = await client.post("/studies/trash/empty", json={"confirmation": "휴지통 비우기"})
    assert out.status_code == 200, out.text
    body = out.json()
    assert body["deleted"] == 1 and body["skipped"] == 1 and set(body["study_ids"]) == {gone, child}
    left = {s["id"] for s in (await client.get("/studies?include_workspace=true")).json()} | {
        s["id"] for s in (await client.get("/studies")).json()
    }
    assert keep in left
    assert await session.get(Study, gone) is None and await session.get(Study, child) is None
    assert await session.get(Study, busy) is not None and await session.get(Study, keep) is not None


async def test_blank_revision_keeps_product_and_clears_audience_and_scope(client, session):
    sid = await create(client, session)
    scope = {
        "mode": "focused",
        "focus": "결제 흐름",
        "priorities": ["약관"],
        "product_id": "pid-1",
        "test_title": "가입 흐름",
        "audience": {"description": "자영업자", "context": "매장에서"},
    }
    assert (await client.post(f"/studies/{sid}/workflow", json={"scope": scope})).status_code == 200
    # 기본(carry)은 이전 회차를 그대로 이어받는다
    kept = (await client.post(f"/studies/{sid}/revisions", json={"note": "이어받기"})).json()["id"]
    assert (await client.get(f"/studies/{kept}/workflow")).json()["scope"]["focus"] == "결제 흐름"
    assert len((await client.get(f"/studies/{kept}")).json()["personas"]) == 1
    # carry=false는 새 앱·웹처럼 비우되 같은 앱·웹 표시(제품·테스트 이름)는 남긴다
    blank = (
        await client.post(f"/studies/{sid}/revisions", json={"note": "비움", "carry": False})
    ).json()["id"]
    out = (await client.get(f"/studies/{blank}/workflow")).json()["scope"]
    assert (out["focus"], out["priorities"], out["mode"], out["audience"]["description"]) == (
        "",
        [],
        "general",
        "",
    )
    assert (out["product_id"], out["test_title"], out["round_note"]) == (
        "pid-1",
        "가입 흐름",
        "비움",
    )
    detail = (await client.get(f"/studies/{blank}")).json()
    assert detail["personas"] == [] and detail["product"] is not None


async def test_discard_deletes_only_one_later_round_and_protects_the_first(client, session):
    sid = await create(client, session)
    second = (await client.post(f"/studies/{sid}/revisions", json={})).json()["id"]
    third = (await client.post(f"/studies/{sid}/revisions", json={})).json()["id"]
    # 1회차(기준)는 지울 수 없다
    assert (await client.post(f"/studies/{sid}/discard")).status_code == 409
    # 실행 중인 회차는 지울 수 없다
    run = await runs.create_run(session, second, "act")
    assert (await client.post(f"/studies/{second}/discard")).status_code == 409
    await runs.set_run_state(session, run, status="failed")
    # 가운데 회차만 지워지고 나머지 회차와 기록은 그대로다
    out = (await client.post(f"/studies/{second}/discard")).json()
    assert out == {"deleted": second, "root_study_id": sid}
    left = [
        (r["revision"], r["study_id"])
        for r in (await client.get(f"/studies/{sid}/revisions")).json()
    ]
    assert sorted(x[1] for x in left) == sorted([sid, third])
    assert (await client.get(f"/studies/{second}")).status_code == 404
    assert (await client.get(f"/studies/{sid}")).status_code == 200
    # 휴지통에 있으면 거절하고, 다른 계정은 접근할 수 없다
    assert (await manage(client, sid, "trash")).status_code == 200
    assert (await client.post(f"/studies/{third}/discard")).status_code == 409
