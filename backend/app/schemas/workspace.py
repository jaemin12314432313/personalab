from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class WorkspaceState(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    display_name: str | None = None
    archived: bool = False
    trashed: bool = False


class ManagementIn(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    action: Literal["rename", "duplicate", "archive", "unarchive", "trash", "restore", "delete"]
    name: str | None = Field(default=None, min_length=1, max_length=200)
    confirmation: str | None = Field(default=None, max_length=200)


class EmptyTrashIn(BaseModel):
    confirmation: str = Field(max_length=50)


class EmptyTrashOut(BaseModel):
    deleted: int
    skipped: int
    study_ids: list[int]


class ManagementOut(BaseModel):
    root_study_id: int
    affected_study_ids: list[int]
    workspace: WorkspaceState = Field(default_factory=WorkspaceState)
    deleted: bool = False
    duplicate_id: int | None = None


class DiscardOut(BaseModel):
    deleted: int
    root_study_id: int
