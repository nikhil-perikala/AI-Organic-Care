import os
os.environ["TESTING"] = "1"  # must be set before any app import — activates NullPool

import uuid
import pytest_asyncio
from unittest.mock import AsyncMock, patch
from httpx import AsyncClient, ASGITransport
from app.main import app

TEST_PASSWORD = "TestPass123!"


@pytest_asyncio.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def test_user(client):
    """Register a fresh isolated user for each test."""
    email = f"u_{uuid.uuid4().hex[:8]}@test.organiccare"
    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock), \
         patch("app.api.auth.send_password_reset_email", new_callable=AsyncMock):
        resp = await client.post("/api/v1/auth/register", json={
            "email": email,
            "password": TEST_PASSWORD,
            "full_name": "Test User",
        })
    assert resp.status_code == 201, resp.text
    return {"email": email, "password": TEST_PASSWORD, **resp.json()}


@pytest_asyncio.fixture
async def auth_headers(client, test_user):
    """Bearer token headers for the test user."""
    resp = await client.post("/api/v1/auth/login", json={
        "email": test_user["email"],
        "password": test_user["password"],
    })
    assert resp.status_code == 200, resp.text
    return {"Authorization": f"Bearer {resp.json()['access_token']}"}
