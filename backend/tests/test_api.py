"""Smoke tests — kept minimal; full coverage is in test_auth/users/pantry/recipes/feedback."""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"
