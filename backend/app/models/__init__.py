"""모든 모델을 여기서 import 해야 Alembic 이 테이블을 인식한다."""

from app.models.auth import AuthSession, UserCredential
from app.models.base import Base
from app.models.interview import InterviewMessage, InterviewThread, LocalDemoStudy
from app.models.persona_library import PersonaLibraryEntry, PersonaLibraryPanel
from app.models.run import ActLog, AskResponse, Persona, Run, RunReport
from app.models.study import Product, Prototype, Question, Study, Task, User
from app.models.validation import BenchmarkApp, BenchmarkIssue, Calibration, Invite
from app.models.workflow import BrowserEvidence, RunControl, StudyWorkflow
from app.models.workspace import WorkspacePreference

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
    "BrowserEvidence",
    "RunControl",
    "StudyWorkflow",
    "WorkspacePreference",
]
