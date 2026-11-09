"""기존 workflow JSON의 구조 탐색 작업. 브라우저 체크포인트는 공개하지 않는다."""

from copy import deepcopy
from datetime import UTC, datetime

from sqlalchemy import case, select

from app.models import Study, StudyWorkflow
from app.repositories import workflow, workspace

ACTIVE = {"queued", "running", "pausing"}


def now():
    return datetime.now(UTC).isoformat()


def public_source(source):
    result = {k: deepcopy(v) for k, v in source.items() if k != "files" and not k.startswith("_")}
    if "exploration" in result:
        result["exploration"] = public_job(result["exploration"])
    return result


def public_job(job):
    return {k: deepcopy(v) for k, v in job.items() if k != "worker_token"}


async def snapshot(session, study_id):
    row = await session.scalar(
        select(StudyWorkflow)
        .where(StudyWorkflow.study_id == study_id)
        .execution_options(populate_existing=True)
    )
    return deepcopy(row.source_json) if row else {}


async def job_status(session, study_id):
    return (
        await session.scalar(
            select(StudyWorkflow.source_json["exploration"]).where(
                StudyWorkflow.study_id == study_id
            )
        )
        or {}
    )


async def progress(session, study_id, version):
    source = StudyWorkflow.source_json
    job = source["exploration"]
    changed = job["version"].as_integer() != version
    row = (
        await session.execute(
            select(
                job,
                case((changed, source["preflight"]), else_=None),
                case((changed, source["site_map"]), else_=None),
            ).where(StudyWorkflow.study_id == study_id)
        )
    ).one_or_none()
    if row is None or row[0] is None:
        return None, None
    job, preflight, site_map = row
    return public_job(job), (
        {
            **({"preflight": preflight} if preflight is not None else {}),
            **({"site_map": site_map} if site_map is not None else {}),
        }
        if job.get("version") != version
        else None
    )


async def locked(session, study_id):
    study = await session.scalar(select(Study).where(Study.id == study_id).with_for_update())
    if study is None:
        return None
    return await session.scalar(
        select(StudyWorkflow)
        .where(StudyWorkflow.study_id == study_id)
        .execution_options(populate_existing=True)
    )


async def request(session, study_id, action, new_job, extend, expected_job=None):
    row = await locked(session, study_id)
    if row is None or row.source_json.get("kind") not in ("web", "html"):
        raise ValueError("웹 또는 HTML 화면을 먼저 연결하세요.")
    if await workflow.runs(session, study_id):
        raise ValueError("실행된 회차의 연결 자료는 변경할 수 없습니다. 수정 회차를 만드세요.")
    source = deepcopy(row.source_json)
    job = source.get("exploration")
    if expected_job and (not job or job.get("id") != expected_job):
        raise ValueError("저장된 연결이 바뀌었어요. 주소를 다시 연결해 최신 탐색을 시작하세요.")
    if action == "pause":
        if job and job["status"] in ACTIVE:
            job["status"] = "paused" if job["status"] == "queued" else "pausing"
            job["reason"] = "user_pause"
    elif job and job["status"] in ACTIVE:
        pass
    elif action == "resume" and job and job.get("mode") != "snapshot":
        # 사용자가 명시적으로 이어갈 때만 예전 조작 탐색을 새 이미지 수집으로 바꾼다.
        job = new_job()
        source.pop("_exploration_checkpoint", None)
        source.pop("preflight", None)
        source.pop("site_map", None)
    elif action == "resume" and job:
        remaining = any(
            p["state"] == "pending" for p in source.get("site_map", {}).get("pages", [])
        )
        if job["status"] == "done" and not remaining:
            raise ValueError(
                "발견한 주소의 이미지 수집을 마쳤습니다. 다시 수집하려면 새로 시작하세요."
            )
        exhausted = any(
            job.get(metric, 0) >= job["budget"][limit]
            for metric, limit in [
                ("states", "states"),
                ("attempts", "attempts"),
                ("clicks", "clicks"),
                ("elapsed_seconds", "seconds"),
            ]
        )
        if (
            job["status"] == "done"
            or exhausted
            or job["status"] == "limited"
            and job.get("reason") != "unconfirmed_paths"
        ):
            increased = extend(job["budget"])
            if any(
                job.get(metric, 0) >= increased[limit]
                for metric, limit in [
                    ("states", "states"),
                    ("attempts", "attempts"),
                    ("clicks", "clicks"),
                    ("elapsed_seconds", "seconds"),
                ]
            ):
                raise ValueError(
                    "전체 탐색 상한에 도달했습니다. 다른 시작 주소로 범위를 나누어 주세요."
                )
            job["budget"] = increased
        job.update(status="queued", reason=None, error=None)
        job.pop("worker_token", None)
    else:
        job = new_job()
        source.pop("_exploration_checkpoint", None)
        source.pop("preflight", None)
        source.pop("site_map", None)
    if job:
        job["version"] = job.get("version", 0) + 1
        job["updated_at"] = now()
        source["exploration"] = job
        row.source_json = source
    await session.commit()
    return deepcopy(source)


async def claim(session, study_id, job_id, token):
    row = await locked(session, study_id)
    if row is None:
        return None
    source = deepcopy(row.source_json)
    job = source.get("exploration", {})
    if job.get("id") != job_id or job.get("status") != "queued":
        await session.rollback()
        return None
    if await workflow.runs(session, study_id) or await workspace.is_trashed(session, study_id):
        job.update(status="paused", reason="inputs_locked", updated_at=now())
        source["exploration"] = job
        row.source_json = source
        await session.commit()
        return None
    job.update(status="running", worker_token=token, updated_at=now())
    job["version"] += 1
    source["exploration"] = job
    row.source_json = source
    await session.commit()
    return source


async def update(
    session, study_id, job_id, token, *, preflight=None, checkpoint=None, site_map=None, fields=None
):
    row = await locked(session, study_id)
    if row is None:
        return False
    source = deepcopy(row.source_json)
    job = source.get("exploration", {})
    if (
        job.get("id") != job_id
        or job.get("worker_token") != token
        or job.get("status") not in ("running", "pausing")
    ):
        await session.rollback()
        return False
    if await workflow.runs(session, study_id) or await workspace.is_trashed(session, study_id):
        job.update(status="paused", reason="inputs_locked", updated_at=now())
        job["version"] += 1
        source["exploration"] = job
        row.source_json = source
        await session.commit()
        return False
    pause_requested = job["status"] == "pausing"
    if preflight is not None:
        source["preflight"] = deepcopy(preflight)
    if checkpoint is not None:
        source["_exploration_checkpoint"] = deepcopy(checkpoint)
    if site_map is not None:
        source["site_map"] = deepcopy(site_map)
    if fields:
        job.update(fields)
    if pause_requested and job.get("status") == "running":
        job["status"] = "pausing"
    pf = source.get("preflight", {})
    sm = source.get("site_map", {})
    image_mode = job.get("mode") == "snapshot"
    job.update(
        states=sum(bool(p.get("image")) for p in sm.get("pages", []))
        if image_mode
        else len(pf.get("states", [])),
        pending_actions=0 if image_mode else pf.get("pending_actions", 0),
        attempts=0 if image_mode else pf.get("attempts", 0),
        clicks=0 if image_mode else pf.get("clicks", 0),
        pages_found=len(sm.get("pages", [])),
        pages_checked=sum(p["state"] == "loaded" for p in sm.get("pages", [])),
        pages_failed=sum(p["state"] == "error" for p in sm.get("pages", [])),
        updated_at=now(),
        version=job["version"] + 1,
    )
    source["exploration"] = job
    row.source_json = source
    await session.commit()
    return True


async def interrupted(session):
    rows = list(
        await session.scalars(
            select(StudyWorkflow)
            .where(StudyWorkflow.source_json["exploration"]["status"].astext.in_(ACTIVE))
            .with_for_update()
        )
    )
    for row in rows:
        source = deepcopy(row.source_json)
        job = source["exploration"]
        job.update(
            status="paused",
            reason="server_restart",
            updated_at=now(),
            version=job.get("version", 0) + 1,
        )
        job.pop("worker_token", None)
        row.source_json = source
    await session.commit()
    return len(rows)
