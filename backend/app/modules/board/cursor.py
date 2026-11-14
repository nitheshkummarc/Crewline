"""Opaque keyset cursors: base64url of '<iso timestamp>|<uuid>'.

Contents:
    encode_cursor: Return a base64url cursor for a (timestamp, id) position.
    decode_cursor: Return (timestamp, id) from a cursor or raise validation_error.
"""

import base64
import binascii
from datetime import datetime
from uuid import UUID

from app.core.errors import ValidationFailed


def encode_cursor(ts: datetime | str, row_id: UUID | str) -> str:
    """Return a base64url cursor for a (timestamp, id) position."""
    stamp = ts.isoformat() if isinstance(ts, datetime) else ts
    return base64.urlsafe_b64encode(f"{stamp}|{row_id}".encode()).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    """Return (timestamp, id) from a cursor or raise validation_error."""
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode()
        stamp, _, row_id = raw.partition("|")
        ts = datetime.fromisoformat(stamp)
        if ts.tzinfo is None:
            raise ValueError("naive timestamp")
        return ts, UUID(row_id)
    except (ValueError, binascii.Error, UnicodeDecodeError) as exc:
        raise ValidationFailed("cursor: invalid") from exc
