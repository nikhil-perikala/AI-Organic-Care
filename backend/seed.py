"""
Seed the recipes table with 20 AI-generated starter recipes.
Run once on EC2:  cd /home/ec2-user/app && python seed.py

Skips any title that already exists in the DB so it is safe to re-run.
"""
import asyncio
import json
import sys
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv
load_dotenv(Path(__file__).parent / ".env")

from sqlalchemy import select
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from openai import AsyncOpenAI

from app.config import settings
from app.models.recipe import Recipe, Ingredient, RecipeIngredient

# ── Recipes to seed ─────────────────────────────────────────────────────────────
# (title, meal_type, cuisine, dietary_labels, ailment_tags, health_benefits)
SEED_RECIPES = [
    ("Overnight Oats with Berries",          "breakfast", "American",       ["vegan","vegetarian"],           ["diabetes","heart"],       ["high fiber","antioxidant-rich"]),
    ("Avocado Toast with Poached Eggs",       "breakfast", "Western",        ["vegetarian"],                   ["fatigue","energy"],        ["healthy fats","high protein"]),
    ("Greek Yogurt Parfait",                  "breakfast", "Greek",          ["vegetarian","gluten-free"],     ["digestion"],               ["probiotic","calcium-rich"]),
    ("Banana Oat Pancakes",                   "breakfast", "American",       ["vegetarian","gluten-free"],     ["energy"],                  ["high fiber","potassium-rich"]),
    ("Caesar Salad with Grilled Chicken",     "lunch",     "Italian",        ["gluten-free"],                  ["weight-loss"],             ["high protein","low carb"]),
    ("Red Lentil Soup",                       "lunch",     "Middle Eastern", ["vegan","vegetarian","gluten-free"], ["anemia","diabetes"],   ["high protein","iron-rich"]),
    ("Quinoa Buddha Bowl",                    "lunch",     "Fusion",         ["vegan","vegetarian","gluten-free"], ["weight-loss","energy"],["complete protein","high fiber"]),
    ("Hummus Veggie Wrap",                    "lunch",     "Mediterranean",  ["vegan","vegetarian"],           ["cholesterol"],             ["heart healthy","high fiber"]),
    ("Tomato Basil Pasta",                    "lunch",     "Italian",        ["vegetarian"],                   [],                          ["lycopene-rich","energising"]),
    ("Tuna Nicoise Salad",                    "lunch",     "French",         ["gluten-free","dairy-free"],     ["heart","weight-loss"],     ["omega-3 rich","high protein"]),
    ("Chicken Tikka Masala",                  "dinner",    "Indian",         ["gluten-free"],                  ["fatigue"],                 ["high protein","anti-inflammatory"]),
    ("Spaghetti Bolognese",                   "dinner",    "Italian",        [],                               [],                          ["high protein","iron-rich"]),
    ("Grilled Salmon with Roasted Vegetables","dinner",    "Western",        ["gluten-free","dairy-free"],     ["heart","inflammation"],    ["omega-3 rich","anti-inflammatory"]),
    ("Butter Chicken",                        "dinner",    "Indian",         ["gluten-free"],                  ["fatigue"],                 ["high protein"]),
    ("Palak Paneer",                          "dinner",    "Indian",         ["vegetarian","gluten-free"],     ["anemia"],                  ["iron-rich","calcium-rich"]),
    ("Beef and Broccoli Stir Fry",            "dinner",    "Chinese",        ["dairy-free"],                   ["energy"],                  ["high protein","iron-rich"]),
    ("Dal Makhani",                           "dinner",    "Indian",         ["vegetarian","gluten-free"],     ["diabetes","digestion"],    ["high protein","high fiber"]),
    ("Mushroom Risotto",                      "dinner",    "Italian",        ["vegetarian","gluten-free"],     [],                          ["vitamin D","antioxidant-rich"]),
    ("Shrimp Fried Rice",                     "dinner",    "Chinese",        ["dairy-free"],                   ["energy"],                  ["high protein","low fat"]),
    ("Lamb Rogan Josh",                       "dinner",    "Indian",         ["gluten-free","dairy-free"],     ["anemia"],                  ["high protein","iron-rich"]),
]

SYSTEM_MSG = (
    "You are a professional chef and recipe developer with 20 years of experience "
    "writing cookbooks and tested recipes. You always use accurate, realistic ingredient "
    "quantities that match the serving size and cooking method. "
    "CRITICAL QUANTITY RULES:\n"
    "- Meat/poultry/seafood: 150-200 g per serving (4 servings → 600-800 g).\n"
    "- Oil in curry/stew base: 3-4 tbsp per 4 servings.\n"
    "- Onions in curry: 2 medium (≈300 g) per 4 servings.\n"
    "- Salt: 3/4–1 tsp per 4 servings.\n"
    "- Spices: precise tsp/tbsp measurements.\n"
    "- Pasta/rice/grains: 75-90 g dry per serving.\n"
    "- Liquid in braises: 150-250 ml per 4 servings.\n"
    "Use varied, realistic amounts (1½ tsp, ¾ cup) — not all round numbers."
)


def _prompt(title: str, cuisine: str, meal_type: str) -> str:
    return (
        f'Generate a complete, professionally tested recipe for "{title}" ({cuisine} cuisine, {meal_type}).\n\n'
        "Default to 4 servings. All quantities MUST be calibrated for that count.\n\n"
        "Return ONLY a JSON object:\n"
        '{\n'
        '  "title": "exact name",\n'
        '  "description": "1-2 appetising sentences",\n'
        '  "prep_time_minutes": 15,\n'
        '  "cook_time_minutes": 30,\n'
        '  "servings": 4,\n'
        '  "ingredients": [{"name": "...", "quantity": "...", "unit": "..."}],\n'
        '  "instructions": ["Complete step sentence.", "..."],\n'
        '  "nutritional_info": {"calories": 400, "protein_g": 25, "carbs_g": 35, "fat_g": 12, "fiber_g": 4},\n'
        '  "cooking_tips": ["One practical tip."]\n'
        "}\n\n"
        "Instructions: 6-9 complete sentences, no numbering prefix."
    )


async def _upsert_ingredient(session: AsyncSession, name: str) -> Ingredient:
    result = await session.execute(select(Ingredient).where(Ingredient.name == name))
    ing = result.scalar_one_or_none()
    if not ing:
        ing = Ingredient(id=uuid.uuid4(), name=name)
        session.add(ing)
        await session.flush()
    return ing


async def _seed_one(session: AsyncSession, client: AsyncOpenAI, meta: tuple) -> bool:
    title, meal_type, cuisine, dietary_labels, ailment_tags, health_benefits = meta

    existing = await session.execute(select(Recipe).where(Recipe.title == title))
    if existing.scalar_one_or_none():
        print(f"  SKIP  {title}")
        return False

    try:
        resp = await client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": SYSTEM_MSG},
                {"role": "user",   "content": _prompt(title, cuisine, meal_type)},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
            max_tokens=1600,
        )
        data = json.loads(resp.choices[0].message.content or "{}")
    except Exception as exc:
        print(f"  ERROR {title}: {exc}")
        return False

    recipe = Recipe(
        id=uuid.uuid4(),
        title=data.get("title", title),
        description=data.get("description"),
        instructions="\n".join(data.get("instructions", [])),
        prep_time_minutes=data.get("prep_time_minutes"),
        cook_time_minutes=data.get("cook_time_minutes"),
        servings=data.get("servings", 4),
        cuisine_type=cuisine,
        meal_type=meal_type,
        dietary_labels=dietary_labels,
        ailment_tags=ailment_tags,
        health_benefits=health_benefits,
        efficacy_score=0.75,
        nutritional_info=data.get("nutritional_info"),
    )
    session.add(recipe)
    await session.flush()

    for ing_data in data.get("ingredients", []):
        name = (ing_data.get("name") or "").strip()
        if not name:
            continue
        ing = await _upsert_ingredient(session, name)
        session.add(RecipeIngredient(
            id=uuid.uuid4(),
            recipe_id=recipe.id,
            ingredient_id=ing.id,
            quantity=str(ing_data.get("quantity", "")) or None,
            unit=ing_data.get("unit") or None,
        ))

    await session.commit()
    print(f"  OK    {title}")
    return True


async def main() -> None:
    engine  = create_async_engine(settings.DATABASE_URL, echo=False)
    Session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    client  = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    print(f"Seeding {len(SEED_RECIPES)} recipes…\n")
    seeded = 0
    async with Session() as session:
        for meta in SEED_RECIPES:
            ok = await _seed_one(session, client, meta)
            if ok:
                seeded += 1

    await engine.dispose()
    print(f"\nDone — {seeded} new / {len(SEED_RECIPES) - seeded} skipped.")


if __name__ == "__main__":
    asyncio.run(main())
