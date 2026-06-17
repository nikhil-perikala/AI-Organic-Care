from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db

router = APIRouter(prefix="/foods", tags=["foods"])

_FALLBACK = [
    # Vegetables
    "Tomato", "Cherry tomatoes", "Tomato paste", "Tomato sauce",
    "Spinach", "Kale", "Lettuce", "Arugula", "Cabbage", "Broccoli", "Cauliflower",
    "Zucchini", "Eggplant", "Carrot", "Beetroot", "Sweet potato", "Potato",
    "Bell pepper", "Chilli pepper", "Green chilli", "Red chilli", "Cucumber",
    "Onion", "Red onion", "Spring onion", "Shallots", "Garlic", "Ginger",
    "Celery", "Asparagus", "Peas", "Edamame", "Corn", "Baby corn",
    "Mushroom", "Portobello mushroom", "Shiitake mushroom", "Oyster mushroom",
    "Bitter gourd", "Bottle gourd", "Ridge gourd", "Snake gourd", "Drumstick",
    "Fenugreek leaves", "Curry leaves", "Moringa leaves",
    "Radish", "Turnip", "Parsnip", "Leek", "Artichoke", "Fennel",
    "Okra", "Lady finger", "Taro root", "Yam",
    # Fruits
    "Apple", "Banana", "Orange", "Mango", "Pineapple", "Blueberries",
    "Strawberries", "Raspberries", "Grapes", "Peach", "Pear", "Lemon", "Lime",
    "Avocado", "Papaya", "Guava", "Pomegranate", "Watermelon", "Cantaloupe",
    "Kiwi", "Fig", "Date", "Jackfruit", "Litchi", "Passion fruit",
    "Tamarind", "Kokum", "Amla", "Star fruit", "Dragon fruit",
    # Proteins - Meat & Seafood
    "Chicken breast", "Chicken thighs", "Chicken drumsticks", "Ground chicken",
    "Whole chicken", "Chicken wings", "Chicken liver",
    "Beef steak", "Ground beef", "Beef ribs", "Beef brisket",
    "Pork chops", "Pork belly", "Ground pork", "Bacon",
    "Lamb chops", "Lamb mince", "Lamb shoulder", "Mutton",
    "Salmon fillet", "Tuna", "Shrimp", "Prawns", "Cod", "Sardines",
    "Mackerel", "Tilapia", "Rohu fish", "Pomfret", "Hilsa fish",
    "Crab", "Lobster", "Squid", "Mussels", "Clams",
    # Proteins - Plant
    "Eggs", "Tofu", "Tempeh", "Paneer", "Seitan",
    # Dairy
    "Whole milk", "Skim milk", "Butter", "Ghee", "Cheddar cheese",
    "Mozzarella", "Greek yogurt", "Curd", "Heavy cream", "Sour cream",
    "Coconut milk", "Almond milk", "Oat milk", "Condensed milk", "Cream cheese",
    "Ricotta", "Parmesan", "Cottage cheese",
    # Grains & Carbs
    "Basmati rice", "Brown rice", "Jasmine rice", "White rice", "Black rice",
    "Pasta", "Spaghetti", "Penne", "Fettuccine", "Noodles", "Rice noodles",
    "Oats", "Rolled oats", "Quinoa", "Barley", "Millet", "Sorghum",
    "Wheat flour", "Whole wheat flour", "Bread", "Sourdough bread",
    "Roti", "Naan", "Pita bread", "Tortilla", "Semolina", "Cornmeal",
    "Poha", "Vermicelli", "Idli batter", "Dosa batter",
    # Legumes
    "Lentils", "Red lentils", "Green lentils", "Black lentils", "Masoor dal",
    "Chickpeas", "Chana dal", "Black beans", "Kidney beans", "Mung beans",
    "Moong dal", "Urad dal", "Toor dal", "Pigeon peas", "Green peas",
    "Soybeans", "Edamame", "Peanuts", "Black-eyed peas",
    # Nuts & Seeds
    "Almonds", "Walnuts", "Cashews", "Pistachios", "Pecans", "Hazelnuts",
    "Macadamia nuts", "Pine nuts", "Brazil nuts",
    "Chia seeds", "Flaxseeds", "Sesame seeds", "Sunflower seeds",
    "Pumpkin seeds", "Hemp seeds", "Poppy seeds",
    # Oils & Fats
    "Olive oil", "Extra virgin olive oil", "Coconut oil", "Sunflower oil",
    "Vegetable oil", "Sesame oil", "Mustard oil", "Groundnut oil",
    "Avocado oil", "Butter", "Ghee",
    # Sweeteners
    "Honey", "Sugar", "Brown sugar", "Maple syrup", "Jaggery", "Palm sugar",
    "Coconut sugar", "Agave syrup", "Stevia",
    # Spices & Herbs - Common
    "Salt", "Black pepper", "White pepper", "Cumin", "Turmeric",
    "Coriander", "Paprika", "Cinnamon", "Cardamom", "Bay leaves",
    "Cloves", "Star anise", "Nutmeg", "Mace", "Fennel seeds",
    "Mustard seeds", "Fenugreek seeds", "Ajwain", "Asafoetida",
    "Chilli powder", "Kashmiri chilli powder", "Garam masala", "Curry powder",
    "Cumin powder", "Coriander powder", "Turmeric powder", "Amchur powder",
    "Chaat masala", "Biryani masala", "Tandoori masala", "Sambar powder",
    # Spices & Herbs - Fresh
    "Oregano", "Basil", "Thyme", "Rosemary", "Parsley", "Cilantro",
    "Dill", "Mint", "Tarragon", "Chives", "Sage", "Lemongrass",
    "Kaffir lime leaves", "Pandan leaves",
    # Sauces & Condiments
    "Soy sauce", "Dark soy sauce", "Fish sauce", "Oyster sauce",
    "Worcestershire sauce", "Hot sauce", "Sriracha", "Hoisin sauce",
    "Teriyaki sauce", "Sweet chilli sauce",
    "Vinegar", "Apple cider vinegar", "Balsamic vinegar", "Rice vinegar",
    "Tomato ketchup", "Mustard", "Mayonnaise",
    # Stocks & Broths
    "Chicken stock", "Beef stock", "Vegetable stock", "Fish stock",
    # Baking
    "Baking powder", "Baking soda", "Cornstarch", "Arrowroot powder",
    "Yeast", "Gelatin", "Agar agar",
    # Confectionery
    "Dark chocolate", "Milk chocolate", "White chocolate",
    "Cocoa powder", "Vanilla extract", "Vanilla bean",
]


def _local_search(q: str, limit: int) -> list[dict]:
    q_lower = q.strip().lower()
    exact = [f for f in _FALLBACK if f.lower() == q_lower]
    starts = [f for f in _FALLBACK if f.lower().startswith(q_lower) and f not in exact]
    contains = [f for f in _FALLBACK if q_lower in f.lower() and f not in exact and f not in starts]
    ordered = (exact + starts + contains)[:limit]
    return [
        {"fdc_id": i + 1, "description": name, "data_type": "ingredient",
         "calories": None, "protein": None, "carbs": None, "fat": None}
        for i, name in enumerate(ordered)
    ]


@router.get("/search")
async def search_usda_foods(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    # Try food_ai_search (USDA data) first, fall back to ingredients table
    db_results: list[str] = []
    try:
        rows = await db.execute(
            text("""
                SELECT fdc_id, description, data_type, calories, protein, carbs, fat
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
        usda_rows = rows.mappings().all()
        if usda_rows:
            return [dict(r) for r in usda_rows]
    except Exception:
        await db.rollback()

    # Fall back to ingredients table (recipe seed data)
    try:
        rows = await db.execute(
            text("""
                SELECT name AS description
                FROM ingredients
                WHERE name ILIKE :pattern
                ORDER BY
                    CASE WHEN lower(name) = lower(:q) THEN 0
                         WHEN lower(name) LIKE lower(:q) || '%' THEN 1
                         ELSE 2
                    END,
                    length(name)
                LIMIT :lim
            """),
            {"pattern": f"%{q}%", "q": q, "lim": limit},
        )
        db_results = [r[0] for r in rows.fetchall()]
    except Exception:
        await db.rollback()
        db_results = []

    # Merge DB results with local list, deduplicated, DB results first
    local = _local_search(q, limit)
    db_names_lower = {n.lower() for n in db_results}
    local_extra = [
        item for item in local
        if item["description"].lower() not in db_names_lower
    ]

    merged = []
    for i, name in enumerate(db_results):
        merged.append({"fdc_id": i + 1, "description": name, "data_type": "ingredient",
                        "calories": None, "protein": None, "carbs": None, "fat": None})
    offset = len(merged)
    for i, item in enumerate(local_extra):
        item["fdc_id"] = offset + i + 1
        merged.append(item)

    return merged[:limit]
