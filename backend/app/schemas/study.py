"""스터디 입력 API 스키마 (계획서 3장 ①~⑤, 10장)."""

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.core.config import settings


class StudyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class StudyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    status: str


class ProductIn(BaseModel):
    description: str = Field(min_length=1)
    features: list[str] = Field(min_length=1)
    price: str


class ProductOut(ProductIn):
    id: int
    study_id: int


class Element(BaseModel):
    text: str = Field(min_length=1)
    to: str | None = None  # 이동할 화면 id. 없으면 제자리 버튼


class Screen(BaseModel):
    id: str = Field(min_length=1, max_length=50)
    label: str
    description: str = ""
    elements: list[Element] = []


class PrototypeManualIn(BaseModel):
    """피그마 연동 실패 시 폴백. 화면과 버튼 연결을 직접 넣는다. 첫 화면이 시작 화면이다."""

    screens: list[Screen] = Field(min_length=1)

    @model_validator(mode="after")
    def links_point_to_screens(self):
        ids = [s.id for s in self.screens]
        if len(ids) != len(set(ids)):
            raise ValueError("화면 id 가 중복된다")
        broken = [e.to for s in self.screens for e in s.elements if e.to and e.to not in ids]
        if broken:
            raise ValueError(f"없는 화면으로 연결된다: {broken}")
        return self


class PrototypeOut(BaseModel):
    id: int
    study_id: int
    figma_url: str | None
    screens: list[Screen]


class TaskIn(BaseModel):
    description: str = Field(min_length=1)
    goal_screen_id: str


class TaskOut(TaskIn):
    model_config = ConfigDict(from_attributes=True)

    id: int
    study_id: int


class QuestionIn(BaseModel):
    code: str = Field(min_length=1, max_length=10)
    type: str = Field(min_length=1, max_length=20)
    text: str = Field(min_length=1)


class QuestionsIn(BaseModel):
    questions: list[QuestionIn] = Field(min_length=1)


class QuestionOut(QuestionIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class PanelGenerateIn(BaseModel):
    conditions: dict = {}
    n: int = Field(default=settings.panel_size, ge=1, le=settings.panel_size)
    seed: int = 42


class PersonaOut(BaseModel):
    id: int
    attributes: dict
