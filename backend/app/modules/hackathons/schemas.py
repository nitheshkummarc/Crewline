"""Hackathon request and response models."""

from pydantic import BaseModel, ConfigDict


class SetLookingIn(BaseModel):
    """Body for PATCH /api/hackathons/{hid}/me."""

    model_config = ConfigDict(extra="forbid")
    looking: bool
