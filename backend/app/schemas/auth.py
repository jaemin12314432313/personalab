from pydantic import BaseModel, ConfigDict, EmailStr, Field, SecretStr, field_validator
from app.core.config import AUTH_PASSWORD_MAX, AUTH_PASSWORD_MIN


class AuthInput(BaseModel):
    email: EmailStr = Field(max_length=254)
    password: SecretStr = Field(min_length=AUTH_PASSWORD_MIN, max_length=AUTH_PASSWORD_MAX)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value):
        return value.strip().casefold() if isinstance(value, str) else value


class AuthUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str


class AuthMessageOut(BaseModel):
    message: str
