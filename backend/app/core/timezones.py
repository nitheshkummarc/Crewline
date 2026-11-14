"""IANA time zone validation and current offsets.

Contents:
    _known: Return the set of known IANA zone names.
    validate_timezone: Return the name if it is a known IANA zone, else raise ValueError.
    _zone: Return a ZoneInfo, kept for the process lifetime (ZoneInfo's own cache holds only a few zones).
    current_offset_hours: Return the UTC offset in hours of a zone at an instant (cached per zone and instant).
"""

from datetime import datetime
from functools import cache, lru_cache
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


@cache
def _zone(name: str) -> ZoneInfo:
    """Return a ZoneInfo, kept for the process lifetime (ZoneInfo's own cache holds only a few zones)."""
    return ZoneInfo(name)


@lru_cache(maxsize=1024)
def current_offset_hours(name: str, at: datetime) -> float:
    """Return the UTC offset in hours of a zone at an instant (cached per zone and instant)."""
    offset = at.astimezone(_zone(name)).utcoffset()
    return offset.total_seconds() / 3600 if offset else 0.0
