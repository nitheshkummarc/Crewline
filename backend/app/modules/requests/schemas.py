"""Join request models.

Contents:
    CreateRequestIn: Body for POST /api/teams/{tid}/requests.
"""

from pydantic import ConfigDict, Field

from app.core.inputs import InputModel


class CreateRequestIn(InputModel):
    """Body for POST /api/teams/{tid}/requests."""

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    message: str | None = Field(default=None, max_length=280)
