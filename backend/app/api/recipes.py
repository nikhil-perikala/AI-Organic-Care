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
    system_msg = (
        "You are a professional chef and recipe developer with 20 years of experience "
        "writing cookbooks and tested recipes. You always use accurate, realistic ingredient "
        "quantities that match the serving size and cooking method. Your recipes are "
        "indistinguishable from those published in professional cookbooks. "
        "CRITICAL RULES for quantities:\n"
        "- Scale all ingredients to match the exact serving count.\n"
        "- For meat/poultry/seafood: use 150-200 g per serving (e.g. 4 servings → 600-800 g).\n"
        "- For oil in a curry/stew base: 3-4 tbsp per 4 servings, never less than 2 tbsp total.\n"
        "- For onions in a curry: 2 medium onions (≈300 g) per 4 servings.\n"
        "- For salt: 3/4 – 1 tsp per 4 servings; adjust to taste.\n"
        "- For spices: use precise measurements (tsp/tbsp), not vague terms.\n"
        "- For pasta/rice/grains: 75-90 g dry weight per serving.\n"
        "- For liquid in braises/curries: 150-250 ml per 4 servings (enough to braise, not drown).\n"
        "Never round all quantities to round numbers — varied, realistic amounts (e.g. 1½ tsp, ¾ cup) "
        "signal a tested recipe."
    )

    prompt = f"""Generate a complete, professionally tested recipe for "{q_clean}".

The recipe must use 4 servings as the default unless the dish is inherently single-serve.
All ingredient quantities MUST be calibrated for that exact serving count.

Return ONLY a JSON object with these exact fields:
{{
  "title": "Exact recipe name",
  "description": "Appetising 1–2 sentence description highlighting the dish character",
  "prep_time_minutes": 15,
  "cook_time_minutes": 35,
  "servings": 4,
  "meal_type": "Lunch",
  "cuisine_type": "Indian",
  "ingredients": [
    {{"name": "bone-in mutton", "quantity": "750", "unit": "g"}},
    {{"name": "cooking oil", "quantity": "4", "unit": "tbsp"}},
    {{"name": "onion", "quantity": "2 medium", "unit": ""}},
    {{"name": "ginger-garlic paste", "quantity": "2", "unit": "tbsp"}},
    {{"name": "salt", "quantity": "1", "unit": "tsp"}}
  ],
  "instructions": [
    "Heat 4 tablespoons of oil in a heavy-bottomed pot over medium-high heat.",
    "Add the sliced onions and fry, stirring often, for 12–15 minutes until deep golden brown.",
    "Stir in the ginger-garlic paste and cook for 2 minutes until the raw smell disappears.",
    "Add the mutton pieces and sear on all sides for 5–6 minutes until lightly browned.",
    "Sprinkle in all the ground spices and salt; stir well to coat every piece.",
    "Pour in 250 ml of warm water, bring to a boil, then reduce heat to low.",
    "Cover tightly and simmer for 50–60 minutes, stirring every 15 minutes, until the mutton is tender.",
    "Uncover, raise heat to medium, and cook off excess moisture for 5 minutes until the gravy coats the meat.",
    "Garnish with fresh coriander and serve hot with rice or naan."
  ],
  "nutritional_info": {{
    "calories": 420,
    "protein_g": 36,
    "carbs_g": 8,
    "fat_g": 28,
    "fiber_g": 2
  }},
  "cooking_tips": [
    "Marinate the mutton in yoghurt and spices for 2 hours beforehand for deeper flavour.",
    "Bone-in pieces give richer gravy than boneless."
  ],
  "dietary_labels": ["Gluten-Free"],
  "health_benefits": ["High in protein", "Rich in iron"],
  "ailment_tags": []
}}

IMPORTANT: The JSON above is only a structural example with mutton quantities for illustration.
Generate the ACTUAL recipe for "{q_clean}" using correct quantities for THAT dish.
Instructions must be 7–10 complete, detailed sentences — no numbering prefix, no bullet points."""

    response = await client.chat.completions.create(
        model=settings.OPENAI_CHAT_MODEL,
        messages=[
            {"role": "system", "content": system_msg},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.2,
        max_tokens=1600,
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
    pantry_system = (
        "You are a professional chef. Generate recipes with accurate, realistic ingredient quantities. "
        "All amounts must be calibrated for 2 servings unless the dish is naturally single-serve. "
        "Use standard culinary measurements: tsp, tbsp, cups, g, ml, etc. "
        "Common sense proportions: 1 egg per serving, 150-200 g meat per serving, "
        "1-2 tbsp oil per dish, 3/4 tsp salt per 2 servings."
    )
    prompt = f"""I have these ingredients available: {ing_str}
(Common pantry staples like salt, pepper, oil, water, and basic spices are also available.)

Generate exactly 3 different recipes I can make. Each recipe must serve 2 people.
All ingredient quantities must be realistic and accurately calibrated for 2 servings.

Return a JSON object with a single key "recipes" containing an array of exactly 3 objects:
{{
  "recipes": [
    {{
      "name": "Recipe Name",
      "time": 25,
      "match": 85,
      "ingredients": ["2 large eggs", "1 tbsp olive oil", "1/2 tsp salt", "1/4 tsp black pepper"],
      "steps": [
        "Heat 1 tablespoon of olive oil in a non-stick pan over medium heat.",
        "Crack the eggs directly into the pan and season with salt and pepper.",
        "Cook for 3-4 minutes until whites are set but yolks are still slightly runny.",
        "Slide onto a plate and serve immediately."
      ],
      "icon": "egg"
    }}
  ]
}}
Rules:
- "time": total prep + cook minutes as a realistic integer
- "match": % of the recipe's required ingredients that are covered by my list (0–100 integer)
- "ingredients": every ingredient with precise quantity and unit as a plain string
- "steps": 4–6 clear, detailed cooking steps as strings (no numbering prefix)
- "icon": one word from: egg, meat, fish, leaf, salad, soup, pizza, bread, flame, carrot"""

    try:
        client = get_openai_client()
        response = await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[
                {"role": "system", "content": pantry_system},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.3,
            max_tokens=1800,
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
    explore_system = (
        "You are a professional chef and food writer. Every recipe you write uses accurate, "
        "realistic quantities that a home cook would actually use. Quantities must match the serving count. "
        "Do not round all values to the nearest whole number — vary them naturally (e.g. 1½ tsp, 3 tbsp, 400 g). "
        "Standard proportions: 150-200 g meat per serving, 1-2 tbsp oil per dish base, "
        "75-90 g dry pasta/rice per serving, 3/4 tsp salt per 4 servings."
    )
    prompt = f"""Write a complete, professionally tested recipe for: {q}

The recipe should serve 4 people. Calibrate ALL ingredient quantities to 4 servings precisely.

Return ONLY a JSON object:
{{
  "name": "Dish name",
  "time": 45,
  "servings": 4,
  "ingredients": [
    "600 g bone-in chicken pieces",
    "3 tbsp cooking oil",
    "2 medium onions, finely sliced",
    "1 tbsp ginger-garlic paste",
    "1 tsp cumin seeds",
    "1 tsp coriander powder",
    "½ tsp turmeric powder",
    "1 tsp garam masala",
    "¾ tsp salt (or to taste)",
    "200 ml warm water",
    "2 tbsp fresh coriander, chopped"
  ],
  "steps": [
    "Step one with precise technique and timing.",
    "Step two continuing the process.",
    "Step three.",
    "Step four.",
    "Step five.",
    "Step six."
  ],
  "tip": "One specific, actionable chef's tip for this dish."
}}
Rules:
- "time": realistic total cook + prep time in minutes
- "servings": always 4
- "ingredients": every ingredient with exact quantity and unit; be as specific as a cookbook
- "steps": 6–8 clear, detailed instructions (no numbering prefix, no bullet points)
- "tip": one concrete technique tip, not generic advice"""

    try:
        client = get_openai_client()
        response = await client.chat.completions.create(
            model=settings.OPENAI_CHAT_MODEL,
            messages=[
                {"role": "system", "content": explore_system},
                {"role": "user", "content": prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=1400,
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
