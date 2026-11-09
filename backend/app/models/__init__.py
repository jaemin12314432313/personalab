from app.models.interview import LocalDemoStudy, InterviewThread, InterviewMessage
"""모든 모델을 여기서 import 해야 Alembic 이 테이블을 인식한다."""

from app.models.base import Base
from app.models.persona_library import PersonaLibraryEntry, PersonaLibraryPanel
from app.models.auth import AuthSession, UserCredential
from app.models.run import ActLog, AskResponse, Persona, Run, RunReport
from app.models.study import Product, Prototype, Question, Study, Task, User
from app.models.validation import BenchmarkApp, BenchmarkIssue, Calibration, Invite

__all__ = [
    "LocalDemoStudy",
    "InterviewThread",
    "InterviewMessage",
    "AuthSession",
    "UserCredential",
    "ActLog",
    "AskResponse",
    "Base",
    "BenchmarkApp",
    "BenchmarkIssue",
    "Calibration",
    "Invite",
    "Persona",
    "PersonaLibraryEntry",
    "PersonaLibraryPanel",
    "Product",
    "Prototype",
    "Question",
    "Run",
    "RunReport",
    "Study",
    "Task",
    "User",
]

from app.models.workflow import StudyWorkflow, BrowserEvidence, RunControl

from app.models.workspace import WorkspacePreference
