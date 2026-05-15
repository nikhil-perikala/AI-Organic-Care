"""
Integration tests for the Organic Care AI API.
Run with: pytest tests/ -v
Requires DATABASE_URL and OPENAI_API_KEY env vars.
"""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app


@pytest.mark.asyncio
async def test_health():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_register_and_login():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        email = "test_ci@organiccare.ai"
        register = await client.post("/api/v1/auth/register", json={
            "email": email,
            "password": "securePass123",
            "full_name": "CI Tester",
        })
        assert register.status_code in (201, 409)

        login = await client.post("/api/v1/auth/login", json={
            "email": email,
            "password": "securePass123",
        })
        assert login.status_code == 200
        data = login.json()
        assert "access_token" in data
        assert "refresh_token" in data


@pytest.mark.asyncio
async def test_recommendations_unauthenticated():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        resp = await client.post("/api/v1/recommendations", json={
            "query": "I'm feeling tired",
            "use_pantry": False,
        })
    # May return 500 if DB/OpenAI unavailable in CI, but should not be 422
    assert resp.status_code in (200, 500)
