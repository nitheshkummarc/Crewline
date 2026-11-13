"""Hackathon request and response models."""

from pydantic import ConfigDict

from app.core.inputs import InputModel


class SetLookingIn(InputModel):
    """Body for PATCH /api/hackathons/{hid}/me."""

    model_config = ConfigDict(extra="forbid")
    looking: bool
