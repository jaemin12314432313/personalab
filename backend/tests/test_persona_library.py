"""실제 DB 트랜잭션에서 중복·롤백·스냅샷·접근 제어를 검증한다."""

import json
from copy import deepcopy
from pathlib import Path

import pandas as pd
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.api.deps import current_user_id
from app.core.db import get_session
from app.main import app
from app.models import Persona, Run, Study, User
from app.models.persona_library import PersonaLibraryPanel
from app.repositories import persona_library as repo
from app.services.persona.library_import import import_prepared, prepare_directory

COMMIT = "a" * 40


def fixture_panel(tmp_path):
    directory = Path(tmp_path)
    path = directory / "panel_test_n2_seed42.parquet"
    rows = []
    viewer_rows = []
    for i in range(2):
        age = 20 + i
        card = f"{age}세 남자 대학생이고 서울 지역에 산다.\n새 앱은 몇 번 써 보면 익숙해진다."
        row = {
            "persona_id": f"P{i + 1:03}",
            "uuid": f"00000000-0000-0000-0000-{i + 1:012}",
            "age": age,
            "sex": "남",
            "province": "서울",
            "occupation": "무직",
            "school": "대졸",
            "region3": "수도권",
            "job_group": "학생",
            "student_inferred": True,
            "donor_pid": 10 + i,
            "ps_grade": "중간",
            "da_grade": "중간",
            "ns_grade": "낮음",
            "privacy_concern": 3,
            "ott_payment": "미이용",
            "match_level": 1,
            "card_text": card,
        }
        rows.append(row)
        viewer_rows.append(
            {
                "persona_id": row["persona_id"],
                "age": age,
                "sex": "남",
                "card": {
                    "head": card.splitlines()[:1],
                    "story": [],
                    "behavior": card.splitlines()[1:],
                },
            }
        )
    frame = pd.DataFrame(rows)
    frame.to_parquet(path, index=False)
    frame.to_csv(path.with_suffix(".csv"), index=False)
    path.with_name(path.stem + "_report.json").write_text(
        json.dumps(
            {
                "report": {"n": 2, "seed": 42, "scoring_version": "test"},
                "checks": {"duplicate_cards": {"ok": True}},
            }
        ),
        encoding="utf-8",
    )
    (directory / "viewer.html").write_text(
        "const DATA = "
        + json.dumps({path.stem: {"n": 2, "rows": viewer_rows}}, ensure_ascii=False)
        + ";",
        encoding="utf-8",
    )
    return path


def test_parquet_csv_viewer_are_checked_before_import(tmp_path):
    path = fixture_panel(tmp_path)
    panels = prepare_directory(path.parent, COMMIT, 2)
    assert len(panels[0]["entries"]) == 2
    assert panels[0]["entries"][0]["attributes_json"]["source"]["donor_pid"] == 10
    frame = pd.read_csv(path.with_suffix(".csv"))
    frame.loc[0, "card_text"] = "다른 사람의 카드"
    frame.to_csv(path.with_suffix(".csv"), index=False)
    with pytest.raises(ValueError, match="CSV"):
        prepare_directory(path.parent, COMMIT, 2)


def test_viewer_mismatch_and_duplicate_ids_are_rejected(tmp_path):
    path = fixture_panel(tmp_path)
    viewer = path.parent / "viewer.html"
    viewer.write_text(viewer.read_text(encoding="utf-8").replace("20세", "99세"), encoding="utf-8")
    with pytest.raises(ValueError, match="카드 문구"):
        prepare_directory(path.parent, COMMIT, 2)
    fixture_panel(tmp_path)
    frame = pd.read_parquet(path)
    frame.loc[1, "persona_id"] = frame.loc[0, "persona_id"]
    frame.to_parquet(path, index=False)
    with pytest.raises(ValueError, match="중복"):
        prepare_directory(path.parent, COMMIT, 2)


async def test_same_source_is_idempotent_and_existing_changes_are_detected(session, tmp_path):
    path = fixture_panel(tmp_path)
    panels = prepare_directory(path.parent, COMMIT, 2)
    first = await import_prepared(session, panels)
    second = await import_prepared(session, panels)
    assert first[0]["created"] is True
    assert second[0]["created"] is False
    assert first[0]["panel_id"] == second[0]["panel_id"]
    assert await repo.entry_count(session, first[0]["panel_id"]) == 2
    changed = deepcopy(panels)
    changed[0]["entries"][0]["profile_hash"] = "b" * 64
    with pytest.raises(ValueError, match="원본과 다릅니다"):
        await import_prepared(session, changed)


async def test_multi_panel_failure_rolls_back_entire_batch(session, tmp_path):
    path = fixture_panel(tmp_path)
    panels = prepare_directory(path.parent, COMMIT, 2)
    before = await session.scalar(select(func.count()).select_from(PersonaLibraryPanel))
    bad = deepcopy(panels[0])
    bad["panel_key"] = "panel_invalid_batch"
    bad["entries"][1]["source_persona_id"] = bad["entries"][0]["source_persona_id"]
    with pytest.raises(IntegrityError):
        async with session.begin_nested():
            await import_prepared(session, panels + [bad])
    after = await session.scalar(select(func.count()).select_from(PersonaLibraryPanel))
    assert after == before


async def test_catalog_auth_ownership_pagination_and_run_snapshot(session, tmp_path):
    path = fixture_panel(tmp_path)
    imported = await import_prepared(session, prepare_directory(path.parent, COMMIT, 2))
    panel_id = imported[0]["panel_id"]
    owner = User(email="library-owner@example.com")
    other = User(email="library-other@example.com")
    session.add_all([owner, other])
    await session.flush()
    study = Study(user_id=owner.id, name="보관함 테스트")
    session.add(study)
    await session.flush()
    app.dependency_overrides[get_session] = lambda: session
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
            headers={"X-Requested-With": "PersonaLab"},
        ) as client:
            assert (await client.get("/persona-library/panels")).status_code == 401
            app.dependency_overrides[current_user_id] = lambda: other.id
            payload = {"panel_id": panel_id, "n": 1, "seed": 42}
            assert (
                await client.post(f"/studies/{study.id}/panel/import", json=payload)
            ).status_code == 404
            page = await client.get(f"/persona-library/panels/{panel_id}/personas?limit=1&offset=1")
            assert page.status_code == 200 and page.json()["total"] == 2
            assert len(page.json()["items"]) == 1
            assert (
                await client.get(f"/persona-library/panels/{panel_id}/personas?limit=101")
            ).status_code == 422
            app.dependency_overrides[current_user_id] = lambda: owner.id
            response = await client.post(f"/studies/{study.id}/panel/import", json=payload)
            assert response.status_code == 200
            copied = response.json()[0]
            entry_id = copied["attributes"]["source"]["library_entry_id"]
            original = await repo.get_entry(session, entry_id)
            copied_row = await session.get(Persona, copied["id"])
            copied_row.attributes_json = {
                **copied_row.attributes_json,
                "card_text": "테스트 복사본 수정",
            }
            await session.flush()
            assert original.attributes_json["card_text"] != copied_row.attributes_json["card_text"]
            session.add(Run(study_id=study.id, mode="act", status="done"))
            await session.flush()
            refused = await client.post(f"/studies/{study.id}/panel/import", json=payload)
            assert refused.status_code == 409
            assert (await session.get(Persona, copied["id"])).attributes_json[
                "card_text"
            ] == "테스트 복사본 수정"
    finally:
        app.dependency_overrides.clear()
