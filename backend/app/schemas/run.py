from typing import Literal

from pydantic import BaseModel, ConfigDict


class RunCreate(BaseModel):
    mode: Literal["ask", "act"]


class RunOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    study_id: int
    mode: str
    status: str
    progress: float
