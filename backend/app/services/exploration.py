"""단일 프로세스용, DB 체크포인트가 있는 모델 없는 구조 탐색 실행기."""

import asyncio
from time import monotonic
from uuid import uuid4

from app.core import config as c
from app.core.db import SessionLocal
from app.repositories import exploration as repo
from app.services import snapshots

_tasks = {}
_stops = {}
_stop_reasons = {}
_slots = asyncio.Semaphore(c.EXPLORATION_CONCURRENCY)


def budget():
    return {
        "states": c.SNAPSHOT_PAGE_STEP,
        "attempts": c.EXPLORATION_ATTEMPT_STEP,
        "clicks": c.EXPLORATION_CLICK_STEP,
        "seconds": c.SNAPSHOT_TIME_STEP,
        "pages": c.SNAPSHOT_PAGE_STEP,
    }


def extend(value):
    caps = {
        "states": c.EXPLORATION_MAX_STATES,
        "attempts": c.EXPLORATION_MAX_ATTEMPTS,
        "clicks": c.EXPLORATION_MAX_CLICKS,
        "seconds": c.EXPLORATION_MAX_SECONDS,
        "pages": c.EXPLORATION_MAX_DISCOVERED,
    }
    new = {k: min(caps[k], value.get(k, 0) + v) for k, v in budget().items()}
    if new == value:
        raise ValueError("전체 탐색 상한에 도달했습니다. 다른 시작 주소로 범위를 나누어 주세요.")
    return new


def new_job():
    return {
        "id": uuid4().hex,
        "status": "queued",
        "mode": "snapshot",
        "phase": "pages",
        "version": 1,
        "budget": budget(),
        "elapsed_seconds": 0,
        "created_at": repo.now(),
        "updated_at": repo.now(),
        "states": 0,
        "pending_actions": 0,
        "pages_found": 0,
        "pages_checked": 0,
        "pages_failed": 0,
        "attempts": 0,
        "clicks": 0,
    }


async def _run_job(study_id, job_id, session_factory):
    token = uuid4().hex
    stop = _stops.setdefault(job_id, asyncio.Event())
    async with _slots:
        if stop.is_set():
            return
        async with session_factory() as session:
            source = await repo.claim(session, study_id, job_id, token)
        if not source:
            return
        job = source["exploration"]
        previous = job.get("elapsed_seconds", 0)
        started = monotonic()
        bounds = job["budget"]
        current_map = None

        def elapsed():
            return round(previous + monotonic() - started, 2)

        async def paused():
            if stop.is_set():
                return True
            async with session_factory() as session:
                meta = await repo.job_status(session, study_id)
            return (
                meta.get("id") != job_id
                or meta.get("status") not in ("running",)
                or meta.get("worker_token") != token
            )

        async def save(**values):
            fields = {"elapsed_seconds": elapsed(), **values.pop("fields", {})}
            async with session_factory() as session:
                accepted = await repo.update(
                    session, study_id, job_id, token, fields=fields, **values
                )
            if not accepted:
                stop.set()

        async def pages_progress(result):
            nonlocal current_map
            current_map = result
            await save(site_map=result, fields={"phase": "pages"})

        try:
            remaining = max(0.1, min(c.SNAPSHOT_TIME_STEP, bounds["seconds"] - previous))
            current_map = await snapshots.collect(
                source,
                source.get("viewport", "desktop"),
                checkpoint=source.get("site_map"),
                on_progress=pages_progress,
                should_pause=paused,
                max_pages=bounds["pages"],
                timeout=remaining,
            )
            if await paused() or current_map.get("paused"):
                status = "paused"
                reason = _stop_reasons.get(job_id, "user_pause")
            elif not any(p.get("image") for p in current_map["pages"]):
                status = "failed"
                reason = "capture_unavailable"
            else:
                status = "done"
                reason = "snapshot_ready"
            await save(
                site_map=current_map,
                fields={
                    "status": status,
                    "reason": reason,
                    "phase": "complete",
                    "error": current_map.get("error"),
                },
            )
        except asyncio.CancelledError:
            await save(fields={"status": "paused", "reason": "server_restart"})
            raise
        except Exception:
            await save(
                fields={
                    "status": "failed",
                    "reason": "worker_error",
                    "error": (
                        "구조 탐색이 중단됐어요. 저장한 기록을 보존했으며 이어서 탐색할 수 있어요."
                    ),
                }
            )
        finally:
            _stops.pop(job_id, None)
            _stop_reasons.pop(job_id, None)


async def run_job(study_id, job_id, session_factory=SessionLocal):
    try:
        return await _run_job(study_id, job_id, session_factory)
    finally:
        _stops.pop(job_id, None)
        _stop_reasons.pop(job_id, None)


async def launch(study_id, job_id):
    key = (study_id, job_id)
    if key in _tasks and not _tasks[key].done():
        return
    task = asyncio.create_task(run_job(study_id, job_id))
    _tasks[key] = task

    def completed(done):
        if _tasks.get(key) is done:
            _tasks.pop(key, None)
        if not done.cancelled():
            done.exception()

    task.add_done_callback(completed)


def request_pause(job_id):
    if job_id in _stops:
        _stop_reasons[job_id] = "user_pause"
        _stops[job_id].set()


async def shutdown():
    for job_id, event in _stops.items():
        _stop_reasons[job_id] = "server_restart"
        event.set()
    tasks = list(_tasks.values())
    if tasks:
        done, pending = await asyncio.wait(tasks, timeout=c.BROWSER_TIMEOUT_MS / 1000)
        for task in pending:
            task.cancel()
        if pending:
            await asyncio.gather(*pending, return_exceptions=True)


def blocking_reason(source, scope):
    if source.get("kind") not in ("web", "html"):
        return None
    if source.get("inspection", {}).get("capture_ready") is False:
        return "시작 화면이 아직 로딩 중입니다. 캡처를 다시 확인하세요."
    job = source.get("exploration")
    if not job:
        return None
    if job["status"] in ("queued", "running", "pausing"):
        return "구조 탐색이 진행 중입니다. 완료한 뒤 다음 단계로 이동하세요."
    if (
        job["status"] in ("paused", "limited", "failed")
        and scope.get("reviewed_exploration_id") != job["id"]
    ):
        return "미확인 범위를 살펴본 뒤 이어서 탐색하거나, 확인한 범위로 진행을 선택하세요."
    return None
