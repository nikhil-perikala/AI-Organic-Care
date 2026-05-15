import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.core.deps import get_current_user
from app.models.recipe import Recipe, RecipeIngredient
from app.models.feedback import SavedRecommendation
from app.models.user import User, UserPantry
from app.schemas.recipe import RecipeOut

router = APIRouter(prefix="/recipes", tags=["recipes"])


@router.get("", response_model=List[RecipeOut])
async def list_recipes(
    ailment: Optional[str] = Query(None, description="Filter by ailment tag"),
    meal_type: Optional[str] = Query(None),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Recipe).options(
        selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient)
    )
    if ailment:
        stmt = stmt.where(Recipe.ailment_tags.contains([ailment]))
    if meal_type:
        stmt = stmt.where(Recipe.meal_type == meal_type)

    stmt = stmt.order_by(Recipe.efficacy_score.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


# NOTE: named routes must be declared before /{recipe_id} to avoid route conflicts

@router.get("/from-pantry", response_model=List[RecipeOut])
async def recipes_from_pantry(
    limit: int = Query(default=6, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return recipes that can be made (fully or partially) from the user's pantry."""
    pantry_result = await db.execute(
        select(UserPantry).where(UserPantry.user_id == user.id)
    )
    pantry_items = pantry_result.scalars().all()

    if not pantry_items:
        return []

    pantry_names = {item.ingredient_name.strip().lower() for item in pantry_items}

    recipes_result = await db.execute(
        select(Recipe)
        .options(selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient))
        .order_by(Recipe.efficacy_score.desc())
        .limit(200)
    )
    recipes = recipes_result.scalars().all()

    scored: list[tuple[Recipe, float]] = []
    for recipe in recipes:
        ing_names = {
            ri.ingredient.name.strip().lower()
            for ri in recipe.recipe_ingredients
            if ri.ingredient
        }
        if not ing_names:
            continue
        matches = sum(
            1 for p in pantry_names
            if any(p in i or i in p for i in ing_names)
        )
        if matches > 0:
            scored.append((recipe, matches / len(ing_names)))

    scored.sort(key=lambda x: (-x[1], -x[0].efficacy_score))
    return [r for r, _ in scored[:limit]]


@router.get("/favourites", response_model=List[RecipeOut])
async def list_favourites(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    stmt = (
        select(Recipe)
        .join(SavedRecommendation, SavedRecommendation.recipe_id == Recipe.id)
        .where(SavedRecommendation.user_id == user.id)
        .options(
            selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient)
        )
        .order_by(SavedRecommendation.saved_at.desc())
    )
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{recipe_id}", response_model=RecipeOut)
async def get_recipe(recipe_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Recipe)
        .where(Recipe.id == recipe_id)
        .options(selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient))
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")
    return recipe


@router.post("/{recipe_id}/favourite")
async def toggle_favourite(
    recipe_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    recipe = await db.get(Recipe, recipe_id)
    if not recipe:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    existing = await db.execute(
        select(SavedRecommendation).where(
            SavedRecommendation.user_id == user.id,
            SavedRecommendation.recipe_id == recipe_id,
        )
    )
    saved = existing.scalar_one_or_none()

    if saved:
        await db.delete(saved)
        await db.commit()
        return {"saved": False}

    db.add(SavedRecommendation(user_id=user.id, recipe_id=recipe_id))
    await db.commit()
    return {"saved": True}
