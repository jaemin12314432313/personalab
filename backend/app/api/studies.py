"""스터디와 입력, 실행 시작 (계획서 3장 ①~⑦, 10장)."""

import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user_id
from app.core.db import get_session
from app.core.config import settings, PERSONA_TRANSMISSION_BLOCKED
from app.models import Study
from app.repositories import persona_library as library_repo
from app.schemas.persona_library import PanelImportIn
from app.repositories import workflow as workflow_repo
from app.repositories import workspace as workspace_repo
from app.schemas.workspace import WorkspaceState
from app.repositories import run as run_repo
from app.repositories import study as study_repo
from app.schemas.report import ReportOut
from app.schemas.run import RunCreate, RunOut
from app.schemas.study import (
    FigmaImportIn,
    FigmaImportOut,
    PanelGenerateIn,
    PersonaOut,
    PersonaPromptOut,
    ProductIn,
    ProductOut,
    PrototypeManualIn,
    PrototypeOut,
    QuestionOut,
    QuestionsIn,
    StudyCreate,
    StudyDetailOut,
    StudyOut,
    TaskIn,
    TaskOut,
)
from app.services.figma.importer import FigmaImportError, import_file
from app.services.act.decide import build_act_prompt
from app.services import rule_agent, runner
from app.services.persona.sample import sample_personas
from app.services.report import build_results

router = APIRouter(prefix="/studies", tags=["studies"])


async def owned_study(
    study_id: int,
    session: AsyncSession = Depends(get_session),
    user_id: int = Depends(current_user_id),
) -> Study:
    study = await study_repo.get_study(session, study_id, user_id)
    if study is None or await workspace_repo.is_trashed(session, study.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "테스트가 없습니다")
    return study


async def editable_study(study:Study=Depends(owned_study),session:AsyncSession=Depends(get_session))->Study:
    await workspace_repo.lock_group(session,study)
    if await workspace_repo.is_trashed(session,study.id):raise HTTPException(404,'테스트가 없습니다.')
    if any([await run_repo.latest_run(session,study.id,mode) for mode in ('ask','act')]):
        raise HTTPException(409,'실행 이력이 있는 테스트의 입력은 변경할 수 없습니다. 수정본 테스트를 만드세요.')
    return study


def run_launcher() -> runner.Launcher:
    """테스트에서 실행을 직접 돌릴 수 있게 의존성으로 뺀다."""
    return runner.execute_in_background


@router.post("", response_model=StudyOut, status_code=status.HTTP_201_CREATED)
async def create_study(
    body: StudyCreate,
    session: AsyncSession = Depends(get_session),
    user_id: int = Depends(current_user_id),
):
    return await study_repo.create_study(session, user_id, body.name)


@router.get("", response_model=list[StudyOut])
async def list_studies(
    session: AsyncSession = Depends(get_session), user_id: int = Depends(current_user_id), include_hidden: bool = False
):
    result=[]
    for item in await study_repo.list_studies(session,user_id):
        meta=await workflow_repo.get(session,item.id)
        management=await workspace_repo.state(session,item.id)
        if management and not include_hidden and (management.archived or management.trashed):continue
        result.append(StudyOut(workspace=WorkspaceState.model_validate(management) if management else WorkspaceState(),id=item.id,name=item.name,status=item.status,root_study_id=meta.root_study_id if meta else item.id,revision=meta.revision if meta else 1,product_id=(meta.scope_json or {}).get('product_id','') if meta else '',test_title=(meta.scope_json or {}).get('test_title','') if meta else '',round_note=(meta.scope_json or {}).get('round_note','') if meta else ''))
    return result


@router.get("/{study_id}", response_model=StudyDetailOut)
async def get_study(
    study: Study = Depends(owned_study), session: AsyncSession = Depends(get_session)
):
    product = await study_repo.get_product(session, study.id)
    prototype = await study_repo.get_prototype(session, study.id)
    task = await study_repo.get_task(session, study.id)
    personas = await study_repo.list_personas(session, study.id)
    runs = await workflow_repo.runs(session,study.id)
    management=await workspace_repo.state(session,study.id)
    return StudyDetailOut(
        workspace=WorkspaceState.model_validate(management) if management else WorkspaceState(),
        id=study.id, name=study.name, status=study.status, source=await study_repo.study_source(session,study.id),
        product=ProductOut(id=product.id, study_id=study.id, description=product.description, features=product.features_json, price=product.price) if product else None,
        prototype=PrototypeOut(id=prototype.id, study_id=study.id, figma_url=prototype.figma_url, screens=prototype.screens_json) if prototype else None,
        task=TaskOut.model_validate(task) if task else None,
        personas=[PersonaOut(id=p.id, attributes=p.attributes_json) for p in personas],
        runs=[RunOut.model_validate(run) for run in runs],
    )


@router.post("/{study_id}/name", response_model=StudyOut)
async def rename_study(body:StudyCreate,study:Study=Depends(editable_study),session:AsyncSession=Depends(get_session)):
    return await study_repo.rename_study(session,study,body.name)


@router.post("/{study_id}/product", response_model=ProductOut)
async def set_product(
    body: ProductIn,
    study: Study = Depends(editable_study),
    session: AsyncSession = Depends(get_session),
):
    p = await study_repo.set_product(session, study.id, body.description, body.features, body.price)
    return ProductOut(
        id=p.id,
        study_id=p.study_id,
        description=p.description,
        features=p.features_json,
        price=p.price,
    )


@router.post("/{study_id}/prototype", response_model=FigmaImportOut)
async def import_figma(
    body: FigmaImportIn,
    study: Study = Depends(editable_study),
    session: AsyncSession = Depends(get_session),
):
    if any([await run_repo.latest_run(session, study.id, mode) for mode in ("ask", "act")]):
        raise HTTPException(409, "실행 이력이 있는 테스트의 화면은 변경할 수 없습니다. 수정본 테스트를 만드세요.")
    try:
        screens, warnings = await import_file(body.url)
        validated = PrototypeManualIn(screens=screens)
    except FigmaImportError as error:
        raise HTTPException(error.status, str(error)) from None
    p = await study_repo.set_prototype(session, study.id, body.url, [s.model_dump() for s in validated.screens])
    await workflow_repo.save(session,study.id,source={"kind":"figma","url":body.url})
    return FigmaImportOut(id=p.id, study_id=p.study_id, figma_url=p.figma_url, screens=p.screens_json, warnings=warnings)


@router.post("/{study_id}/prototype/manual", response_model=PrototypeOut)
async def set_prototype_manual(
    body: PrototypeManualIn,
    study: Study = Depends(editable_study),
    session: AsyncSession = Depends(get_session),
):
    screens = [s.model_dump() for s in body.screens]
    p = await study_repo.set_prototype(session, study.id, None, screens)
    await workflow_repo.save(session,study.id,source={"kind":"manual"})
    return PrototypeOut(id=p.id, study_id=p.study_id, figma_url=p.figma_url, screens=p.screens_json)


@router.post("/{study_id}/task", response_model=TaskOut)
async def set_task(
    body: TaskIn, study: Study = Depends(editable_study), session: AsyncSession = Depends(get_session)
):
    proto = await study_repo.get_prototype(session, study.id)
    if proto is None:
        raise HTTPException(status.HTTP_409_CONFLICT, "프로토타입을 먼저 연결하세요")
    if body.goal_screen_id not in {s["id"] for s in proto.screens_json}:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, "목표 화면이 프로토타입에 없습니다"
        )
    return await study_repo.set_task(session, study.id, body.description, body.goal_screen_id)


@router.post("/{study_id}/questions", response_model=list[QuestionOut])
async def set_questions(
    body: QuestionsIn,
    study: Study = Depends(editable_study),
    session: AsyncSession = Depends(get_session),
):
    questions = [q.model_dump() for q in body.questions]
    return await study_repo.replace_questions(session, study.id, questions)


@router.post("/{study_id}/panel/generate", response_model=list[PersonaOut])
async def generate_panel(
    body: PanelGenerateIn,
    study: Study = Depends(editable_study),
    session: AsyncSession = Depends(get_session),
):
    try:
        attributes = await asyncio.to_thread(sample_personas, body.conditions, body.n, body.seed)
    except ValueError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, str(exc)) from exc
    except (FileNotFoundError, ImportError, RuntimeError) as exc:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "페르소나 엔진의 의존성과 원본 데이터를 준비해 주세요. 연결 상태에서 확인할 수 있습니다.",
        ) from exc
    rows = await study_repo.replace_personas(session, study.id, attributes)
    return [PersonaOut(id=p.id, attributes=p.attributes_json) for p in rows]


@router.post("/{study_id}/runs", response_model=RunOut, status_code=status.HTTP_202_ACCEPTED)
async def start_run(
    body: RunCreate,
    background: BackgroundTasks,
    study: Study = Depends(owned_study),
    session: AsyncSession = Depends(get_session),
    launch: runner.Launcher = Depends(run_launcher),
):
    # Act는 규칙 기반 엔진이면 외부 전송·모델 비용이 없으므로 전송 허용이 없어도 시작할 수 있다
    if not settings.allow_persona_transmission and not (body.mode == "act" and rule_agent.use_rule_engine()):
        raise HTTPException(status.HTTP_409_CONFLICT, PERSONA_TRANSMISSION_BLOCKED)
    await workspace_repo.lock_group(session,study)
    if await workspace_repo.is_trashed(session,study.id):raise HTTPException(404,'테스트가 없습니다.')
    if await study_repo.study_source(session,study.id)=='local-demo':
        raise HTTPException(409,'로컬 점검 테스트는 새 유료 실행을 만들 수 없습니다.')
    active=await run_repo.active_run(session,study.id)
    if active is not None:raise HTTPException(409,'이미 실행 중인 테스트입니다. 현재 실행을 확인하세요.')
    missing = await _missing_inputs(session, study.id, body.mode)
    if missing:
        raise HTTPException(status.HTTP_409_CONFLICT, f"먼저 입력하세요: {', '.join(missing)}")
    workflow=await workflow_repo.get(session,study.id)
    if workflow and workflow.source_json.get("kind") in ("web","html"):
        from app.services.exploration import blocking_reason
        if reason:=blocking_reason(workflow.source_json,workflow.scope_json):raise HTTPException(409,reason)
        if body.mode!="act":raise HTTPException(409,"웹 탐색은 Act 실행만 지원합니다.")
        if workflow.scope_json.get("exploration")=="journey" and not (workflow.scope_json.get("goal_url") or workflow.scope_json.get("goal_text")):raise HTTPException(409,"탐색할 완료 지점을 먼저 선택하세요.")
    run = await run_repo.create_run(session, study.id, body.mode)
    background.add_task(launch, run.id)
    return run


@router.get("/{study_id}/report", response_model=ReportOut)
async def get_report(
    study: Study = Depends(owned_study), session: AsyncSession = Depends(get_session)
):
    """가장 최근에 끝난 Ask·Act 실행을 페르소나별로 묶어 돌려준다. 실행이 없으면 빈 칸(None)."""
    ask_run = await run_repo.latest_done_run(session, study.id, "ask")
    act_run = await run_repo.latest_done_run(session, study.id, "act")
    personas = await study_repo.list_personas(session, study.id)
    ask_rows = await run_repo.list_ask_responses(session, ask_run.id) if ask_run else []
    act_rows = await run_repo.list_act_logs(session, act_run.id) if act_run else []
    return ReportOut(
        study_id=study.id,
        source=await study_repo.study_source(session,study.id),
        ask_run_id=ask_run.id if ask_run else None,
        act_run_id=act_run.id if act_run else None,
        results=build_results(personas, ask_rows, act_rows),
    )


async def _missing_inputs(session: AsyncSession, study_id: int, mode: str) -> list[str]:
    need = {"AI 패널": study_repo.list_personas}
    if mode == "ask":
        need["제품 정보"] = study_repo.get_product
    else:
        need["프로토타입"] = study_repo.get_prototype
        need["과제"] = study_repo.get_task
    return [name for name, get in need.items() if not await get(session, study_id)]


@router.post("/{study_id}/panel/import", response_model=list[PersonaOut])
async def import_library_panel(
    body: PanelImportIn,
    study: Study = Depends(owned_study),
    session: AsyncSession = Depends(get_session),
):
    try:
        rows = await library_repo.copy_to_study(session, study.id, body.panel_id, body.n, body.seed)
    except LookupError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
    await session.commit()
    return [PersonaOut(id=p.id, attributes=p.attributes_json) for p in rows]


@router.get("/{study_id}/personas/{persona_id}/prompt", response_model=PersonaPromptOut)
async def preview_persona_prompt(
    persona_id: int,
    study: Study = Depends(owned_study),
    session: AsyncSession = Depends(get_session),
):
    personas = await study_repo.list_personas(session, study.id)
    persona = next((p for p in personas if p.id == persona_id), None)
    if persona is None:
        raise HTTPException(404, "이 테스트의 페르소나가 없습니다.")
    prototype = await study_repo.get_prototype(session, study.id)
    task = await study_repo.get_task(session, study.id)
    if not prototype or not prototype.screens_json or not task:
        raise HTTPException(409, "화면과 사용 흐름을 먼저 저장해 주세요.")
    from app.services.persona_display import public_attributes
    attributes=public_attributes(persona.attributes_json,f'P{persona.id:04}')
    return PersonaPromptOut(persona_id=persona.id,display_id=f'P{persona.id:04}',
        card_text=attributes['card_text'],profile=attributes['profile'],traits=attributes['traits'],
        screen_id=prototype.screens_json[0]['id'],system='',contents=[],response_schema={},preview_kind='public_persona_summary')
