import uuid


async def test_list_pantry_empty(client, auth_headers):
    resp = await client.get("/api/v1/pantry", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_add_pantry_item(client, auth_headers):
    resp = await client.post("/api/v1/pantry", json={
        "ingredient_name": "spinach",
        "quantity": 200.0,
        "unit": "g",
        "category": "vegetables",
    }, headers=auth_headers)
    assert resp.status_code == 201
    data = resp.json()
    assert data["ingredient_name"] == "spinach"
    assert "id" in data


async def test_added_item_appears_in_list(client, auth_headers):
    created = await client.post("/api/v1/pantry", json={"ingredient_name": "almonds"}, headers=auth_headers)
    item_id = created.json()["id"]

    listing = await client.get("/api/v1/pantry", headers=auth_headers)
    ids = [i["id"] for i in listing.json()]
    assert item_id in ids


async def test_bulk_add(client, auth_headers):
    items = [{"ingredient_name": f"bulk_item_{i}", "quantity": float(i + 1)} for i in range(5)]
    resp = await client.post("/api/v1/pantry/bulk", json=items, headers=auth_headers)
    assert resp.status_code == 201
    assert len(resp.json()) == 5


async def test_bulk_add_over_limit(client, auth_headers):
    items = [{"ingredient_name": f"x_{i}"} for i in range(101)]
    resp = await client.post("/api/v1/pantry/bulk", json=items, headers=auth_headers)
    assert resp.status_code == 400


async def test_update_pantry_item(client, auth_headers):
    created = await client.post("/api/v1/pantry", json={
        "ingredient_name": "oats", "quantity": 500.0, "unit": "g",
    }, headers=auth_headers)
    item_id = created.json()["id"]

    resp = await client.patch(f"/api/v1/pantry/{item_id}", json={
        "ingredient_name": "rolled oats", "quantity": 400.0, "unit": "g",
    }, headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["ingredient_name"] == "rolled oats"
    assert resp.json()["quantity"] == "400.0"


async def test_update_nonexistent_pantry_item(client, auth_headers):
    resp = await client.patch(f"/api/v1/pantry/{uuid.uuid4()}", json={
        "ingredient_name": "anything",
    }, headers=auth_headers)
    assert resp.status_code == 404


async def test_delete_pantry_item(client, auth_headers):
    created = await client.post("/api/v1/pantry", json={"ingredient_name": "to_delete"}, headers=auth_headers)
    item_id = created.json()["id"]

    resp = await client.delete(f"/api/v1/pantry/{item_id}", headers=auth_headers)
    assert resp.status_code == 204

    ids = [i["id"] for i in (await client.get("/api/v1/pantry", headers=auth_headers)).json()]
    assert item_id not in ids


async def test_delete_nonexistent_pantry_item(client, auth_headers):
    resp = await client.delete(f"/api/v1/pantry/{uuid.uuid4()}", headers=auth_headers)
    assert resp.status_code == 404


async def test_pantry_requires_auth(client):
    resp = await client.get("/api/v1/pantry")
    assert resp.status_code in (401, 403)

    resp = await client.post("/api/v1/pantry", json={"ingredient_name": "test"})
    assert resp.status_code in (401, 403)


async def test_cannot_access_other_users_pantry_item(client, test_user, auth_headers):
    # Create item as test_user
    created = await client.post("/api/v1/pantry", json={"ingredient_name": "private_item"}, headers=auth_headers)
    item_id = created.json()["id"]

    # Create a second user and try to delete/update the first user's item
    from unittest.mock import patch, AsyncMock
    email2 = f"u2_{test_user['id'][:8]}@test.organiccare"
    with patch("app.api.auth.send_otp_email", new_callable=AsyncMock):
        await client.post("/api/v1/auth/register", json={"email": email2, "password": test_user["password"]})
    login2 = await client.post("/api/v1/auth/login", json={"email": email2, "password": test_user["password"]})
    headers2 = {"Authorization": f"Bearer {login2.json()['access_token']}"}

    resp = await client.delete(f"/api/v1/pantry/{item_id}", headers=headers2)
    assert resp.status_code == 404
