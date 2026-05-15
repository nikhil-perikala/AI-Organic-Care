from collections import Counter
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User
from app.models.feedback import RecommendationSession, UserFeedback, SavedRecommendation
from app.models.recipe import Recipe

router = APIRouter(prefix="/insights", tags=["insights"])


@router.get("")
async def get_insights(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # ── Sessions ───────────────────────────────────────────────────────────────
    sessions_result = await db.execute(
        select(RecommendationSession)
        .where(RecommendationSession.user_id == user.id)
        .order_by(RecommendationSession.created_at.desc())
    )
    sessions = sessions_result.scalars().all()

    # ── Feedback ───────────────────────────────────────────────────────────────
    feedback_result = await db.execute(
        select(UserFeedback).where(UserFeedback.user_id == user.id)
    )
    feedback = feedback_result.scalars().all()
    feedback_counts = Counter(f.feedback_type for f in feedback)

    # ── Saved recipes ──────────────────────────────────────────────────────────
    saved_result = await db.execute(
        select(SavedRecommendation, Recipe.title)
        .join(Recipe, Recipe.id == SavedRecommendation.recipe_id)
        .where(SavedRecommendation.user_id == user.id)
        .order_by(SavedRecommendation.saved_at.desc())
        .limit(5)
    )
    saved_rows = saved_result.all()

    # ── Derived stats ──────────────────────────────────────────────────────────
    total_sessions = len(sessions)
    likes = feedback_counts.get("like", 0)
    saves = feedback_counts.get("save", 0)
    dislikes = feedback_counts.get("dislike", 0)
    health_score = round((likes / max(likes + dislikes, 1)) * 100) if (likes + dislikes) > 0 else None

    # Ailment frequency across all sessions
    ailment_counter: Counter = Counter()
    for s in sessions:
        for ailment in (s.detected_ailments or []):
            ailment_counter[ailment.lower()] += 1
    top_ailments = [
        {"ailment": ailment, "count": count}
        for ailment, count in ailment_counter.most_common(8)
    ]

    # Session trend — last 14 days
    today = datetime.utcnow().date()
    trend_map: dict = {str(today - timedelta(days=i)): 0 for i in range(13, -1, -1)}
    for s in sessions:
        day = str(s.created_at.date())
        if day in trend_map:
            trend_map[day] += 1
    session_trend = [{"date": d, "count": c} for d, c in trend_map.items()]

    # Recent queries (last 8)
    recent_queries = [
        {
            "session_id": str(s.id),
            "query": s.user_query,
            "ailments": s.detected_ailments or [],
            "created_at": s.created_at.isoformat(),
        }
        for s in sessions[:8]
    ]

    # Active days (unique days with at least one session)
    active_days = len({s.created_at.date() for s in sessions})

    return {
        "total_sessions": total_sessions,
        "total_likes": likes,
        "total_saves": saves,
        "total_dislikes": dislikes,
        "health_score": health_score,
        "active_days": active_days,
        "top_ailments": top_ailments,
        "session_trend": session_trend,
        "recent_queries": recent_queries,
        "saved_recipes": [
            {
                "recipe_id": str(row.SavedRecommendation.recipe_id),
                "title": row.title,
                "saved_at": row.SavedRecommendation.saved_at.isoformat(),
            }
            for row in saved_rows
        ],
    }
