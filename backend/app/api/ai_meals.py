import json
import logging
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.embedding_service import get_openai_client
from app.config import settings

router = APIRouter(prefix="/ai", tags=["ai-meals"])
logger = logging.getLogger(__name__)

SCHEMA = (
    '{"name":"≤22 chars","kcal":integer,"time":"X min",'
    '"desc":"≤35 chars","benefit":"one health benefit ≤60 chars"}'
)


class MealSuggestRequest(BaseModel):
    query: str
    meal_type: str  # breakfast | lunch | dinner | mixed
    count: int = 4


@router.post("/meal-suggest")
async def meal_suggest(req: MealSuggestRequest):
    client = get_openai_client()

    # Budget ~130 tokens per meal item + 300 overhead.
    # This is critical for auto-fill: 21 slots × 130 ≈ 2730 tokens needed.
    max_tokens = max(1200, req.count * 130 + 300)

    if req.meal_type == "mixed":
        prompt = (
            f"You are a meal planner. Generate exactly {req.count} meals. "
            f"Slot types in order: {req.query}. "
            f'Return a JSON object with key "meals" containing an array of exactly {req.count} items. '
            f"Each item: {SCHEMA}"
        )
    else:
        type_label = req.meal_type.capitalize()
        kcal_range = {"breakfast": "300–500", "lunch": "450–700", "dinner": "600–850"}.get(
            req.meal_type, "400–700"
        )
        prompt = (
            f"You are a meal planning assistant. The user wants {type_label} ideas related to "
            f'"{req.query}". Generate exactly {req.count} options. '
            f"Calories: {kcal_range} kcal. Keep names under 22 chars. "
            f'Return a JSON object with key "meals" containing an array of exactly {req.count} items. '
            f"Each item: {SCHEMA}"
        )

    response = await client.chat.completions.create(
        model=settings.OPENAI_CHAT_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a nutritionist AI. "
                    'Always respond with a JSON object containing a "meals" array. '
                    "No extra keys, no markdown, no backticks."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.75,
        max_tokens=max_tokens,
    )

    raw = response.choices[0].message.content or "{}"

    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        logger.error("ai_meals: json parse failed, raw=%s", raw[:200])
        return []

    # Unwrap: try the explicit "meals" key first, then any list value
    if isinstance(data, list):
        return data[: req.count]

    if isinstance(data, dict):
        meals = data.get("meals") or data.get("results") or data.get("suggestions")
        if isinstance(meals, list):
            return meals[: req.count]
        for v in data.values():
            if isinstance(v, list):
                return v[: req.count]

    return []
