"""Base model for request bodies: unknown fields and NUL characters are rejected.

Contents:
    _has_nul: True when a string, or any string inside a list or dict, contains U+0000.
    InputModel: Request body base; PostgreSQL text cannot store U+0000, so it is refused as 400 here (B-39).
    InputModel._no_nul: Reject a body that carries U+0000 in any text.
"""

from typing import Any

from pydantic import BaseModel, ConfigDict, model_validator


def _has_nul(value: Any) -> bool:
    """True when a string, or any string inside a list or dict, contains U+0000."""
    if isinstance(value, str):
        return "\x00" in value
    if isinstance(value, list):
        return any(_has_nul(item) for item in value)
    if isinstance(value, dict):
        return any(_has_nul(key) or _has_nul(item) for key, item in value.items())
    return False


class InputModel(BaseModel):
    """Request body base; PostgreSQL text cannot store U+0000, so it is refused as 400 here (B-39)."""

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="before")
    @classmethod
    def _no_nul(cls, data: Any) -> Any:
        """Reject a body that carries U+0000 in any text."""
        if _has_nul(data):
            raise ValueError("text cannot contain NUL characters")
        return data
