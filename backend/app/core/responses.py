"""JSON response rendered with orjson (FastAPI deprecated its ORJSONResponse).

Contents:
    JsonResponse: Render content with orjson; UUIDs and datetimes serialize natively, anything else via str.
    JsonResponse.render: Return the JSON bytes for content.
"""

from typing import Any

import orjson
from starlette.responses import Response


class JsonResponse(Response):
    """Render content with orjson; UUIDs and datetimes serialize natively, anything else via str."""

    media_type = "application/json"

    def render(self, content: Any) -> bytes:
        """Return the JSON bytes for content."""
        return orjson.dumps(content, default=str)
