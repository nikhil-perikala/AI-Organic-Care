import uuid
from unittest.mock import AsyncMock, patch

from tests.conftest import TEST_PASSWORD

_email = lambda: f"auth_{uuid.uuid4().hex[:8]}@test.organiccare"


# ── Register ──────────────────────────────────────────────────────────────────

async def test_register_success(client):
    resp = await client.post("/api/v1/auth/register", json={
        "email": _email(), "password": TEST_PASSWORD, "full_name": "Alice",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert "id" in data
    assert "email" in data
    assert "hashed_password" not in data


async def test_register_duplicate_email(client, test_user):
    resp = await client.post("/api/v1/auth/register", json={
        "email": test_user["email"], "password": TEST_PASSWORD,
    })
    assert resp.status_code == 409


async def test_register_invalid_email(client):
    resp = await client.post("/api/v1/auth/register", json={
        "email": "not-an-email", "password": TEST_PASSWORD,
    })
    assert resp.status_code == 422


async def test_register_password_too_short(client):
    resp = await client.post("/api/v1/auth/register", json={
        "email": _email(), "password": "abc",
    })
    assert resp.status_code == 422


async def test_register_password_too_long(client):
    resp = await client.post("/api/v1/auth/register", json={
        "email": _email(), "password": "x" * 129,
    })
    assert resp.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────────

async def test_login_success(client, test_user):
    resp = await client.post("/api/v1/auth/login", json={
        "email": test_user["email"], "password": test_user["password"],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"


async def test_login_wrong_password(client, test_user):
    resp = await client.post("/api/v1/auth/login", json={
        "email": test_user["email"], "password": "WrongPass999!",
    })
    assert resp.status_code == 401


async def test_login_unknown_email(client):
    resp = await client.post("/api/v1/auth/login", json={
        "email": "nobody@example.com", "password": TEST_PASSWORD,
    })
    assert resp.status_code == 401


# ── Token refresh ─────────────────────────────────────────────────────────────

async def test_refresh_valid_token(client, test_user):
    login = await client.post("/api/v1/auth/login", json={
        "email": test_user["email"], "password": test_user["password"],
    })
    refresh_token = login.json()["refresh_token"]

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": refresh_token})
    assert resp.status_code == 200
    assert "access_token" in resp.json()
    assert "refresh_token" in resp.json()


async def test_refresh_rejects_access_token(client, test_user):
    login = await client.post("/api/v1/auth/login", json={
        "email": test_user["email"], "password": test_user["password"],
    })
    access_token = login.json()["access_token"]

    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": access_token})
    assert resp.status_code == 401


async def test_refresh_rejects_garbage(client):
    resp = await client.post("/api/v1/auth/refresh", json={"refresh_token": "garbage.token.here"})
    assert resp.status_code == 401


# ── Forgot password ───────────────────────────────────────────────────────────

async def test_forgot_password_no_email_enumeration(client, test_user):
    # Both registered and unregistered emails return the same 200 response
    for email in [test_user["email"], "nobody@example.com"]:
        with patch("app.api.auth.send_otp_email", new_callable=AsyncMock):
            resp = await client.post("/api/v1/auth/forgot-password", json={"email": email})
        assert resp.status_code == 200
        assert "verification code" in resp.json()["message"].lower()


async def test_verify_otp_invalid_code(client, test_user):
    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock):
        await client.post("/api/v1/auth/forgot-password", json={"email": test_user["email"]})

    resp = await client.post("/api/v1/auth/verify-otp", json={
        "email": test_user["email"], "otp": "000000",
    })
    assert resp.status_code == 400


async def test_verify_otp_unknown_email(client):
    resp = await client.post("/api/v1/auth/verify-otp", json={
        "email": "nobody@example.com", "otp": "123456",
    })
    assert resp.status_code == 400


async def test_reset_password_invalid_token(client):
    resp = await client.post("/api/v1/auth/reset-password", json={
        "token": "not.a.real.token", "new_password": TEST_PASSWORD,
    })
    assert resp.status_code == 400


# ── Full reset flow ───────────────────────────────────────────────────────────

async def test_full_password_reset_flow(client):
    email = f"reset_{uuid.uuid4().hex[:8]}@test.organiccare"
    new_password = "NewSecure999!"

    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock):
        await client.post("/api/v1/auth/register", json={"email": email, "password": TEST_PASSWORD})

    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock), \
         patch("app.api.auth.generate_otp", return_value="654321"):
        await client.post("/api/v1/auth/forgot-password", json={"email": email})

    resp = await client.post("/api/v1/auth/verify-otp", json={"email": email, "otp": "654321"})
    assert resp.status_code == 200
    reset_token = resp.json()["reset_token"]

    resp = await client.post("/api/v1/auth/reset-password", json={
        "token": reset_token, "new_password": new_password,
    })
    assert resp.status_code == 200

    # New password works
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": new_password})
    assert resp.status_code == 200

    # Old password rejected
    resp = await client.post("/api/v1/auth/login", json={"email": email, "password": TEST_PASSWORD})
    assert resp.status_code == 401


async def test_reset_token_single_use(client):
    email = f"single_{uuid.uuid4().hex[:8]}@test.organiccare"

    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock):
        await client.post("/api/v1/auth/register", json={"email": email, "password": TEST_PASSWORD})

    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock), \
         patch("app.api.auth.generate_otp", return_value="111222"):
        await client.post("/api/v1/auth/forgot-password", json={"email": email})

    verify = await client.post("/api/v1/auth/verify-otp", json={"email": email, "otp": "111222"})
    reset_token = verify.json()["reset_token"]

    r1 = await client.post("/api/v1/auth/reset-password", json={
        "token": reset_token, "new_password": "FirstNew123!",
    })
    assert r1.status_code == 200

    # Second use rejected — phash fingerprint no longer matches
    r2 = await client.post("/api/v1/auth/reset-password", json={
        "token": reset_token, "new_password": "SecondNew123!",
    })
    assert r2.status_code == 400
