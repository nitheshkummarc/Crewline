"""T-UNIT-01: suggestion scoring."""

from datetime import UTC, datetime

from app.modules.suggestions.scoring import (
    Group,
    circular_hours,
    complement,
    missing_roles,
    rank,
    redundancy,
    score_candidate,
    tz_overlap,
)

NOV = datetime(2026, 11, 10, 12, tzinfo=UTC)
MARCH = datetime(2026, 3, 20, 12, tzinfo=UTC)  # US already on DST (from 8 Mar), UK not yet (from 29 Mar)


def test_circular_hours_wraps_the_date_line() -> None:
    """UTC+14 and UTC-11 are 1 hour apart on the circle, not 25."""
    assert circular_hours(14, -11) == 1
    assert circular_hours(5.5, -8) == 10.5


def test_dst_changes_the_overlap() -> None:
    """New York to London is 4 h apart in late March and 5 h in November."""
    march = tz_overlap(("Europe/London",), "America/New_York", MARCH)
    november = tz_overlap(("Europe/London",), "America/New_York", NOV)
    assert round(march * 9, 2) == 5 and round(november * 9, 2) == 4


def test_kiritimati_and_pago_pago_are_neighbours() -> None:
    """Pacific/Kiritimati (UTC+14) and Pacific/Pago_Pago (UTC-11) share 8 working hours."""
    assert round(tz_overlap(("Pacific/Kiritimati",), "Pacific/Pago_Pago", NOV) * 9, 2) == 8


def test_complement_redundancy_and_full_coverage() -> None:
    """Complement counts missing core roles; with nothing missing, new skills get half credit."""
    team = frozenset({"frontend"})
    assert missing_roles(team) == ["backend", "design", "ml", "devops", "pitch"]
    assert complement(team, frozenset({"backend", "devops"})) == 0.4
    assert redundancy(team, frozenset({"frontend", "backend"})) == 0.5
    full = frozenset({"frontend", "backend", "design", "ml", "devops", "pitch"})
    assert complement(full, frozenset({"security", "frontend"})) == 0.25
    assert complement(full, frozenset()) == 0


def test_rank_order_clamp_and_ties() -> None:
    """Covering missing roles beats duplicating skills; ties fall back to time zone then user id."""
    group = Group(skills=frozenset({"frontend"}), zones=("Asia/Kolkata",), solo=False)
    cands = [
        {"user_id": "c", "display_name": "C", "skills": ["backend"], "timezone": "America/Los_Angeles"},
        {"user_id": "b", "display_name": "B", "skills": ["frontend"], "timezone": "Asia/Kolkata"},
        {"user_id": "a", "display_name": "A", "skills": ["backend", "devops"], "timezone": "Asia/Kolkata"},
        {"user_id": "a2", "display_name": "A2", "skills": ["backend", "devops"], "timezone": "Asia/Kolkata"},
        {"user_id": "z", "display_name": "Z", "skills": [], "timezone": "America/Los_Angeles"},
    ]
    ranked = rank(group, cands, NOV, 10)
    assert [c["user_id"] for c in ranked] == ["a", "a2", "b", "c", "z"]
    assert ranked[0]["score"] == round(0.6 * 0.4 + 0.3 * 1 + 0.1 * (2 / 3), 3)
    assert ranked[-1]["score"] == 0 and "No skills listed" in ranked[-1]["reasons"]
    assert all(0 <= c["score"] <= 1 for c in ranked)


def test_one_person_group_reasons() -> None:
    """A caller without a team is a one-person group and the reasons say 'you'."""
    group = Group(skills=frozenset({"backend"}), zones=("Asia/Kolkata",), solo=True)
    scored = score_candidate(group, {"user_id": "x", "display_name": "X", "skills": ["frontend"],
                                     "timezone": "Asia/Kolkata"}, NOV)
    assert scored["reasons"][0] == "Covers frontend (missing for you)"
    assert "9 h working-hours overlap with you" in scored["reasons"]
