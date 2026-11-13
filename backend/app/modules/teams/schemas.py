"""Team request models."""

from pydantic import ConfigDict, Field, model_validator

from app.core.inputs import InputModel


class CreateTeamIn(InputModel):
    """Body for POST /api/hackathons/{hid}/teams."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=60)


class UpdateTeamIn(InputModel):
    """Body for PATCH /api/teams/{tid}; at least one field."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str | None = Field(default=None, min_length=1, max_length=60)
    looking: bool | None = None

    @model_validator(mode="after")
    def _not_empty(self) -> "UpdateTeamIn":
        if self.name is None and self.looking is None:
            raise ValueError("provide name or looking")
        return self


class JoinIn(InputModel):
    """Body for POST /api/teams/join."""

    model_config = ConfigDict(extra="forbid")
    code: str = Field(min_length=1, max_length=20)
