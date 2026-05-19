import uuid


# ── Feedback ──────────────────────────────────────────────────────────────────

async def test_submit_feedback_guest(client):
    # session_id must be omitted (None) — it's a FK to recommendation_sessions
    resp = await client.post("/api/v1/feedback", json={
        "feedback_type": "like",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["feedback_type"] == "like"
    assert "id" in data


async def test_submit_feedback_authenticated(client, auth_headers):
    resp = await client.post("/api/v1/feedback", json={
        "feedback_type": "dislike",
        "comment": "Not what I needed",
    }, headers=auth_headers)
    assert resp.status_code == 201
    assert resp.json()["feedback_type"] == "dislike"


async def test_submit_feedback_invalid_type(client):
    resp = await client.post("/api/v1/feedback", json={
        "feedback_type": "invalid_type",
    })
    assert resp.status_code == 422


async def test_get_saved_requires_auth(client):
    resp = await client.get("/api/v1/feedback/saved")
    assert resp.status_code in (401, 403)


async def test_get_saved_empty_for_new_user(client, auth_headers):
    resp = await client.get("/api/v1/feedback/saved", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# ── Insights ──────────────────────────────────────────────────────────────────

async def test_insights_requires_auth(client):
    resp = await client.get("/api/v1/insights")
    assert resp.status_code in (401, 403)


async def test_insights_empty_for_new_user(client, auth_headers):
    resp = await client.get("/api/v1/insights", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.json()
    assert data["total_sessions"] == 0
    assert data["total_likes"] == 0
    assert data["total_saves"] == 0
    assert data["total_dislikes"] == 0
    assert data["health_score"] is None
    assert isinstance(data["session_trend"], list)
    assert len(data["session_trend"]) == 14
    assert data["top_ailments"] == []
    assert data["recent_queries"] == []
    assert data["saved_recipes"] == []
