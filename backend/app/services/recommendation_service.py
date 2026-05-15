"""
Orchestrates the full recommendation flow:
query → RAG pipeline → recipe hydration → LLM explanation → session persistence.
"""
import uuid
import time
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.user import User, UserProfile, UserPantry
from app.models.recipe import Recipe, RecipeIngredient, Ingredient
from app.models.feedback import RecommendationSession
from app.schemas.recommendation import (
    RecommendationResponse, MealRecommendation, ShoppingItem
)
from app.services.rag_service import run_rag_pipeline
from app.services.llm_service import generate_explanation


_ALLERGY_TO_LABEL = {
    "gluten": "gluten-free",
    "dairy": "dairy-free",
    "nuts": "nut-free",
    "peanuts": "nut-free",
    "fish": "pescatarian",
    "shellfish": "pescatarian",
    "eggs": "vegan",
    "soy": None,
}

_DIET_TO_LABEL = {
    "vegan": "vegan",
    "vegetarian": "vegetarian",
    "paleo": "paleo",
    "keto": "keto",
    "gluten-free": "gluten-free",
    "dairy-free": "dairy-free",
}


def _apply_profile_ranking(recipe_rows: List[dict], user_profile: dict) -> List[dict]:
    """Re-rank recipes based on dietary preferences and allergies."""
    if not user_profile or not recipe_rows:
        return recipe_rows

    allergies = {a.lower() for a in (user_profile.get("allergies") or [])}
    prefs = {p.lower() for p in (user_profile.get("dietary_preferences") or [])}
    goals = {g.lower() for g in (user_profile.get("health_goals") or [])}
    disliked = {d.lower() for d in (user_profile.get("disliked_ingredients") or [])}

    def score(row: dict) -> float:
        base = row.get("final_score", 0.0)
        labels = {lbl.lower() for lbl in (row.get("dietary_labels") or [])}
        ailment_tags = {t.lower() for t in (row.get("ailment_tags") or [])}
        benefits = {b.lower() for b in (row.get("health_benefits") or [])}

        # Dietary preference match bonus
        for pref, label in _DIET_TO_LABEL.items():
            if pref in prefs and label in labels:
                base += 0.15

        # Allergy penalty: deduct if required label is missing
        for allergy, required_label in _ALLERGY_TO_LABEL.items():
            if allergy in allergies and required_label and required_label not in labels:
                base -= 0.25

        # Health goal match bonus
        combined = ailment_tags | benefits
        for goal in goals:
            if any(goal in item for item in combined):
                base += 0.08

        # Disliked ingredients light penalty (can't check ingredients without DB)
        # Will be reinforced in the LLM prompt
        _ = disliked

        return base

    ranked = sorted(recipe_rows, key=score, reverse=True)
    return ranked


async def _get_user_context(user: Optional[User], db: AsyncSession) -> tuple[dict, List[str]]:
    """Load user profile and pantry ingredient names."""
    if not user:
        return {}, []

    profile_result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == user.id)
    )
    profile = profile_result.scalar_one_or_none()
    profile_dict = {}
    if profile:
        profile_dict = {
            "dietary_preferences": profile.dietary_preferences or [],
            "allergies": profile.allergies or [],
            "health_goals": profile.health_goals or [],
            "disliked_ingredients": profile.disliked_ingredients or [],
        }

    pantry_result = await db.execute(
        select(UserPantry).where(UserPantry.user_id == user.id)
    )
    pantry_items = pantry_result.scalars().all()
    pantry_names = [p.ingredient_name.lower() for p in pantry_items]

    return profile_dict, pantry_names


async def _hydrate_recipe(recipe_row: dict, pantry: List[str], db: AsyncSession) -> dict:
    """Load full recipe with ingredients and compute missing ingredients."""
    recipe_id = recipe_row["id"]
    result = await db.execute(
        select(Recipe)
        .where(Recipe.id == recipe_id)
        .options(selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient))
    )
    recipe = result.scalar_one_or_none()
    if not recipe:
        return {}

    pantry_set = {p.lower().strip() for p in pantry}
    ingredients_out = []
    missing = []

    for ri in recipe.recipe_ingredients:
        ing = ri.ingredient
        ing_name = ing.name.lower()
        in_pantry = any(ing_name in p or p in ing_name for p in pantry_set)
        ingredients_out.append({
            "name": ing.name,
            "quantity": ri.quantity,
            "unit": ri.unit,
            "notes": ri.notes,
            "is_optional": ri.is_optional,
            "in_pantry": in_pantry,
            "health_benefits": ing.health_benefits or [],
        })
        if not in_pantry and not ri.is_optional:
            missing.append(ShoppingItem(
                ingredient_name=ing.name,
                quantity=ri.quantity,
                unit=ri.unit,
                reason=f"Required for {recipe.title}",
            ))

    return {
        "recipe": recipe,
        "ingredients_out": ingredients_out,
        "missing": missing,
    }


async def build_recommendations(
    query: str,
    user: Optional[User],
    use_pantry: bool,
    db: AsyncSession,
) -> RecommendationResponse:
    t0 = time.monotonic()

    user_profile, pantry = await _get_user_context(user, db)
    effective_pantry = pantry if use_pantry else []

    rag = await run_rag_pipeline(query, effective_pantry, db)
    ailment_tags = rag["ailment_tags"]
    knowledge_chunks = [dict(c) for c in rag["knowledge_chunks"]]
    usda_foods = rag.get("usda_foods", [])
    recipe_rows = _apply_profile_ranking(rag["recipes"], user_profile)

    llm_result = await generate_explanation(
        query, ailment_tags, knowledge_chunks, recipe_rows,
        user_profile, effective_pantry, usda_foods,
    )

    meal_recommendations: List[MealRecommendation] = []
    all_missing: List[ShoppingItem] = []
    recipe_ids_returned = []

    for rank, row in enumerate(recipe_rows, 1):
        hydrated = await _hydrate_recipe(row, effective_pantry, db)
        if not hydrated:
            continue
        recipe = hydrated["recipe"]
        recipe_ids_returned.append(str(recipe.id))

        meal_recommendations.append(MealRecommendation(
            rank=rank,
            recipe_id=recipe.id,
            title=recipe.title,
            description=recipe.description,
            meal_type=recipe.meal_type,
            prep_time_minutes=recipe.prep_time_minutes,
            cook_time_minutes=recipe.cook_time_minutes,
            servings=recipe.servings,
            efficacy_score=recipe.efficacy_score,
            health_benefits=recipe.health_benefits or [],
            dietary_labels=recipe.dietary_labels or [],
            ailment_addressed=recipe.ailment_tags or [],
            ingredients=hydrated["ingredients_out"],
            missing_ingredients=hydrated["missing"],
            image_url=recipe.image_url,
            source_url=recipe.source_url,
            nutritional_info=recipe.nutritional_info,
        ))
        all_missing.extend(hydrated["missing"])

    # Deduplicate shopping list by ingredient name
    seen = set()
    shopping_list: List[ShoppingItem] = []
    for item in all_missing:
        if item.ingredient_name.lower() not in seen:
            seen.add(item.ingredient_name.lower())
            shopping_list.append(item)

    knowledge_sources = list({
        c.get("source_title") or c.get("source_url") or "Unknown"
        for c in knowledge_chunks
        if c.get("source_title") or c.get("source_url")
    })[:5]

    session_id = uuid.uuid4()
    latency_ms = int((time.monotonic() - t0) * 1000)

    session = RecommendationSession(
        id=session_id,
        user_id=user.id if user else None,
        user_query=query,
        detected_ailments=ailment_tags,
        retrieved_chunk_ids=[str(c.get("id", "")) for c in knowledge_chunks[:8]],
        recipe_ids_returned=recipe_ids_returned,
        ai_explanation=llm_result["ai_explanation"],
        latency_ms=latency_ms,
    )
    db.add(session)
    await db.commit()

    return RecommendationResponse(
        session_id=session_id,
        query=query,
        detected_ailments=ailment_tags,
        ai_explanation=llm_result["ai_explanation"],
        evidence_summary=llm_result["evidence_summary"],
        recommendations=meal_recommendations,
        shopping_list=shopping_list,
        knowledge_sources=knowledge_sources,
    )
