import uuid


async def test_list_recipes_public(client):
    resp = await client.get("/api/v1/recipes")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_list_recipes_pagination(client):
    resp = await client.get("/api/v1/recipes?limit=5&offset=0")
    assert resp.status_code == 200
    assert len(resp.json()) <= 5


async def test_list_recipes_ailment_filter(client):
    resp = await client.get("/api/v1/recipes?ailment=fatigue")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_list_recipes_meal_type_filter(client):
    resp = await client.get("/api/v1/recipes?meal_type=breakfast")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


async def test_list_recipes_invalid_limit(client):
    resp = await client.get("/api/v1/recipes?limit=0")
    assert resp.status_code == 422


async def test_list_recipes_limit_too_large(client):
    resp = await client.get("/api/v1/recipes?limit=101")
    assert resp.status_code == 422


async def test_get_recipe_not_found(client):
    resp = await client.get(f"/api/v1/recipes/{uuid.uuid4()}")
    assert resp.status_code == 404


async def test_get_recipe_invalid_uuid(client):
    resp = await client.get("/api/v1/recipes/not-a-uuid")
    assert resp.status_code == 422


async def test_favourites_requires_auth(client):
    resp = await client.get("/api/v1/recipes/favourites")
    assert resp.status_code in (401, 403)


async def test_from_pantry_requires_auth(client):
    resp = await client.get("/api/v1/recipes/from-pantry")
    assert resp.status_code in (401, 403)


async def test_toggle_favourite_not_found(client, auth_headers):
    resp = await client.post(f"/api/v1/recipes/{uuid.uuid4()}/favourite", headers=auth_headers)
    assert resp.status_code == 404


async def test_toggle_favourite_requires_auth(client):
    resp = await client.post(f"/api/v1/recipes/{uuid.uuid4()}/favourite")
    assert resp.status_code in (401, 403)


async def test_favourites_empty_for_new_user(client, auth_headers):
    resp = await client.get("/api/v1/recipes/favourites", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []


async def test_from_pantry_empty_pantry_returns_empty_list(client, auth_headers):
    resp = await client.get("/api/v1/recipes/from-pantry", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == []
