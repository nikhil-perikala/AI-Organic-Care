async def test_get_me_authenticated(client, auth_headers, test_user):
    resp = await client.get("/api/v1/users/me", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == test_user["email"]
    assert "hashed_password" not in data
    assert "id" in data


async def test_get_me_unauthenticated(client):
    resp = await client.get("/api/v1/users/me")
    assert resp.status_code in (401, 403)


async def test_get_profile_fresh_user_returns_defaults(client, auth_headers):
    resp = await client.get("/api/v1/users/me/profile", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    # Must return a structured object, not {}
    assert "dietary_preferences" in data
    assert "allergies" in data
    assert "health_goals" in data
    assert "disliked_ingredients" in data
    assert "liked_cuisines" in data
    assert "serving_size" in data
    assert data["dietary_preferences"] == []
    assert data["allergies"] == []
    assert data["serving_size"] == 2


async def test_update_and_get_profile(client, auth_headers):
    payload = {
        "dietary_preferences": ["vegan", "gluten-free"],
        "health_goals": ["weight loss", "more energy"],
        "serving_size": 4,
    }
    put_resp = await client.put("/api/v1/users/me/profile", json=payload, headers=auth_headers)
    assert put_resp.status_code == 200

    get_resp = await client.get("/api/v1/users/me/profile", headers=auth_headers)
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["dietary_preferences"] == ["vegan", "gluten-free"]
    assert data["health_goals"] == ["weight loss", "more energy"]
    assert data["serving_size"] == 4


async def test_profile_partial_update_preserves_other_fields(client, auth_headers):
    # Set full profile
    await client.put("/api/v1/users/me/profile", json={
        "dietary_preferences": ["vegan"],
        "allergies": ["peanuts"],
        "serving_size": 2,
    }, headers=auth_headers)

    # Update only serving_size — other fields should be unchanged
    await client.put("/api/v1/users/me/profile", json={"serving_size": 3}, headers=auth_headers)

    data = (await client.get("/api/v1/users/me/profile", headers=auth_headers)).json()
    assert data["dietary_preferences"] == ["vegan"]
    assert data["allergies"] == ["peanuts"]
    assert data["serving_size"] == 3


async def test_profile_requires_auth(client):
    resp = await client.get("/api/v1/users/me/profile")
    assert resp.status_code in (401, 403)

    resp = await client.put("/api/v1/users/me/profile", json={"serving_size": 2})
    assert resp.status_code in (401, 403)
