"""DB 제약이 계획서 규칙을 실제로 강제하는지 확인한다."""

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.models import ActLog, BenchmarkApp, BenchmarkIssue, Run, Study, User


async def _make_run(session, mode="act") -> Run:
    user = User(email="test@example.com")
    session.add(user)
    await session.flush()
    study = Study(user_id=user.id, name="테스트 스터디")
    session.add(study)
    await session.flush()
    run = Run(study_id=study.id, mode=mode)
    session.add(run)
    await session.flush()
    return run


def _log(run_id, **kw) -> ActLog:
    base = dict(
        run_id=run_id,
        participant_type="ai",
        participant_id=1,
        turn=0,
        screen_id="S01",
        action="click",
    )
    return ActLog(**(base | kw))


async def test_ai_and_real_share_act_logs(session):
    run = await _make_run(session)
    session.add_all([_log(run.id, participant_type="ai"), _log(run.id, participant_type="real")])
    await session.flush()

    rows = await session.execute(
        select(ActLog.participant_type, func.count())
        .where(ActLog.run_id == run.id)
        .group_by(ActLog.participant_type)
    )
    assert dict(rows.all()) == {"ai": 1, "real": 1}


@pytest.mark.parametrize("reason", ["TOO_MANY_STEPS", "MAX_TURNS", None])
async def test_act_log_accepts_valid_drop_reason(session, reason):
    run = await _make_run(session)
    session.add(_log(run.id, action="abandon", drop_reason=reason))
    await session.flush()


@pytest.mark.parametrize("reason", ["OTHER", "BORING", "too_many_steps"])
async def test_act_log_rejects_unknown_drop_reason(session, reason):
    run = await _make_run(session)
    session.add(_log(run.id, action="abandon", drop_reason=reason))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_act_log_rejects_unknown_participant_type(session):
    run = await _make_run(session)
    session.add(_log(run.id, participant_type="bot"))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_run_rejects_unknown_mode(session):
    with pytest.raises(IntegrityError):
        await _make_run(session, mode="survey")


async def test_benchmark_issue_allows_other_but_not_max_turns(session):
    app = BenchmarkApp(name="앱", prelaunch_info="출시 전 설명", group="calib")
    session.add(app)
    await session.flush()

    session.add(BenchmarkIssue(app_id=app.id, category="OTHER", weight=1.0, labeler_id="D3"))
    await session.flush()

    session.add(BenchmarkIssue(app_id=app.id, category="MAX_TURNS", weight=1.0, labeler_id="D3"))
    with pytest.raises(IntegrityError):
        await session.flush()


async def test_benchmark_app_rejects_unknown_group(session):
    session.add(BenchmarkApp(name="앱", prelaunch_info="설명", group="train"))
    with pytest.raises(IntegrityError):
        await session.flush()
