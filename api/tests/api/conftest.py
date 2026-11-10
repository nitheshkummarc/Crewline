"""API test fixtures: every test gets a clean database and invariant checks."""

import pytest


@pytest.fixture(autouse=True)
def _clean(clean_db: str) -> str:
    """Apply clean_db to every API test."""
    return clean_db
