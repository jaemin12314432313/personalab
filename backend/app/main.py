from fastapi import FastAPI
from pydantic import BaseModel

from app.api import runs, studies

app = FastAPI(title="PersonaLab")
app.include_router(studies.router)
app.include_router(runs.router)


class HealthResponse(BaseModel):
    status: str


@app.get("/health", response_model=HealthResponse)
async def health() -> HealthResponse:
    return HealthResponse(status="ok")
