"""IANA time zone validation and current offsets."""

from datetime import datetime
from functools import lru_cache
from zoneinfo import ZoneInfo, available_timezones


@lru_cache(maxsize=1)
def _known() -> frozenset[str]:
    """Return the set of known IANA zone names."""
    return frozenset(available_timezones()) | {"UTC"}


def validate_timezone(name: str) -> str:
    """Return the name if it is a known IANA zone, else raise ValueError."""
    if name not in _known():
        raise ValueError("unknown IANA time zone")
    return name


def current_offset_hours(name: str, at: datetime) -> float:
    """Return the UTC offset in hours of a zone at an instant."""
    offset = at.astimezone(ZoneInfo(name)).utcoffset()
    return offset.total_seconds() / 3600 if offset else 0.0
