"""Auth request and response models.

Contents:
    _unique_skills: Return the skills without duplicates, keeping order.
    SignupIn: Signup body.
    LoginIn: Login body.
    UpdateMeIn: Profile update body; at least one field.
    UpdateMeIn._tz: Validate the time zone as an IANA name.
    UpdateMeIn._not_empty: Require at least one field and refuse explicit nulls.
    UserOut: The signed-in user.
"""

from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.core.inputs import InputModel
from app.core.skills import Skill
from app.core.timezones import validate_timezone


def _unique_skills(skills: list[str] | None) -> list[str] | None:
    """Return the skills without duplicates, keeping order."""
    return list(dict.fromkeys(skills)) if skills is not None else None


class SignupIn(InputModel):
    """Signup body."""

    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=60)
    skills: list[Skill] = Field(default_factory=list, max_length=12)
    timezone: str = Field(default="UTC", max_length=64)
    form_token: str = Field(min_length=1, max_length=1024)
    company: str = Field(default="", max_length=200)

    _skills = field_validator("skills")(_unique_skills)
    _tz = field_validator("timezone")(validate_timezone)


class LoginIn(InputModel):
    """Login body."""

    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    form_token: str = Field(min_length=1, max_length=1024)
    company: str = Field(default="", max_length=200)


class UpdateMeIn(InputModel):
    """Profile update body; at least one field."""

    model_config = ConfigDict(extra="forbid")
    display_name: str | None = Field(default=None, min_length=1, max_length=60)
    skills: list[Skill] | None = Field(default=None, max_length=12)
    timezone: str | None = Field(default=None, max_length=64)

    _skills = field_validator("skills")(_unique_skills)

    @field_validator("timezone")
    @classmethod
    def _tz(cls, value: str | None) -> str | None:
        """Validate the time zone as an IANA name."""
        return validate_timezone(value) if value is not None else None

    @model_validator(mode="after")
    def _not_empty(self) -> "UpdateMeIn":
        """Require at least one field and refuse explicit nulls."""
        if not self.model_fields_set:
            raise ValueError("provide at least one field")
        # Every column is NOT NULL; an explicit null is refused here, not by PostgreSQL (B-38).
        if any(getattr(self, name) is None for name in self.model_fields_set):
            raise ValueError("fields cannot be null")
        return self


class UserOut(BaseModel):
    """The signed-in user."""

    id: UUID
    email: str
    display_name: str
    skills: list[str]
    timezone: str
