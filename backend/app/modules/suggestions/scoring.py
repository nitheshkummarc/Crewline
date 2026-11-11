"""Pure scoring functions for teammate suggestions (formula in architecture.md section 11)."""

from dataclasses import dataclass
from datetime import datetime

from app.core.skills import CORE_ROLES
from app.core.timezones import current_offset_hours

WORK_HOURS = 9
WEIGHTS = {"complement": 0.6, "timezone": 0.3, "completeness": 0.1, "redundancy": -0.1}


@dataclass(frozen=True)
class Group:
    """The caller's team, or the caller alone: union of skills and each member's time zone."""

    skills: frozenset[str]
    zones: tuple[str, ...]
    solo: bool


def circular_hours(a_hours: float, b_hours: float) -> float:
    """Hour distance between two UTC offsets on a 24 h circle."""
    distance = abs(a_hours - b_hours) % 24
    return min(distance, 24 - distance)


def overlap_hours(group_zones: tuple[str, ...], cand_zone: str, at: datetime) -> float:
    """Worst-case shared working hours between the candidate and any group member at an instant."""
    cand = current_offset_hours(cand_zone, at)
    return min(max(0.0, WORK_HOURS - circular_hours(current_offset_hours(zone, at), cand)) for zone in group_zones)


def tz_overlap(group_zones: tuple[str, ...], cand_zone: str, at: datetime) -> float:
    """Worst-case working-window overlap with the group at an instant, 0 to 1."""
    return overlap_hours(group_zones, cand_zone, at) / WORK_HOURS


def missing_roles(team_skills: frozenset[str]) -> list[str]:
    """Core roles the group does not cover yet, in taxonomy order."""
    return [role for role in CORE_ROLES if role not in team_skills]


def complement(team_skills: frozenset[str], cand_skills: frozenset[str]) -> float:
    """Share of missing core roles the candidate covers; half credit for new non-core skills when none are missing."""
    missing = set(missing_roles(team_skills))
    if missing:
        return len(cand_skills & missing) / len(missing)
    if not cand_skills:
        return 0.0
    return 0.5 * len(cand_skills - team_skills) / len(cand_skills)


def redundancy(team_skills: frozenset[str], cand_skills: frozenset[str]) -> float:
    """Share of candidate skills the group already has."""
    return len(cand_skills & team_skills) / len(cand_skills) if cand_skills else 0.0


def completeness(cand_skills: frozenset[str]) -> float:
    """Profile completeness, 0 to 1 (three skills or more is complete)."""
    return min(1.0, len(cand_skills) / 3)


def score_candidate(group: Group, cand: dict, at: datetime) -> dict:
    """Weighted score, breakdown and plain-language reasons for one candidate."""
    skills = frozenset(cand["skills"])
    breakdown = {
        "complement": round(complement(group.skills, skills), 3),
        "timezone": round(tz_overlap(group.zones, cand["timezone"], at), 3),
        "completeness": round(completeness(skills), 3),
        "redundancy": round(redundancy(group.skills, skills), 3),
    }
    raw = sum(WEIGHTS[name] * value for name, value in breakdown.items())
    covers = sorted(skills & set(missing_roles(group.skills)))
    shared = sorted(skills & group.skills)
    hours = overlap_hours(group.zones, cand["timezone"], at)
    whom = "you" if group.solo else "every member"
    reasons = []
    if covers:
        reasons.append(f"Covers {', '.join(covers)} ({'missing for you' if group.solo else 'missing in team'})")
    reasons.append(f"{hours:g} h working-hours overlap with {whom}")
    if shared:
        reasons.append(f"Shares {', '.join(shared)} with {'you' if group.solo else 'the team'}")
    if not skills:
        reasons.append("No skills listed")
    return {**cand, "score": round(min(1.0, max(0.0, raw)), 3), "breakdown": breakdown, "reasons": reasons}


def rank(group: Group, cands: list[dict], at: datetime, limit: int) -> list[dict]:
    """Score candidates and sort by score, then time zone overlap, then user id; cut to limit."""
    scored = [score_candidate(group, cand, at) for cand in cands]
    scored.sort(key=lambda s: (-s["score"], -s["breakdown"]["timezone"], str(s["user_id"])))
    return scored[:limit]
