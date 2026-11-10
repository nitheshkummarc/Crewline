"""Health, readiness, request id and error envelope checks."""

import httpx
from helpers import SHARED_TLS


async def test_healthz_and_readyz(server: str) -> None:
    """Both health endpoints answer 200 with ok true."""
    async with httpx.AsyncClient(base_url=server, verify=SHARED_TLS) as client:
        assert (await client.get("/healthz")).json() == {"ok": True}
        assert (await client.get("/readyz")).json() == {"ok": True}


async def test_request_id_is_echoed(server: str) -> None:
    """A provided X-Request-ID comes back in the response header."""
    async with httpx.AsyncClient(base_url=server, verify=SHARED_TLS) as client:
        response = await client.get("/healthz", headers={"X-Request-ID": "abc123"})
    assert response.headers["x-request-id"] == "abc123"


async def test_unknown_api_route_uses_error_envelope(server: str) -> None:
    """Unknown API paths return 404 in the error envelope with a request id."""
    async with httpx.AsyncClient(base_url=server, verify=SHARED_TLS) as client:
        response = await client.get("/api/does-not-exist")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["request_id"]
