"""Race lab request models: how many attempts, clicks or requests to fire (upper bound checked against settings)."""

from pydantic import ConfigDict, Field

from app.core.inputs import InputModel


class RaceIn(InputModel):
    """Body for POST /api/lab/race."""

    model_config = ConfigDict(extra="forbid")
    attempts: int = Field(ge=2, le=1000)


class SpamIn(InputModel):
    """Body for POST /api/lab/spam."""

    model_config = ConfigDict(extra="forbid")
    clicks: int = Field(ge=2, le=50)


class QueueIn(InputModel):
    """Body for POST /api/lab/queue."""

    model_config = ConfigDict(extra="forbid")
    requests: int = Field(ge=2, le=1000)
