"""
USDA FoodData Central API collector.
Fetches nutrient data for organic ingredients.
"""
import requests
from typing import List, Dict, Optional
import structlog
from app.config import settings

logger = structlog.get_logger()

BASE_URL = "https://api.nal.usda.gov/fdc/v1"

ORGANIC_SEARCH_TERMS = [
    "organic spinach", "organic kale", "organic blueberries", "organic ginger",
    "organic turmeric", "organic quinoa", "organic sweet potato", "organic broccoli",
    "organic almonds", "organic oats", "organic avocado", "organic lemon",
    "organic garlic", "organic salmon", "organic chicken", "organic eggs",
    "organic greek yogurt", "organic lentils", "organic chia seeds", "organic flaxseed",
    "organic walnuts", "organic green tea", "organic chamomile", "organic ashwagandha",
    "organic olive oil", "organic coconut oil", "organic apple cider vinegar",
    "organic beet", "organic carrot", "organic celery", "organic cucumber",
]


def search_foods(query: str, page_size: int = 5) -> List[Dict]:
    if not settings.USDA_API_KEY:
        logger.warning("No USDA API key configured — skipping USDA collection")
        return []

    try:
        resp = requests.get(
            f"{BASE_URL}/foods/search",
            params={"query": query, "pageSize": page_size, "api_key": settings.USDA_API_KEY},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("foods", [])
    except Exception as e:
        logger.warning("USDA search failed", query=query, error=str(e))
        return []


def get_food_detail(fdc_id: int) -> Optional[Dict]:
    if not settings.USDA_API_KEY:
        return None
    try:
        resp = requests.get(
            f"{BASE_URL}/food/{fdc_id}",
            params={"api_key": settings.USDA_API_KEY},
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception as e:
        logger.warning("USDA detail fetch failed", fdc_id=fdc_id, error=str(e))
        return None


def extract_nutrient_dict(food_detail: Dict) -> Dict:
    nutrients = {}
    for nutrient in food_detail.get("foodNutrients", []):
        name = nutrient.get("nutrient", {}).get("name", "")
        amount = nutrient.get("amount")
        unit = nutrient.get("nutrient", {}).get("unitName", "")
        if name and amount is not None:
            nutrients[name] = {"amount": amount, "unit": unit}
    return nutrients


def collect_usda_ingredients() -> List[Dict]:
    """Fetch organic ingredient data from USDA for ingestion."""
    results = []
    for term in ORGANIC_SEARCH_TERMS:
        foods = search_foods(term, page_size=3)
        for food in foods[:1]:
            fdc_id = food.get("fdcId")
            detail = get_food_detail(fdc_id) if fdc_id else None
            nutrients = extract_nutrient_dict(detail) if detail else {}

            results.append({
                "name": food.get("description", term).title(),
                "usda_food_id": str(fdc_id) if fdc_id else None,
                "category": food.get("foodCategory", ""),
                "nutrients": nutrients,
                "is_organic": "organic" in term.lower(),
                "source": "USDA FoodData Central",
            })
        logger.info("Collected USDA ingredient", term=term)

    return results


def ingredient_to_knowledge_text(ingredient: Dict) -> str:
    """Convert an ingredient dict to a knowledge chunk text."""
    name = ingredient["name"]
    lines = [f"{name} — nutritional profile and health benefits."]
    if ingredient.get("nutrients"):
        top_nutrients = list(ingredient["nutrients"].items())[:8]
        lines.append("Key nutrients: " + ", ".join(
            f"{n}: {v['amount']}{v['unit']}" for n, v in top_nutrients
        ))
    return "\n".join(lines)
