from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User, UserProfile
from app.schemas.user import UserOut, UserProfileUpdate

router = APIRouter(prefix="/users", tags=["users"])


@router.get("/me", response_model=UserOut)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.get("/me/profile")
async def get_profile(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = result.scalar_one_or_none()
    if not profile:
        return {}
    return {
        "dietary_preferences": profile.dietary_preferences or [],
        "allergies": profile.allergies or [],
        "health_goals": profile.health_goals or [],
        "disliked_ingredients": profile.disliked_ingredients or [],
        "liked_cuisines": profile.liked_cuisines or [],
        "serving_size": profile.serving_size,
    }


@router.put("/me/profile")
async def update_profile(
    payload: UserProfileUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(UserProfile).where(UserProfile.user_id == user.id))
    profile = result.scalar_one_or_none()

    if not profile:
        profile = UserProfile(user_id=user.id)
        db.add(profile)

    updates = payload.model_dump(exclude_none=True)
    for field, value in updates.items():
        setattr(profile, field, value)

    await db.commit()
    await db.refresh(profile)
    return {"message": "Profile updated", "profile": updates}
