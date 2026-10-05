"""스터디와 입력, 실행 시작 (계획서 3장 ①~⑦, 10장)."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import current_user_id
from app.core.db import get_session
from app.models import Study
from app.repositories import run as run_repo
from app.repositories import study as study_repo
from app.schemas.run import RunCreate, RunOut
from app.schemas.study import (
    PanelGenerateIn,
    PersonaOut,
    ProductIn,
    ProductOut,
    PrototypeManualIn,
    PrototypeOut,
    QuestionOut,
    QuestionsIn,
    StudyCreate,
    StudyOut,
    TaskIn,
    TaskOut,
)
from app.services import runner
from app.services.persona.sample import sample_personas

router = APIRouter(prefix="/studies", tags=["studies"])


async def owned_study(
    study_id: int,
    session: AsyncSession = Depends(get_session),
    user_id: int = Depends(current_user_id),
) -> Study:
    study = await study_repo.get_study(session, study_id, user_id)
    if study is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "스터디가 없습니다")
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
    session: AsyncSession = Depends(get_session), user_id: int = Depends(current_user_id)
):
    return await study_repo.list_studies(session, user_id)


@router.get("/{study_id}", response_model=StudyOut)
async def get_study(study: Study = Depends(owned_study)):
    return study


@router.post("/{study_id}/product", response_model=ProductOut)
async def set_product(
    body: ProductIn,
    study: Study = Depends(owned_study),
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


@router.post("/{study_id}/prototype", status_code=status.HTTP_501_NOT_IMPLEMENTED)
async def import_figma(study: Study = Depends(owned_study)):
    # 피그마 연동은 P2 스파이크(5주차) 후 채운다. 그전에는 /prototype/manual 을 쓴다
    raise HTTPException(
        status.HTTP_501_NOT_IMPLEMENTED, "피그마 연동 준비 중입니다. /prototype/manual 을 쓰세요"
    )


@router.post("/{study_id}/prototype/manual", response_model=PrototypeOut)
async def set_prototype_manual(
    body: PrototypeManualIn,
    study: Study = Depends(owned_study),
    session: AsyncSession = Depends(get_session),
):
    screens = [s.model_dump() for s in body.screens]
    p = await study_repo.set_prototype(session, study.id, None, screens)
    return PrototypeOut(id=p.id, study_id=p.study_id, figma_url=p.figma_url, screens=p.screens_json)


@router.post("/{study_id}/task", response_model=TaskOut)
async def set_task(
    body: TaskIn, study: Study = Depends(owned_study), session: AsyncSession = Depends(get_session)
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
    study: Study = Depends(owned_study),
    session: AsyncSession = Depends(get_session),
):
    questions = [q.model_dump() for q in body.questions]
    return await study_repo.replace_questions(session, study.id, questions)


@router.post("/{study_id}/panel/generate", response_model=list[PersonaOut])
async def generate_panel(
    body: PanelGenerateIn,
    study: Study = Depends(owned_study),
    session: AsyncSession = Depends(get_session),
):
    attributes = sample_personas(body.conditions, body.n, body.seed)
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
    missing = await _missing_inputs(session, study.id, body.mode)
    if missing:
        raise HTTPException(status.HTTP_409_CONFLICT, f"먼저 입력하세요: {', '.join(missing)}")
    run = await run_repo.create_run(session, study.id, body.mode)
    background.add_task(launch, run.id)
    return run


async def _missing_inputs(session: AsyncSession, study_id: int, mode: str) -> list[str]:
    need = {"AI 패널": study_repo.list_personas}
    if mode == "ask":
        need["제품 정보"] = study_repo.get_product
    else:
        need["프로토타입"] = study_repo.get_prototype
        need["과제"] = study_repo.get_task
    return [name for name, get in need.items() if not await get(session, study_id)]
