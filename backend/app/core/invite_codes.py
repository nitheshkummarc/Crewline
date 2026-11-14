"""Invite code generation and normalization (10 Crockford base32 characters, about 50 bits).

Contents:
    generate_code: Return 10 random Crockford base32 characters.
    normalize_code: Uppercase, strip dashes and spaces, map O/I/L; return None if malformed.
    format_code: Return the code as XXXXX-XXXXX for display.
"""

import secrets

ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
LENGTH = 10
_CONFUSABLE = str.maketrans({"O": "0", "I": "1", "L": "1"})


def generate_code() -> str:
    """Return 10 random Crockford base32 characters."""
    return "".join(secrets.choice(ALPHABET) for _ in range(LENGTH))


def normalize_code(raw: str) -> str | None:
    """Uppercase, strip dashes and spaces, map O/I/L; return None if malformed."""
    code = raw.upper().replace("-", "").replace(" ", "").translate(_CONFUSABLE)
    if len(code) != LENGTH or any(ch not in ALPHABET for ch in code):
        return None
    return code


def format_code(code: str) -> str:
    """Return the code as XXXXX-XXXXX for display."""
    return f"{code[:5]}-{code[5:]}"
