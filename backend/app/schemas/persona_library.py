from pydantic import BaseModel, Field, field_serializer

from app.core.config import settings


class LibraryPanelOut(BaseModel):
    id: int
    panel_key: str
    version_hash: str
    source_commit: str
    count: int
    metadata: dict

    @field_serializer("source_commit", "version_hash")
    def hide_internal_version(self, value):
        return ""

    @field_serializer("metadata")
    def display_metadata(self, value):
        return {
            "synthetic": True,
            "source_notice": (
                "NVIDIA Nemotron-Personas-Korea · CC BY 4.0; 한국미디어패널 기반 특성은 별도 "
                "이용조건 확인 필요"
            ),
        }


class LibraryPersonaOut(BaseModel):
    id: int
    panel_id: int
    source_persona_id: str
    profile_hash: str
    attributes: dict

    @field_serializer("attributes")
    def display_attributes(self, value):
        from app.services.persona_display import public_attributes

        return public_attributes(value, f"P{self.id:04}")

    @field_serializer("profile_hash")
    def hidden_hash(self, value):
        return ""

    @field_serializer("source_persona_id")
    def display_id(self, value):
        return f"P{self.id:04}"


class LibraryPageOut(BaseModel):
    total: int
    limit: int
    offset: int
    items: list[LibraryPersonaOut]


class PanelImportIn(BaseModel):
    panel_id: int = Field(gt=0)
    n: int = Field(default=5, ge=1, le=settings.panel_size)
    seed: int = 42
