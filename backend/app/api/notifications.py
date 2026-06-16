from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User, UserPantry
from app.models.feedback import RecommendationSession, SavedRecommendation
from app.models.recipe import Recipe

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("")
async def get_notifications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    now   = datetime.now(timezone.utc)
    today = now.date()
    items: list[dict] = []

    # ── 1. Pantry expiry ──────────────────────────────────────────────────────
    pantry_result = await db.execute(
        select(UserPantry)
        .where(UserPantry.user_id == user.id)
        .where(UserPantry.expiry_date.is_not(None))
    )
    for p in pantry_result.scalars().all():
        days_left = (p.expiry_date - today).days
        name = p.ingredient_name.title()
        if days_left < 0:
            items.append({
                "id": f"pantry-expired-{p.id}",
                "category": "pantry",
                "title": f"{name} has expired",
                "body": f"Your {p.ingredient_name} expired {abs(days_left)} day(s) ago. Remove it from your pantry.",
                "time": now.isoformat(),
                "read": False,
                "actionLabel": "View Pantry",
                "actionRoute": "/pantry",
            })
        elif days_left == 0:
            items.append({
                "id": f"pantry-today-{p.id}",
                "category": "pantry",
                "title": f"{name} expires today",
                "body": f"Use your {p.ingredient_name} today before it goes to waste. Try it in a quick stir fry or omelette.",
                "time": now.isoformat(),
                "read": False,
                "actionLabel": "Browse Recipes",
                "actionRoute": "/meals",
            })
        elif days_left <= 3:
            items.append({
                "id": f"pantry-soon-{p.id}",
                "category": "pantry",
                "title": f"{name} expires in {days_left} day(s)",
                "body": f"Your {p.ingredient_name} will expire soon. Plan a recipe that uses it to avoid waste.",
                "time": (now - timedelta(minutes=30)).isoformat(),
                "read": False,
                "actionLabel": "Browse Recipes",
                "actionRoute": "/meals",
            })

    # ── 2. Saved recipes ──────────────────────────────────────────────────────
    saved_result = await db.execute(
        select(SavedRecommendation, Recipe.title)
        .join(Recipe, Recipe.id == SavedRecommendation.recipe_id)
        .where(SavedRecommendation.user_id == user.id)
        .order_by(SavedRecommendation.saved_at.desc())
        .limit(3)
    )
    saved_rows = saved_result.all()
    if saved_rows:
        titles = [row.title for row in saved_rows]
        summary = ", ".join(titles[:2]) + ("…" if len(titles) > 2 else "")
        items.append({
            "id": "saved-recipes",
            "category": "meal",
            "title": f"{len(saved_rows)} saved recipe(s) in your collection",
            "body": f"Ready to cook? Try: {summary}. Add them to your weekly meal plan.",
            "time": (now - timedelta(hours=2)).isoformat(),
            "read": True,
            "actionLabel": "Open Planner",
            "actionRoute": "/meal-planner",
        })

    # ── 3. Streak from recommendation sessions ────────────────────────────────
    sessions_result = await db.execute(
        select(RecommendationSession)
        .where(RecommendationSession.user_id == user.id)
        .order_by(RecommendationSession.created_at.desc())
        .limit(30)
    )
    sessions = sessions_result.scalars().all()
    if sessions:
        unique_days = sorted({s.created_at.date() for s in sessions}, reverse=True)
        streak = 0
        for i, day in enumerate(unique_days):
            if day == today - timedelta(days=i):
                streak += 1
            else:
                break

        if streak >= 3:
            items.append({
                "id": f"streak-{streak}",
                "category": "health",
                "title": f"{streak}-day wellness streak!",
                "body": f"You've been actively tracking your health for {streak} consecutive days. Your wellness score is improving.",
                "time": (now - timedelta(hours=1)).isoformat(),
                "read": streak > 7,
                "actionLabel": "View Insights",
                "actionRoute": "/insights",
            })

        # ── 4. AI tip from the most recent session ────────────────────────────
        recent = sessions[0]
        ailments = recent.detected_ailments or []
        if ailments:
            items.append({
                "id": f"ai-tip-{recent.id}",
                "category": "ai",
                "title": "Personalised wellness tip ready",
                "body": (
                    f"Based on your recent query about {ailments[0]}, "
                    "we have tailored recipe suggestions to support your health goals."
                ),
                "time": recent.created_at.isoformat(),
                "read": True,
                "actionLabel": "See Suggestions",
                "actionRoute": "/recommendations",
            })

    return sorted(items, key=lambda n: n["time"], reverse=True)
