"""Auth request and response models."""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.skills import Skill
from app.core.timezones import validate_timezone


def _unique_skills(skills: list[str] | None) -> list[str] | None:
    """Return the skills without duplicates, keeping order."""
    return list(dict.fromkeys(skills)) if skills is not None else None


class SignupIn(BaseModel):
    """Signup body."""

    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=60)
    skills: list[Skill] = Field(default_factory=list, max_length=12)
    timezone: str = Field(default="UTC", max_length=64)

    _skills = field_validator("skills")(_unique_skills)
    _tz = field_validator("timezone")(validate_timezone)


class LoginIn(BaseModel):
    """Login body."""

    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UpdateMeIn(BaseModel):
    """Profile update body; at least one field."""

    model_config = ConfigDict(extra="forbid")
    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    skills: list[Skill] | None = Field(default=None, max_length=12)
    timezone: str | None = Field(default=None, max_length=64)

    _skills = field_validator("skills")(_unique_skills)

    @field_validator("timezone")
    @classmethod
    def _tz(cls, value: str | None) -> str | None:
        return validate_timezone(value) if value is not None else None

    @model_validator(mode="after")
    def _not_empty(self) -> "UpdateMeIn":
        if not self.model_fields_set:
            raise ValueError("provide at least one field")
        return self


class UserOut(BaseModel):
    """The signed-in user."""

    id: UUID
    email: str
    display_name: str
    skills: list[str]
    timezone: str
