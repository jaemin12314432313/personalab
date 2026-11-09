import pytest
from httpx import ASGITransport, AsyncClient

from app.core.db import get_session
from app.main import app
from app.models import PersonaLibraryEntry, PersonaLibraryPanel
from app.repositories import run as runs
from app.repositories import workflow


@pytest.fixture
async def setup(session):
    panel = PersonaLibraryPanel(
        panel_key="audience-fixture",
        version_hash="audience-test",
        source_commit="test",
        metadata_json={},
    )
    session.add(panel)
    await session.flush()
    entries = []
    for index, (age, job, region, digital, donor) in enumerate(
        [
            (26, "연구직", "제주", "높음", 900001),
            (43, "연구직", "제주", "낮음", 900002),
            (29, "연구직", "제주", "높음", 900001),
            (64, "자영업", "부산", "중간", 900003),
        ]
    ):
        e = PersonaLibraryEntry(
            panel_id=panel.id,
            source_persona_id=f"A{index}",
            profile_hash=f"audience-{index}",
            attributes_json={
                "profile": {"age": age, "job_group": job, "region": region},
                "card_text": f"테스트전용키워드 {age}세, 예약 화면을 살펴본다.",
                "traits": {"digital": digital},
                "source": {"persona_id": f"A{index}", "donor_pid": donor},
            },
        )
        session.add(e)
        entries.append(e)
    await session.flush()
    app.dependency_overrides[get_session] = lambda: session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"X-Requested-With": "PersonaLab"},
        ) as c:
            await c.post(
                "/auth/register", json={"email": "audience-fixture@example.com", "password": "1234"}
            )
            sid = (await c.post("/studies", json={"name": "앱 사용자 테스트"})).json()["id"]
            yield c, sid, entries
    finally:
        app.dependency_overrides.clear()


async def test_search_uses_real_fields_all_panels_and_deduplicates(setup):
    c, sid, entries = setup
    f = {
        "query": "테스트전용키워드",
        "age_min": 20,
        "age_max": 45,
        "jobs": ["연구직"],
        "regions": ["제주"],
    }
    r = await c.post("/persona-library/audience/search", json={"filters": f})
    assert r.status_code == 200 and r.json()["total"] == 2 and r.json()["duplicates_excluded"] == 1
    f["digital"] = ["낮음"]
    assert (await c.post("/persona-library/audience/search", json={"filters": f})).json()["items"][
        0
    ]["id"] == entries[1].id
    f["jobs"] = ["보유하지 않은 직무"]
    assert (await c.post("/persona-library/audience/search", json={"filters": f})).json()[
        "total"
    ] == 0
    assert (
        await c.post(
            "/persona-library/audience/search", json={"filters": {"age_min": 60, "age_max": 20}}
        )
    ).status_code == 422


async def test_selection_persists_exact_cards_context_and_revision(setup, session):
    c, sid, entries = setup
    audience = {
        "description": "예약을 이용하는 연구원",
        "context": "이동 중 한 손으로 사용",
        "filters": {"query": "테스트전용키워드"},
        "entry_ids": [entries[0].id, entries[1].id],
    }
    r = await c.post(f"/studies/{sid}/panel/select", json={"audience": audience})
    assert (
        r.status_code == 200
        and [p["attributes"]["source"]["library_entry_id"] for p in r.json()]
        == audience["entry_ids"]
    )
    w = (await c.get(f"/studies/{sid}/workflow")).json()
    assert w["scope"]["audience"]["description"] == audience["description"]
    w["scope"]["product_kind"] = "ios"
    assert (await c.post(f"/studies/{sid}/workflow", json={"scope": w["scope"]})).json()["scope"][
        "viewport"
    ] == "mobile"
    child = (await c.post(f"/studies/{sid}/revisions", json={})).json()["id"]
    copied = (await c.get(f"/studies/{child}/workflow")).json()["scope"]
    assert (
        copied["product_kind"] == "ios" and copied["audience"]["entry_ids"] == audience["entry_ids"]
    )


async def test_bad_selection_does_not_replace_existing_and_locked_run_denies(setup, session):
    c, sid, entries = setup

    def body(ids, filters={}):
        return {"audience": {"entry_ids": ids, "filters": filters}}

    assert (
        await c.post(f"/studies/{sid}/panel/select", json=body([entries[0].id]))
    ).status_code == 200
    for ids, filters in [
        ([entries[0].id, entries[2].id], {}),
        ([entries[1].id], {"age_max": 30}),
        ([999999999], {}),
        ([], {}),
        ([entries[0].id, entries[0].id], {}),
    ]:
        assert (
            await c.post(f"/studies/{sid}/panel/select", json=body(ids, filters))
        ).status_code == 422
    assert len((await c.get(f"/studies/{sid}")).json()["personas"]) == 1
    await runs.create_run(session, sid, "act")
    assert (
        await c.post(f"/studies/{sid}/panel/select", json=body([entries[1].id]))
    ).status_code == 409


async def test_auth_ownership_trash_and_app_browser_scope(setup, session):
    c, sid, entries = setup
    await workflow.save(session, sid, source={"kind": "web", "url": "https://example.com"})
    response = await c.post(f"/studies/{sid}/workflow", json={"scope": {"product_kind": "android"}})
    assert response.status_code == 200 and response.json()["scope"]["viewport"] == "mobile"
    assert response.json()["source"]["kind"] == "web"
    await c.post(f"/studies/{sid}/manage", json={"action": "trash"})
    assert (
        await c.post(
            f"/studies/{sid}/panel/select", json={"audience": {"entry_ids": [entries[0].id]}}
        )
    ).status_code == 404
    await c.post("/auth/logout", json={})
    assert (await c.get("/persona-library/audience/facets")).status_code == 401
    await c.post("/auth/register", json={"email": "audience-other@example.com", "password": "1234"})
    assert (
        await c.post(
            f"/studies/{sid}/panel/select", json={"audience": {"entry_ids": [entries[0].id]}}
        )
    ).status_code == 404


async def test_uploaded_screen_image_is_validated_and_retained(setup):
    import base64

    c, sid, _ = setup
    image = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\nfixture").decode()
    screen = {
        "id": "S1",
        "label": "앱 첫 화면",
        "description": "가입 버튼",
        "elements": [],
        "image": image,
    }
    response = await c.post(f"/studies/{sid}/prototype/manual", json={"screens": [screen]})
    assert response.status_code == 200 and response.json()["screens"][0]["image"] == image
    for invalid in [
        "https://example.com/private.png",
        "data:image/svg+xml;base64,PHN2Zz4=",
        "data:image/png;base64,aGVsbG8=",
    ]:
        screen["image"] = invalid
        assert (
            await c.post(f"/studies/{sid}/prototype/manual", json={"screens": [screen]})
        ).status_code == 422


def test_current_uploaded_image_enters_mocked_model_only_after_permission(monkeypatch):
    import base64

    from app.core.config import settings
    from app.services.act import decide

    image = "data:image/png;base64," + base64.b64encode(b"\x89PNG\r\n\x1a\nfixture").decode()
    calls = []
    monkeypatch.setattr(settings, "llm_provider", "openai")
    monkeypatch.setattr(settings, "allow_persona_transmission", True)
    monkeypatch.setattr(
        decide,
        "call_llm",
        lambda system, contents, schema, check: calls.append(contents)
        or {
            "action": "abandon",
            "target": None,
            "drop_reason": "NAVIGATION_LOST",
            "reason": "검증용",
        },
    )
    screen = {"id": "S1", "label": "앱 시안", "elements": [], "image": image}
    decide.decide_step({"card_text": "가상 카드"}, "화면 확인", screen, [])
    assert calls[0][-1] == {"type": "input_image", "image_url": image}
    monkeypatch.setattr(settings, "allow_persona_transmission", False)
    with pytest.raises(Exception):
        decide.decide_step({"card_text": "가상 카드"}, "화면 확인", screen, [])
    assert len(calls) == 1


def test_default_candidates_do_not_repeat_only_first_age_group():
    from types import SimpleNamespace

    from app.repositories.audience import varied_order

    rows = [
        SimpleNamespace(attributes_json={"profile": {"age": age}})
        for age in [21, 22, 23, 31, 32, 41, 61]
    ]
    ordered = varied_order(rows)
    assert [r.attributes_json["profile"]["age"] for r in ordered[:4]] == [21, 31, 41, 61]
    assert len(ordered) == 7


async def test_recommendation_respects_filters_deduplicates_and_reports_shortfall(setup):
    c, sid, entries = setup
    filters = {"query": "테스트전용키워드", "jobs": ["연구직"], "regions": ["제주"]}
    r = await c.post("/persona-library/audience/recommend", json={"filters": filters, "count": 5})
    assert r.status_code == 200
    data = r.json()
    assert data["requested_count"] == 5 and data["total"] == 2 and len(data["items"]) == 2
    assert {p["id"] for p in data["items"]} == {entries[0].id, entries[1].id}
    assert all(
        "donor_pid" not in p["attributes"]["source"] and p["profile_hash"] == ""
        for p in data["items"]
    )
    filters["jobs"] = ["보유하지 않은 직무"]
    empty = (
        await c.post("/persona-library/audience/recommend", json={"filters": filters, "count": 3})
    ).json()
    assert empty["total"] == 0 and empty["items"] == []
    assert (
        await c.post("/persona-library/audience/recommend", json={"count": 0})
    ).status_code == 422
    assert (
        await c.post("/persona-library/audience/recommend", json={"count": 101})
    ).status_code == 422
    await c.post("/auth/logout", json={})
    assert (
        await c.post("/persona-library/audience/recommend", json={"count": 3})
    ).status_code == 401


async def test_recommended_selection_keeps_requested_count_and_exact_raw_snapshot(setup):
    c, sid, entries = setup
    payload = {
        "description": "예약을 이용하는 연구원",
        "requested_count": 2,
        "filters": {"query": "테스트전용키워드", "jobs": ["연구직"]},
        "entry_ids": [entries[1].id, entries[0].id],
    }
    r = await c.post(f"/studies/{sid}/panel/select", json={"audience": payload})
    assert r.status_code == 200
    saved = (await c.get(f"/studies/{sid}/workflow")).json()["scope"]["audience"]
    assert saved["requested_count"] == 2 and saved["entry_ids"] == payload["entry_ids"]
    assert "테스트전용키워드" not in r.text


def test_recommendation_varies_real_dimensions_without_modifying_candidates():
    from types import SimpleNamespace

    from app.services.audience_recommendation import recommend

    def row(age, digital, job):
        return SimpleNamespace(
            attributes_json={
                "profile": {"age": age, "job_group": job},
                "traits": {"digital": digital},
            }
        )

    rows = [
        row(21, "높음", "학생"),
        row(22, "높음", "학생"),
        row(42, "낮음", "자영업"),
        row(65, "중간", "은퇴"),
    ]
    chosen = recommend(rows, 3)
    assert chosen == [rows[0], rows[2], rows[3]]
    assert recommend(rows, 3) == chosen and len(rows) == 4
    assert recommend([], 3) == []


async def test_full_region_names_match_legacy_cards_and_persist_without_changing_raw_profile(
    setup, session
):
    from sqlalchemy import select

    from app.models import Persona

    c, sid, entries = setup
    facets = (await c.get("/persona-library/audience/facets")).json()
    assert "제주특별자치도" in facets["regions"] and "제주" not in facets["regions"]

    async def search(region):
        return (
            await c.post(
                "/persona-library/audience/search",
                json={"filters": {"query": "테스트전용키워드", "regions": [region]}},
            )
        ).json()

    old, new = await search("제주"), await search("제주특별자치도")
    assert old["total"] == new["total"] == 2
    assert {p["id"] for p in old["items"]} == {p["id"] for p in new["items"]}
    assert all(p["attributes"]["profile"]["region"] == "제주특별자치도" for p in new["items"])
    assert (
        await c.post(
            "/persona-library/audience/search",
            json={"filters": {"query": "제주특별자치도 테스트전용키워드"}},
        )
    ).json()["total"] == 2
    selected = await c.post(
        f"/studies/{sid}/panel/select",
        json={"audience": {"entry_ids": [entries[0].id], "filters": {"regions": ["제주"]}}},
    )
    assert selected.status_code == 200
    assert (await c.get(f"/studies/{sid}/workflow")).json()["scope"]["audience"]["filters"][
        "regions"
    ] == ["제주특별자치도"]
    stored = await session.scalar(select(Persona).where(Persona.study_id == sid))
    assert stored.attributes_json["profile"]["region"] == "제주"


def test_truncated_region_aliases_stay_distinct_and_public_display_keeps_raw_input_untouched():
    from copy import deepcopy
    from types import SimpleNamespace

    from app.repositories.audience import matches
    from app.schemas.audience import AudienceFilters
    from app.services.persona_display import public_attributes

    raw = {"profile": {"age": 30, "region": "전라남"}, "traits": {}, "card_text": "fixture"}
    before = deepcopy(raw)
    row = SimpleNamespace(attributes_json=raw)
    assert matches(row, AudienceFilters(regions=["전라남도"]))
    assert matches(row, AudienceFilters(regions=["전남"]))
    assert matches(row, AudienceFilters(query="전남"))
    assert not matches(row, AudienceFilters(regions=["광주광역시"]))
    assert not matches(row, AudienceFilters(regions=["전북특별자치도"]))
    assert public_attributes(raw)["profile"]["region"] == "전라남도" and raw == before
