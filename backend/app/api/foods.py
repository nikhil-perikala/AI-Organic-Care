from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

router = APIRouter(prefix="/foods", tags=["foods"])

_FALLBACK = [
    "Tomato","Cherry tomatoes","Tomato paste","Tomato sauce",
    "Chicken breast","Chicken thighs","Chicken drumsticks","Ground chicken",
    "Beef steak","Ground beef","Pork chops","Lamb chops","Lamb mince",
    "Salmon fillet","Tuna","Shrimp","Cod","Sardines","Mackerel",
    "Eggs","Tofu","Tempeh","Paneer",
    "Whole milk","Butter","Cheddar cheese","Mozzarella","Greek yogurt",
    "Heavy cream","Coconut milk",
    "Spinach","Kale","Lettuce","Arugula","Cabbage","Broccoli","Cauliflower",
    "Zucchini","Eggplant","Carrot","Beetroot","Sweet potato","Potato",
    "Bell pepper","Chilli pepper","Cucumber","Onion","Red onion",
    "Spring onion","Garlic","Ginger","Celery","Asparagus","Peas","Edamame",
    "Mushroom","Portobello mushroom","Shiitake mushroom",
    "Apple","Banana","Orange","Mango","Pineapple","Blueberries",
    "Strawberries","Raspberries","Grapes","Peach","Pear","Lemon","Lime","Avocado",
    "Basmati rice","Brown rice","Jasmine rice","Pasta","Spaghetti","Noodles",
    "Oats","Quinoa","Barley","Wheat flour","Bread",
    "Lentils","Red lentils","Chickpeas","Black beans","Kidney beans","Mung beans",
    "Almonds","Walnuts","Cashews","Peanuts","Pistachios","Chia seeds",
    "Flaxseeds","Sesame seeds",
    "Olive oil","Coconut oil","Sunflower oil","Vegetable oil","Sesame oil",
    "Honey","Sugar","Brown sugar","Maple syrup",
    "Salt","Black pepper","Cumin","Turmeric","Coriander","Paprika",
    "Cinnamon","Cardamom","Bay leaves","Oregano","Basil","Thyme","Rosemary",
    "Parsley","Cilantro","Dill","Mint","Chilli powder","Garam masala","Curry powder",
    "Soy sauce","Fish sauce","Oyster sauce","Worcestershire sauce",
    "Vinegar","Apple cider vinegar","Balsamic vinegar",
    "Chicken stock","Beef stock","Vegetable stock",
    "Baking powder","Baking soda","Cornstarch",
    "Dark chocolate","Cocoa powder","Vanilla extract",
]


def _local_fallback(q: str, limit: int) -> list[dict]:
    q_lower = q.strip().lower()
    matches = [f for f in _FALLBACK if q_lower in f.lower()][:limit]
    return [
        {"fdc_id": i + 1, "description": name, "data_type": "ingredient",
         "calories": None, "protein": None, "carbs": None, "fat": None}
        for i, name in enumerate(matches)
    ]


@router.get("/search")
async def search_usda_foods(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    try:
        rows = await db.execute(
            text("""
                SELECT fdc_id, description, data_type,
                       calories, protein, carbs, fat
                FROM food_ai_search
                WHERE description ILIKE :pattern
                ORDER BY
                    CASE WHEN lower(description) = lower(:q) THEN 0
                         WHEN lower(description) LIKE lower(:q) || '%' THEN 1
                         ELSE 2
                    END,
                    length(description)
                LIMIT :lim
            """),
            {"pattern": f"%{q}%", "q": q, "lim": limit},
        )
        results = rows.mappings().all()
        if results:
            return [dict(r) for r in results]
    except Exception:
        await db.rollback()

    return _local_fallback(q, limit)
