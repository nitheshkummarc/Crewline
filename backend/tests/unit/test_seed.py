"""Seed data: T-UNIT-08 (every seeded account passes the login model, bug B-22).

Contents:
    test_unit_08_seeded_emails_can_log_in: T-UNIT-08: seeded emails are accepted by LoginIn (a reserved TLD such as
        .test is refused by EmailStr).
"""

import random

from seed import build

from app.modules.auth.schemas import LoginIn


def test_unit_08_seeded_emails_can_log_in() -> None:
    """T-UNIT-08: seeded emails are accepted by LoginIn (a reserved TLD such as .test is refused by EmailStr)."""
    data = build(users=20, teams=4, max_size=4, min_size=2, rng=random.Random(1))
    emails = [row[1] for row in data["users"]]
    assert emails[0] == "user00000@example.com"
    for email in emails:
        LoginIn(email=email, password="crewline-demo-1", form_token="t")
