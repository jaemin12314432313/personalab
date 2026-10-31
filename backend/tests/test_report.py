"""services/report.py: act_logs 줄들을 events·path·end 로 묶는 규칙. DB 없이 돈다.

로그 모양은 services/act/loop.py 가 만드는 것 그대로다 (click/abandon 은 턴마다,
complete/stop 은 끝날 때 한 줄).
"""

from types import SimpleNamespace

from app.core.config import ACT_ABANDON, ACT_CLICK, ACT_COMPLETE, ACT_STOP, PARTICIPANT_AI
from app.services.report import build_act, build_results, display_id


def row(turn, screen, action, target=None, drop=None, reason="이유", ptype=PARTICIPANT_AI, pid=1):
    return SimpleNamespace(
        turn=turn,
        screen_id=screen,
        action=action,
        target=target,
        drop_reason=drop,
        reason=reason,
        participant_type=ptype,
        participant_id=pid,
    )


def test_complete_path_and_destinations():
    act = build_act(
        [
            row(0, "S01", ACT_CLICK, "시작하기"),
            row(1, "S02", ACT_CLICK, "다음"),
            row(1, "S03", ACT_COMPLETE, reason=None),
        ]
    )
    assert act.path == ["S01", "S02", "S03"]
    assert [(e.turn, e.screen, e.to) for e in act.events] == [(1, "S01", "S02"), (2, "S02", "S03")]
    assert (act.end.result, act.end.screen, act.end.drop_reason) == ("complete", "S03", None)


def test_abandon_ends_at_that_screen():
    act = build_act(
        [
            row(0, "S01", ACT_CLICK, "시작하기"),
            row(1, "S02", ACT_ABANDON, drop="PRIVACY", reason="개인정보가 부담돼요"),
        ]
    )
    assert act.path == ["S01", "S02"]
    assert act.events[0].to == "S02"
    assert act.events[1].action == "abandon" and act.events[1].to is None
    assert (act.end.result, act.end.screen, act.end.drop_reason) == ("drop", "S02", "PRIVACY")


def test_revisit_stops_with_navigation_lost():
    act = build_act(
        [
            row(0, "S01", ACT_CLICK, "시작하기"),
            row(1, "S02", ACT_CLICK, "뒤로"),
            row(1, "S01", ACT_STOP, drop="NAVIGATION_LOST", reason=None),
        ]
    )
    assert act.path == ["S01", "S02", "S01"]
    assert [e.to for e in act.events] == ["S02", "S01"]
    assert (act.end.result, act.end.drop_reason) == ("drop", "NAVIGATION_LOST")


def test_turn_limit_keeps_max_turns_code():
    act = build_act(
        [row(0, "S01", ACT_CLICK, "다음"), row(1, "S02", ACT_STOP, drop="MAX_TURNS", reason=None)]
    )
    assert act.end.drop_reason == "MAX_TURNS"
    assert act.path == ["S01", "S02"]


def test_unfinished_log_is_none():
    assert build_act([]) is None
    assert build_act([row(0, "S01", ACT_CLICK, "시작하기")]) is None


def persona(pid, attrs=None):
    return SimpleNamespace(id=pid, attributes_json=attrs or {})


def test_display_id_prefers_given_name_then_db_number():
    assert display_id(persona(7, {"persona_id": "P938"})) == "P938"
    assert display_id(persona(7)) == "P007"


def test_results_follow_panel_order_and_fill_missing_sides_with_none():
    ask = SimpleNamespace(
        persona_id=2,
        response_json={
            "usage_intention": 3,
            "willingness_to_pay": 0,
            "concern": "PRIVACY",
            "needed_features": ["자동 정리"],
            "unneeded_features": [],
        },
    )
    acts = [
        row(0, "S01", ACT_CLICK, "시작하기", pid=1),
        row(0, "S02", ACT_COMPLETE, pid=1),
        row(0, "S01", ACT_CLICK, "시작하기", pid=2, ptype="real"),  # 실제 참가자는 섞이지 않는다
    ]
    results = build_results([persona(1), persona(2)], [ask], acts)

    assert [r.id for r in results] == [1, 2]
    assert results[0].ask is None and results[0].act.end.result == "complete"
    assert results[1].ask.usage_intention == 3 and results[1].ask.reason == ""
    assert results[1].act is None
