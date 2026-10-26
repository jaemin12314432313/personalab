"""리포트 응답 (계획서 10장 GET /studies/{id}/report).

필드 이름과 모양은 프론트가 이미 쓰는 타입(frontend/src/types.ts 의 AskResult, ActResult,
ActEvent)에 맞췄다. 프론트는 가짜 엔진 대신 이 응답으로 바꾸기만 하면 된다.
실제 참가자 칸은 아직 없다. 참가자 뷰(6단계)가 생기면 필드를 더한다.
"""

from typing import Literal

from pydantic import BaseModel


class AskResultOut(BaseModel):
    usage_intention: int
    willingness_to_pay: int
    concern: str
    needed_features: list[str] = []
    unneeded_features: list[str] = []
    reason: str = ""


class ActEventOut(BaseModel):
    turn: int  # 1부터. act_logs.turn 은 0부터라 +1 한다
    screen: str
    action: Literal["click", "abandon"]
    target: str | None = None
    reason: str | None = None
    to: str | None = None  # click 일 때 이동한 화면
    drop_reason: str | None = None


class ActEndOut(BaseModel):
    result: Literal["complete", "drop"]
    screen: str | None = None
    drop_reason: str | None = None  # 8개 카테고리 또는 MAX_TURNS


class ActResultOut(BaseModel):
    events: list[ActEventOut]
    path: list[str]  # 지나간 화면 순서
    end: ActEndOut


class PersonaResultOut(BaseModel):
    id: int  # personas.id. 패널 생성 응답(PersonaOut.id)과 맞출 때 쓴다
    persona_id: str  # 화면에 보이는 이름 (P938)
    ask: AskResultOut | None = None  # 아직 Ask 를 돌리지 않았으면 None
    act: ActResultOut | None = None


class ReportOut(BaseModel):
    study_id: int
    ask_run_id: int | None = None  # 가장 최근에 끝난 실행
    act_run_id: int | None = None
    results: list[PersonaResultOut]
