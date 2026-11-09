from pydantic import BaseModel, Field, model_validator
from app.core.config import settings
from app.core.regions import region_name
from app.schemas.persona_library import LibraryPersonaOut

class AudienceFilters(BaseModel):
    query: str = Field(default='', max_length=200)
    age_min: int | None = Field(default=None, ge=0, le=120)
    age_max: int | None = Field(default=None, ge=0, le=120)
    jobs: list[str] = Field(default_factory=list, max_length=40)
    regions: list[str] = Field(default_factory=list, max_length=40)
    digital: list[str] = Field(default_factory=list, max_length=10)

    @model_validator(mode='after')
    def valid_range(self):
        if self.age_min is not None and self.age_max is not None and self.age_min > self.age_max:
            raise ValueError('최소 나이는 최대 나이보다 클 수 없습니다.')
        if any(len(v)>100 for v in self.jobs+self.regions+self.digital):
            raise ValueError('조건 값이 너무 깁니다.')
        self.regions=list(dict.fromkeys(region_name(v) for v in self.regions))
        return self

class AudienceDefinition(BaseModel):
    description: str = Field(default='', max_length=1000)
    context: str = Field(default='', max_length=1000)
    filters: AudienceFilters = Field(default_factory=AudienceFilters)
    entry_ids: list[int] = Field(default_factory=list, max_length=settings.panel_size)
    requested_count: int | None = Field(default=None, ge=1, le=settings.panel_size)

class AudienceSearchIn(BaseModel):
    filters: AudienceFilters = Field(default_factory=AudienceFilters)
    offset: int = Field(default=0, ge=0)
    limit: int = Field(default=12, ge=1, le=100)

class AudienceSearchOut(BaseModel):
    total: int
    duplicates_excluded: int
    items: list[LibraryPersonaOut]

class AudienceFacetsOut(BaseModel):
    total: int
    jobs: list[str]
    regions: list[str]
    digital: list[str]
    age_min: int | None
    age_max: int | None
    max_selection: int

class AudienceSelectIn(BaseModel):
    audience: AudienceDefinition

    @model_validator(mode='after')
    def selected(self):
        ids=self.audience.entry_ids
        if not ids or any(i<=0 for i in ids) or len(ids)!=len(set(ids)):
            raise ValueError('서로 다른 페르소나를 한 명 이상 선택하세요.')
        return self


class AudienceRecommendIn(BaseModel):
    filters: AudienceFilters = Field(default_factory=AudienceFilters)
    count: int = Field(ge=1, le=settings.panel_size)

class AudienceRecommendOut(BaseModel):
    total: int
    requested_count: int
    items: list[LibraryPersonaOut]
