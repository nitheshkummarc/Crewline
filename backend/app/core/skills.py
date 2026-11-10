"""Fixed skill taxonomy and core roles."""

from typing import Literal

Skill = Literal[
    "frontend", "backend", "mobile", "ml", "data", "devops",
    "cloud", "design", "product", "security", "blockchain", "pitch",
]

SKILLS: tuple[str, ...] = (
    "frontend", "backend", "mobile", "ml", "data", "devops",
    "cloud", "design", "product", "security", "blockchain", "pitch",
)

CORE_ROLES: tuple[str, ...] = ("frontend", "backend", "design", "ml", "devops", "pitch")
