"""T-UNIT-04 and T-UNIT-05: request hashing and constraint error mapping."""

from types import SimpleNamespace

from app.core import errors
from app.core.idempotency import request_hash
from app.db.errors import to_domain_error


def test_unit_04_hash_ignores_key_order() -> None:
    """T-UNIT-04: key order does not change the hash; a body change does."""
    a = request_hash("post", "/api/teams/join", {}, {"code": "X", "n": 1})
    b = request_hash("POST", "/api/teams/join", {}, {"n": 1, "code": "X"})
    c = request_hash("POST", "/api/teams/join", {}, {"n": 2, "code": "X"})
    assert a == b
    assert a != c


def test_unit_05_constraint_mapping() -> None:
    """T-UNIT-05: each constraint name maps to the right domain error."""
    cases = {
        "memberships_one_team_per_hackathon": errors.AlreadyInTeam,
        "memberships_participant_fk": errors.NotRegistered,
        "teams_cap": errors.TeamFull,
        "teams_min_when_finalized": errors.BelowMinSize,
        "users_email_unique": errors.EmailTaken,
    }
    for name, cls in cases.items():
        assert isinstance(to_domain_error(SimpleNamespace(constraint_name=name)), cls)
    assert to_domain_error(SimpleNamespace(constraint_name="something_else")) is None
    assert to_domain_error(ValueError()) is None
