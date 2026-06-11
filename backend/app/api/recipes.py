import json
import re
import uuid
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, cast
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.core.deps import get_current_user
from app.models.recipe import Recipe, RecipeIngredient
from app.models.feedback import SavedRecommendation
from app.models.user import User, UserPantry
from app.schemas.recipe import RecipeOut, GeneratedRecipeOut, AiIngredientOut
from app.services.embedding_service import get_openai_client
from app.config import settings

router = APIRouter(prefix="/recipes", tags=["recipes"])


class PantryRecipeRequest(BaseModel):
    ingredients: List[str]


def _extract_json(text: str):
    """Strip markdown fences and parse JSON."""
    text = re.sub(r"```(?:json)?\n?", "", text).strip().rstrip("`").strip()
    return json.loads(text)


def _parse_instructions(raw: Optional[str]) -> List[str]:
    """Split raw instruction text into a clean list of steps."""
    if not raw:
        return []
    lines = [l.strip() for l in raw.splitlines() if l.strip()]
    steps = []
    for line in lines:
        cleaned = re.sub(r'^(\d+[\.\):\-]\s*|step\s*\d+[\.\):\-]?\s*)', '', line, flags=re.IGNORECASE)
        if cleaned:
            steps.append(cleaned)
    return steps if steps else [raw.strip()]


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
        stmt = stmt.where(cast(Recipe.ailment_tags, JSONB).contains([ailment]))
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


@router.get("/generate", response_model=GeneratedRecipeOut)
async def generate_recipe(
    q: str = Query(..., min_length=1, max_length=150),
    db: AsyncSession = Depends(get_db),
):
    """Search DB for a recipe by name; generate one with AI if not found."""
    q_clean = q.strip()

    result = await db.execute(
        select(Recipe)
        .where(Recipe.title.ilike(f"%{q_clean}%"))
        .options(selectinload(Recipe.recipe_ingredients).selectinload(RecipeIngredient.ingredient))
        .order_by(Recipe.efficacy_score.desc())
        .limit(1)
    )
    recipe = result.scalar_one_or_none()

    if recipe:
        steps = _parse_instructions(recipe.instructions)
        ings = [
            AiIngredientOut(name=ri.ingredient.name, quantity=ri.quantity, unit=ri.unit)
            for ri in recipe.recipe_ingredients
            if ri.ingredient
        ]
        return GeneratedRecipeOut(
            id=str(recipe.id),
            is_ai_generated=False,
            title=recipe.title,
            description=recipe.description,
            prep_time_minutes=recipe.prep_time_minutes,
            cook_time_minutes=recipe.cook_time_minutes,
            servings=recipe.servings,
            meal_type=recipe.meal_type,
            cuisine_type=recipe.cuisine_type,
            ingredients=ings,
            instructions=steps,
            nutritional_info=recipe.nutritional_info,
            cooking_tips=[],
            dietary_labels=recipe.dietary_labels or [],
            health_benefits=recipe.health_benefits or [],
            ailment_tags=recipe.ailment_tags or [],
            image_url=recipe.image_url,
        )

    # Not found in DB — generate with AI
    client = get_openai_client()
    prompt = f"""Generate a complete recipe for "{q_clean}". Return ONLY a JSON object with these exact fields:
{{
  "title": "Recipe name",
  "description": "Brief 1-2 sentence description",
  "prep_time_minutes": 10,
  "cook_time_minutes": 20,
  "servings": 2,
  "meal_type": "Breakfast or Lunch or Dinner or Snacks or Beverage",
  "cuisine_type": "e.g. Indian, Italian, Chinese",
  "ingredients": [
    {{"name": "ingredient", "quantity": "2", "unit": "cups"}}
  ],
  "instructions": [
    "Heat oil in a pan over medium heat.",
    "Add onions and cook until golden."
  ],
  "nutritional_info": {{
    "calories": 320,
    "protein_g": 18,
    "carbs_g": 30,
    "fat_g": 12,
    "fiber_g": 4
  }},
  "cooking_tips": ["Tip 1", "Tip 2"],
  "dietary_labels": ["Vegetarian"],
  "health_benefits": ["High protein"],
  "ailment_tags": []
}}
Provide realistic values. Instructions: 6-10 complete sentences (no numbering prefix). Keep each step clear."""

    response = await client.chat.completions.create(
        model=settings.OPENAI_CHAT_MODEL,
        messages=[{"role": "user", "content": prompt}],
        response_format={"type": "json_object"},
        temperature=0.3,
        max_tokens=1200,
    )

    data = json.loads(response.choices[0].message.content)
    ings = [AiIngredientOut(**i) for i in data.get("ingredients", [])]
    return GeneratedRecipeOut(
        id=None,
        is_ai_generated=True,
        title=data.get("title", q_clean),
        description=data.get("description"),
        prep_time_minutes=data.get("prep_time_minutes"),
        cook_time_minutes=data.get("cook_time_minutes"),
        servings=data.get("servings", 2),
        meal_type=data.get("meal_type"),
        cuisine_type=data.get("cuisine_type"),
        ingredients=ings,
        instructions=data.get("instructions", []),
        nutritional_info=data.get("nutritional_info"),
        cooking_tips=data.get("cooking_tips", []),
        dietary_labels=data.get("dietary_labels", []),
        health_benefits=data.get("health_benefits", []),
        ailment_tags=data.get("ailment_tags", []),
        image_url=None,
    )


@router.post("/claude-pantry")
async def claude_pantry_recipes(request: PantryRecipeRequest):
    """Generate 3 recipes from a user-supplied ingredient list using OpenAI."""
    if not request.ingredients:
        raise HTTPException(status_code=400, detail="No ingredients provided")

    ing_str = ", ".join(request.ingredients)
    prompt = f"""I have these ingredients: {ing_str}

Generate exactly 3 recipes using only these ingredients (common staples like salt, pepper, oil are fine).
Return ONLY a valid JSON array of exactly 3 objects — no markdown, no backticks, no extra text.
[
  {{
    "name": "Recipe Name",
    "time": 25,
    "match": 80,
    "ingredients": ["2 eggs", "1 clove garlic, minced"],
    "steps": ["Heat oil in a pan.", "Add garlic and cook 1 minute."],
    "icon": "egg"
  }}
]
Rules:
- "time": total cook+prep minutes as integer
- "match": % of required ingredients covered by the provided list (0-100 integer)
- "ingredients": complete list with quantities as plain strings
- "steps": 4-6 clear cooking steps as strings
- "icon": single word from: egg, meat, fish, leaf, salad, soup, pizza, bread, flame, carrot"""

    try:
        client = get_openai_client()
        response = await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.5,
            max_tokens=1500,
        )
        raw = response.choices[0].message.content or "[]"
        data = json.loads(raw)
        # OpenAI json_object always returns an object; unwrap if needed
        if isinstance(data, dict):
            data = data.get("recipes", list(data.values())[0] if data else [])
        return data[:3]
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recipe generation failed: {e}")


@router.get("/claude-explore")
async def claude_explore_recipe(q: str = Query(..., min_length=1, max_length=200)):
    """Generate a single recipe for any query using OpenAI."""
    prompt = f"""Generate a complete recipe for: {q}

Return ONLY a valid JSON object — no markdown, no backticks, no extra text.
{{
  "name": "Recipe Name",
  "time": 30,
  "servings": 2,
  "ingredients": ["2 eggs", "1 onion, diced"],
  "steps": ["Step one.", "Step two."],
  "tip": "One useful chef's tip."
}}
Rules:
- "time": total time in minutes as integer
- "servings": number as integer
- "ingredients": complete list with quantities as plain strings
- "steps": 5-7 clear cooking instructions
- "tip": one practical cooking tip"""

    try:
        client = get_openai_client()
        response = await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[{"role": "user", "content": prompt}],
            response_format={"type": "json_object"},
            temperature=0.4,
            max_tokens=1200,
        )
        raw = response.choices[0].message.content or "{}"
        return json.loads(raw)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Recipe generation failed: {e}")


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
