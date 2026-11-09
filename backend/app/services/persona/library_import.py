"""완성된 패널을 검증해서 가져온다. HTML 스크립트와 생성 엔진은 실행하지 않는다."""
import hashlib
import json
import math
import re
from pathlib import Path
from uuid import UUID

from app.repositories import persona_library as repo

REQUIRED = {"persona_id", "uuid", "age", "sex", "province", "occupation", "school", "region3",
            "job_group", "student_inferred", "donor_pid", "ps_grade", "da_grade", "ns_grade",
            "privacy_concern", "ott_payment", "match_level", "card_text"}
GRADES = {"낮음", "중간", "높음"}


def digest_json(value) -> str:
    encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False,
                         separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def clean(value):
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if hasattr(value, "item"):
        return clean(value.item())
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return value


def read_viewer(path: Path) -> dict:
    text = path.read_text(encoding="utf-8-sig")
    match = re.search(r"\bconst\s+DATA\s*=\s*", text)
    if not match:
        raise ValueError("뷰어에 DATA JSON이 없습니다.")
    data, _ = json.JSONDecoder().raw_decode(text[match.end():])
    if not isinstance(data, dict):
        raise ValueError("실제 카드 데이터가 없는 뷰어입니다.")
    return data


def prepare_panel(path: Path, source_commit: str, viewer: dict | None = None) -> dict:
    import pandas as pd

    if not re.fullmatch(r"[a-f0-9]{40}", source_commit):
        raise ValueError("원본 Git 커밋은 40자리 해시여야 합니다.")
    report_path = path.with_name(path.stem + "_report.json")
    report_file = json.loads(report_path.read_text(encoding="utf-8"))
    report = report_file["report"]
    frame = pd.read_parquet(path)
    missing = REQUIRED - set(frame.columns)
    if missing:
        raise ValueError(f"{path.name}: 필수 열 누락 {sorted(missing)}")
    if frame.empty or len(frame) != report["n"]:
        raise ValueError(f"{path.name}: 보고서와 카드 수가 다릅니다.")
    if not frame.persona_id.is_unique or not frame.uuid.is_unique:
        raise ValueError(f"{path.name}: 패널 안에서 ID 또는 UUID가 중복됩니다.")
    csv_path = path.with_suffix(".csv")
    if csv_path.exists():
        csv_frame = pd.read_csv(csv_path, dtype={"persona_id": str, "uuid": str})
        for column in ("persona_id", "uuid", "card_text"):
            if list(csv_frame[column]) != list(frame[column]):
                raise ValueError(f"{path.name}: CSV와 Parquet의 {column} 내용이 다릅니다.")
    version = hashlib.sha256(path.read_bytes() + report_path.read_bytes()).hexdigest()
    viewer_rows = {}
    if viewer is not None:
        viewed = viewer.get(path.stem)
        if not isinstance(viewed, dict) or viewed.get("n") != len(frame):
            raise ValueError(f"{path.name}: 뷰어 패널 수가 원본과 다릅니다.")
        rows = viewed.get("rows", [])
        viewer_rows = {str(row["persona_id"]): row for row in rows}
        if len(rows) != len(frame) or len(viewer_rows) != len(frame):
            raise ValueError(f"{path.name}: 뷰어의 ID 또는 행 수가 잘못됐습니다.")
    entries = []
    for raw_row in frame.to_dict("records"):
        row = clean(raw_row)
        pid = str(row["persona_id"])
        if not pid or len(pid) > 50:
            raise ValueError("페르소나 표시 ID가 잘못됐습니다.")
        UUID(str(row["uuid"]))
        age = int(row["age"])
        if age < 19 or age > 120 or row["sex"] not in {"남", "여"}:
            raise ValueError(f"{pid}: 나이 또는 성별 값이 잘못됐습니다.")
        if any(row[key] not in GRADES for key in ("ps_grade", "da_grade", "ns_grade")):
            raise ValueError(f"{pid}: 등급 값이 잘못됐습니다.")
        privacy = int(row["privacy_concern"])
        if privacy not in range(1, 6) or int(row["match_level"]) not in range(1, 5):
            raise ValueError(f"{pid}: 개인정보 민감도 또는 매칭 수준이 잘못됐습니다.")
        card = row["card_text"]
        if not isinstance(card, str) or not card.strip() or f"{age}세" not in card.splitlines()[0]:
            raise ValueError(f"{pid}: 카드 문구와 프로필이 맞지 않습니다.")
        if viewer is not None:
            viewed = viewer_rows.get(pid)
            if viewed is None or int(viewed["age"]) != age or viewed["sex"] != row["sex"]:
                raise ValueError(f"{pid}: 뷰어와 프로필이 다릅니다.")
            parts = viewed["card"]
            viewer_card = "\n".join(parts["head"] + parts["story"] + parts["behavior"])
            if viewer_card != card:
                raise ValueError(f"{pid}: 뷰어와 카드 문구가 다릅니다.")
        attributes = {
            "profile": {"age": age, "sex": row["sex"], "region": row["province"],
                        "region3": row["region3"], "job_group": row["job_group"],
                        "school": row["school"], "occupation": row["occupation"],
                        "education_level": row.get("education_level"),
                        "marital": row.get("marital")},
            "card_text": card,
            "traits": {"price": row["ps_grade"], "digital": row["da_grade"],
                       "novelty": row["ns_grade"], "privacy": privacy, "ott": row["ott_payment"]},
            "source": {"persona_id": pid, "nvidia_uuid": str(row["uuid"]),
                       "donor_pid": int(row["donor_pid"]), "match_level": int(row["match_level"]),
                       "student_inferred": bool(row["student_inferred"]),
                       "scoring_version": report["scoring_version"], "seed": int(report["seed"]),
                       "panel_key": path.stem, "panel_version": version,
                       "source_commit": source_commit, "kind": "imported_matched_panel"},
            "original_row": row,
        }
        entries.append({"source_persona_id": pid, "profile_hash": digest_json(attributes),
                        "attributes_json": attributes})
    return {"panel_key": path.stem, "version_hash": version, "source_commit": source_commit,
            "metadata": {"report": report, "checks": report_file["checks"], "count": len(entries),
                         "file": path.name, "viewer_verified": viewer is not None,
                         "csv_verified": csv_path.exists(), "scope": "team_reference"},
            "entries": entries}


def prepare_directory(directory: Path, source_commit: str, expected_total: int = 400):
    files = sorted(directory.glob("panel_*.parquet"))
    if not files:
        raise ValueError("가져올 Parquet 패널이 없습니다.")
    viewer = read_viewer(directory / "viewer.html")
    panels = [prepare_panel(path, source_commit, viewer) for path in files]
    total = sum(len(p["entries"]) for p in panels)
    if total != expected_total:
        raise ValueError(f"예상 {expected_total}명과 실제 {total}명이 다릅니다.")
    if set(viewer) != {p["panel_key"] for p in panels}:
        raise ValueError("뷰어와 파일의 패널 목록이 다릅니다.")
    return panels


async def import_prepared(session, panels):
    summary = []
    for panel in panels:
        panel_id, created = await repo.store_panel(session, panel)
        summary.append({"panel_id": panel_id, "panel_key": panel["panel_key"],
                        "count": len(panel["entries"]), "created": created,
                        "version_hash": panel["version_hash"]})
    return summary
