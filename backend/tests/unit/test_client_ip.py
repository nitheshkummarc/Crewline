"""T-UNIT-09: the rate-limit client IP comes from the configured edge header or the socket peer, never XFF."""

from types import SimpleNamespace

import pytest
from starlette.requests import Request

from app.core import deps


def request(headers: dict[str, str], peer: str = "10.0.0.9") -> Request:
    """Build a bare request with these headers and socket peer."""
    raw = [(k.lower().encode(), v.encode()) for k, v in headers.items()]
    return Request({"type": "http", "method": "GET", "path": "/", "headers": raw, "client": (peer, 5000)})


def use_header(monkeypatch: pytest.MonkeyPatch, name: str) -> None:
    """Make client_ip read settings with this CLIENT_IP_HEADER."""
    monkeypatch.setattr(deps, "get_settings", lambda: SimpleNamespace(client_ip_header=name))


def test_unit_09_forwarded_for_is_ignored(monkeypatch: pytest.MonkeyPatch) -> None:
    """T-UNIT-09: without a configured header the peer is used, whatever X-Forwarded-For says (B-33)."""
    use_header(monkeypatch, "")
    assert deps.client_ip(request({"X-Forwarded-For": "203.0.113.7, 10.0.0.1"})) == "10.0.0.9"


def test_unit_09_configured_header_wins_and_falls_back(monkeypatch: pytest.MonkeyPatch) -> None:
    """T-UNIT-09: the configured header is used when present; when missing or blank the peer is used."""
    use_header(monkeypatch, "cf-connecting-ip")
    spoofed = {"X-Forwarded-For": "203.0.113.7"}
    assert deps.client_ip(request({**spoofed, "CF-Connecting-IP": " 198.51.100.4 "})) == "198.51.100.4"
    assert deps.client_ip(request(spoofed)) == "10.0.0.9"
    assert deps.client_ip(request({"CF-Connecting-IP": "  "})) == "10.0.0.9"
