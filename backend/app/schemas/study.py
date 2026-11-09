"""스터디 입력 API 스키마 (계획서 3장 ①~⑤, 10장)."""

import base64

from pydantic import BaseModel, ConfigDict, Field, field_serializer, model_validator

from app.core.config import settings
from app.schemas.run import RunOut
from app.schemas.workspace import WorkspaceState


class StudyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class StudyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    status: str
    root_study_id: int | None = None
    revision: int = 1
    product_id: str = ""
    test_title: str = ""
    round_note: str = ""
    workspace: WorkspaceState = Field(default_factory=WorkspaceState)


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
    image: str | None = Field(default=None, max_length=1400000)

    @model_validator(mode="after")
    def safe_image(self):
        if not self.image:
            return self
        head, sep, payload = self.image.partition(",")
        if (
            head
            not in ("data:image/png;base64", "data:image/jpeg;base64", "data:image/webp;base64")
            or not sep
        ):
            raise ValueError("PNG/JPEG/WebP 화면 이미지만 사용할 수 있습니다.")
        try:
            data = base64.b64decode(payload, validate=True)
        except ValueError:
            raise ValueError("이미지 형식이 올바르지 않습니다.") from None
        valid = (
            (head.startswith("data:image/png") and data.startswith(b"\x89PNG\r\n\x1a\n"))
            or (head.startswith("data:image/jpeg") and data.startswith(b"\xff\xd8\xff"))
            or (
                head.startswith("data:image/webp")
                and data.startswith(b"RIFF")
                and data[8:12] == b"WEBP"
            )
        )
        if not valid or len(data) > 1024 * 1024:
            raise ValueError("올바른 이미지 파일을 1MB 이하로 올려주세요.")
        return self

    id: str = Field(min_length=1, max_length=50)
    label: str
    description: str = ""
    elements: list[Element] = []


class PrototypeManualIn(BaseModel):
    """피그마 연동 실패 시 폴백. 화면과 버튼 연결을 직접 넣는다. 첫 화면이 시작 화면이다."""

    screens: list[Screen] = Field(min_length=1)

    @model_validator(mode="after")
    def links_point_to_screens(self):
        if sum(len(s.image or "") for s in self.screens) > 5600000:
            raise ValueError("전체 화면 이미지는 4MB 이하로 등록하세요.")
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


class FigmaImportIn(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


class FigmaImportOut(PrototypeOut):
    warnings: list[str] = []


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

    @field_serializer("attributes")
    def display_attributes(self, value):
        from app.services.persona_display import public_attributes

        return public_attributes(value, f"P{self.id:04}")


class StudyDetailOut(StudyOut):
    source: str = "live"
    product: ProductOut | None = None
    prototype: PrototypeOut | None = None
    task: TaskOut | None = None
    personas: list[PersonaOut] = []
    runs: list[RunOut] = []


class PersonaPromptOut(BaseModel):
    persona_id: int
    display_id: str
    card_text: str
    profile: dict
    traits: dict
    screen_id: str
    system: str
    contents: list[str]
    response_schema: dict
    preview_kind: str = "first_screen_act_preview"
