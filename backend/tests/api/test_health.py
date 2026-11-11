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


async def test_api_48_security_headers_and_web_cache_rules(server: str) -> None:
    """T-API-48: every response carries the security headers; the SPA shell revalidates, hashed assets are immutable."""
    async with httpx.AsyncClient(base_url=server, verify=SHARED_TLS) as client:
        api = await client.get("/api/meta")
        shell = await client.get("/teams/any-client-route")
        asset = await client.get("/assets/index-abc123.js")
        missing_api = await client.get("/api/does-not-exist")
    for response in (api, shell, asset, missing_api):
        csp = response.headers["content-security-policy"]
        assert "script-src 'self';" in csp and "script-src 'self' 'unsafe" not in csp
        assert "frame-ancestors 'none'" in response.headers["content-security-policy"]
        assert response.headers["x-content-type-options"] == "nosniff"
        assert response.headers["referrer-policy"] == "same-origin"
        assert response.headers["strict-transport-security"].startswith("max-age=")
    assert shell.status_code == 200 and "<div id=root>" in shell.text
    assert shell.headers["cache-control"] == "no-cache"
    assert asset.headers["cache-control"] == "public, max-age=31536000, immutable"
    assert "cache-control" not in api.headers
    assert missing_api.status_code == 404 and missing_api.json()["error"]["code"] == "not_found"
