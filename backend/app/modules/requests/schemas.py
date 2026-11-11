"""Join request models."""

from pydantic import BaseModel, ConfigDict, Field


class CreateRequestIn(BaseModel):
    """Body for POST /api/teams/{tid}/requests."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    message: str | None = Field(default=None, max_length=280)
