from typing import List
from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.models.user import User
from app.models.feedback import UserFeedback, SavedRecommendation
from app.schemas.feedback import FeedbackCreate, FeedbackOut

router = APIRouter(prefix="/feedback", tags=["feedback"])


@router.post("", response_model=FeedbackOut, status_code=status.HTTP_201_CREATED)
async def submit_feedback(
    payload: FeedbackCreate,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    fb = UserFeedback(
        user_id=user.id if user else None,
        session_id=payload.session_id,
        recipe_id=payload.recipe_id,
        feedback_type=payload.feedback_type,
        comment=payload.comment,
    )

    if payload.feedback_type == "save" and user and payload.recipe_id:
        existing = await db.execute(
            select(SavedRecommendation).where(
                SavedRecommendation.user_id == user.id,
                SavedRecommendation.recipe_id == payload.recipe_id,
            )
        )
        if not existing.scalar_one_or_none():
            saved = SavedRecommendation(user_id=user.id, recipe_id=payload.recipe_id)
            db.add(saved)

    db.add(fb)
    await db.commit()
    await db.refresh(fb)
    return fb


@router.get("/saved", response_model=List[dict])
async def get_saved_recipes(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(SavedRecommendation).where(SavedRecommendation.user_id == user.id)
    )
    saved = result.scalars().all()
    return [{"id": str(s.id), "recipe_id": str(s.recipe_id), "saved_at": s.saved_at.isoformat()} for s in saved]
