"""T-UNIT-02 invite codes, T-UNIT-03 cursors, T-UNIT-06 time zones, T-UNIT-07 rate limiter."""

import re
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

import pytest

from app.core.errors import ValidationFailed
from app.core.invite_codes import ALPHABET, format_code, generate_code, normalize_code
from app.core.ratelimit import SlidingWindowLimiter
from app.core.timezones import validate_timezone
from app.modules.board.cursor import decode_cursor, encode_cursor

MIGRATION = Path(__file__).resolve().parents[3] / "database" / "migrations" / "0001_init.sql"


def test_unit_02_invite_codes() -> None:
    """Codes use the Crockford alphabet, normalize confusable input, and match the database CHECK."""
    db_regex = re.search(r"invite_code ~ '(\^\[[^']+\]\{10\}\$)'", MIGRATION.read_text()).group(1)
    codes = {generate_code() for _ in range(2000)}
    assert len(codes) == 2000
    assert all(len(c) == 10 and set(c) <= set(ALPHABET) and re.fullmatch(db_regex, c) for c in codes)
    assert normalize_code("abcde-fghjk") == "ABCDEFGHJK"
    assert normalize_code(" o1il0-ABCDE ") == "01110ABCDE"
    assert normalize_code("ABCDE-FGHJU") is None
    assert normalize_code("SHORT") is None
    assert format_code("ABCDEFGHJK") == "ABCDE-FGHJK"


def test_unit_03_cursor_round_trip_and_tamper() -> None:
    """A cursor decodes to the same position; tampered or naive cursors are rejected."""
    ts, row_id = datetime(2026, 11, 11, 10, 0, 0, 123456, tzinfo=UTC), uuid4()
    assert decode_cursor(encode_cursor(ts, row_id)) == (ts, row_id)
    assert decode_cursor(encode_cursor(ts.isoformat(), str(row_id))) == (ts, row_id)
    for bad in ("!!!", encode_cursor("2026-11-11T10:00:00", row_id), encode_cursor(ts, "not-a-uuid")):
        with pytest.raises(ValidationFailed):
            decode_cursor(bad)


def test_unit_06_timezone_validation() -> None:
    """IANA names pass; offsets and unknown names fail."""
    assert validate_timezone("Asia/Kolkata") == "Asia/Kolkata"
    assert validate_timezone("UTC") == "UTC"
    for bad in ("+05:30", "Mars/Olympus", "IST"):
        with pytest.raises(ValueError):
            validate_timezone(bad)


def test_unit_07_sliding_window_limiter() -> None:
    """The limiter allows `limit` events per window per key, then returns a positive wait."""
    limiter = SlidingWindowLimiter(3, 60)
    assert [limiter.hit("u1") for _ in range(3)] == [0, 0, 0]
    assert limiter.hit("u1") >= 1
    assert limiter.check("u2") == 0
