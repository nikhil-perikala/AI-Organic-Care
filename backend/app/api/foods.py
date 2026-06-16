from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.recipe import Ingredient

router = APIRouter(prefix="/foods", tags=["foods"])

# Common pantry ingredients — used when the DB has no match
_FALLBACK = [
    "Chicken breast","Chicken thighs","Chicken drumsticks","Ground chicken",
    "Beef steak","Ground beef","Pork chops","Pork belly","Lamb chops","Lamb mince",
    "Salmon fillet","Tuna","Shrimp","Cod","Sardines","Mackerel",
    "Eggs","Tofu","Tempeh","Paneer",
    "Whole milk","Skimmed milk","Butter","Cheddar cheese","Mozzarella",
    "Greek yogurt","Heavy cream","Coconut milk","Condensed milk",
    "Spinach","Kale","Lettuce","Arugula","Chard","Cabbage",
    "Broccoli","Cauliflower","Zucchini","Eggplant","Corn",
    "Carrot","Beetroot","Sweet potato","Potato","Yam",
    "Tomato","Cherry tomatoes","Bell pepper","Chilli pepper","Cucumber",
    "Onion","Red onion","Spring onion","Leek","Shallots",
    "Garlic","Ginger","Celery","Asparagus","Okra","Peas","Edamame",
    "Mushroom","Portobello mushroom","Shiitake mushroom",
    "Apple","Banana","Orange","Mango","Pineapple","Papaya",
    "Blueberries","Strawberries","Raspberries","Blackberries",
    "Grapes","Peach","Pear","Plum","Watermelon","Lemon","Lime","Avocado",
    "Basmati rice","Brown rice","Jasmine rice","Arborio rice",
    "Pasta","Spaghetti","Penne","Macaroni","Noodles",
    "Oats","Rolled oats","Quinoa","Barley","Wheat flour","Bread","Cornmeal",
    "Lentils","Red lentils","Chickpeas","Black beans","Kidney beans",
    "Soybeans","Mung beans","Pinto beans","Navy beans",
    "Almonds","Walnuts","Cashews","Peanuts","Pistachios","Hazelnuts","Pecans",
    "Chia seeds","Flaxseeds","Sunflower seeds","Pumpkin seeds","Sesame seeds",
    "Olive oil","Coconut oil","Sunflower oil","Vegetable oil","Sesame oil",
    "Honey","Sugar","Brown sugar","Maple syrup","Agave syrup","Stevia",
    "Salt","Black pepper","Cumin","Turmeric","Coriander","Paprika",
    "Cinnamon","Cardamom","Cloves","Nutmeg","Star anise","Bay leaves",
    "Oregano","Basil","Thyme","Rosemary","Parsley","Cilantro","Dill","Mint",
    "Chilli powder","Garam masala","Curry powder","Mustard seeds",
    "Soy sauce","Fish sauce","Oyster sauce","Worcestershire sauce",
    "Tomato paste","Tomato sauce","Coconut cream","Tahini","Miso paste",
    "Vinegar","Apple cider vinegar","Balsamic vinegar","Rice vinegar",
    "Chicken stock","Beef stock","Vegetable stock",
    "Baking powder","Baking soda","Yeast","Cornstarch","Arrowroot",
    "Dark chocolate","Cocoa powder","Vanilla extract",
    "Almond flour","Coconut flour","Chickpea flour",
]


@router.get("/search")
async def search_usda_foods(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    q_clean = q.strip()

    # ── 1. Query the ingredients table (seeded with recipe ingredients) ────────
    try:
        result = await db.execute(
            select(Ingredient.name)
            .where(Ingredient.name.ilike(f"%{q_clean}%"))
            .order_by(func.length(Ingredient.name))
            .limit(limit)
        )
        db_names = [row.name for row in result.all()]
    except Exception:
        db_names = []

    # ── 2. Fallback: filter hardcoded list for anything not covered by DB ──────
    q_lower = q_clean.lower()
    fallback = [f for f in _FALLBACK if q_lower in f.lower() and f not in db_names]

    names = db_names + fallback
    names = list(dict.fromkeys(names))[:limit]  # deduplicate, keep order

    return [
        {
            "fdc_id": i + 1,
            "description": name,
            "data_type": "ingredient",
            "calories": None,
            "protein": None,
            "carbs": None,
            "fat": None,
        }
        for i, name in enumerate(names)
    ]
