"""저장된 Ask 응답·Act 로그를 페르소나별 리포트 결과로 묶는다 (계획서 10장 report).

DB 를 읽지 않는 순수 함수라 테스트가 쉽다. 읽기는 api/studies.py 가 한다.

act_logs 는 한 줄이 한 턴이다 (services/act/loop.py):
  click / abandon  턴마다 하나. screen_id 는 그 턴을 시작한 화면
  complete / stop  끝났을 때 하나. screen_id 는 도착한 화면 (complete 는 목표 화면)
이동 목적지(to)와 지나간 경로(path)는 따로 저장하지 않으므로 이 순서에서 계산한다.
"""

from collections import defaultdict
from collections.abc import Iterable

from app.core.config import (
    ACT_ABANDON,
    ACT_CLICK,
    ACT_COMPLETE,
    ACT_STOP,
    PARTICIPANT_AI,
    PERSONA_ID_PREFIX,
    PERSONA_ID_WIDTH,
    TURN_NUMBER_OFFSET,
)
from app.schemas.report import (
    ActEndOut,
    ActEventOut,
    ActResultOut,
    AskResultOut,
    PersonaResultOut,
)


def display_id(persona) -> str:
    """페르소나 데이터에 persona_id 가 있으면 그것, 없으면 DB 번호로 만든다."""
    given = persona.attributes_json.get("persona_id")
    return given or f"{PERSONA_ID_PREFIX}{persona.id:0{PERSONA_ID_WIDTH}d}"


def build_act(rows: list) -> ActResultOut | None:
    """한 페르소나의 act_logs(id 순)를 events·path·end 로. 아직 안 끝났으면 None."""
    turns = [r for r in rows if r.action in (ACT_CLICK, ACT_ABANDON)]
    last = rows[-1] if rows else None
    closing = last if last is not None and last.action in (ACT_COMPLETE, ACT_STOP) else None
    gave_up = bool(turns) and turns[-1].action == ACT_ABANDON
    if closing is None and not gave_up:
        return None

    # click 다음에 도착한 화면: 다음 턴의 화면, 마지막 click 이면 종료 화면
    arrivals = [t.screen_id for t in turns[1:]] + [closing.screen_id if closing else None]
    events = [
        ActEventOut(
            turn=t.turn + TURN_NUMBER_OFFSET,
            screen=t.screen_id,
            action=t.action,
            target=t.target,
            reason=t.reason,
            to=arrived if t.action == ACT_CLICK else None,
            drop_reason=t.drop_reason,
        )
        for t, arrived in zip(turns, arrivals, strict=True)
    ]
    path = [t.screen_id for t in turns]

    if closing is not None:
        path.append(closing.screen_id)
        result = "complete" if closing.action == ACT_COMPLETE else "drop"
        end = ActEndOut(result=result, screen=closing.screen_id, drop_reason=closing.drop_reason)
    else:
        end = ActEndOut(
            result="drop", screen=turns[-1].screen_id, drop_reason=turns[-1].drop_reason
        )
    return ActResultOut(events=events, path=path, end=end)


def build_results(
    personas: Iterable, ask_rows: Iterable, act_rows: Iterable
) -> list[PersonaResultOut]:
    """패널(personas) 순서대로, 각자의 Ask 응답과 Act 결과를 붙인다. 없는 쪽은 None."""
    asks = {r.persona_id: r.response_json for r in ask_rows}
    acts: dict[int, list] = defaultdict(list)
    for r in act_rows:
        if r.participant_type == PARTICIPANT_AI:
            acts[r.participant_id].append(r)
    return [
        PersonaResultOut(
            id=p.id,
            persona_id=display_id(p),
            ask=AskResultOut.model_validate(asks[p.id]) if p.id in asks else None,
            act=build_act(acts[p.id]) if p.id in acts else None,
        )
        for p in personas
    ]
