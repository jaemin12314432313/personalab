from sqlalchemy import Boolean, ForeignKey, String, false
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorkspacePreference(Base):
    __tablename__ = "workspace_preferences"
    root_study_id: Mapped[int] = mapped_column(
        ForeignKey("studies.id", ondelete="CASCADE"), primary_key=True
    )
    display_name: Mapped[str | None] = mapped_column(String(200))
    archived: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    trashed: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
