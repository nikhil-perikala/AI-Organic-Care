import json
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.embedding_service import get_openai_client
from app.config import settings

router = APIRouter(prefix="/ai", tags=["ai-meals"])


class MealSuggestRequest(BaseModel):
    query: str
    meal_type: str  # breakfast | lunch | dinner | mixed
    count: int = 4


@router.post("/meal-suggest")
async def meal_suggest(req: MealSuggestRequest):
    client = get_openai_client()

    if req.meal_type == "mixed":
        prompt = (
            f"Generate exactly {req.count} healthy meal suggestions to fill a weekly planner. "
            "Mix breakfast (300-500 kcal), lunch (450-700 kcal), and dinner (600-850 kcal) options with variety. "
            "Return ONLY a raw JSON array — no markdown fences, no backticks, no explanation. "
            'Each item must have exactly these keys: '
            '{"name": "string ≤20 chars", "kcal": integer, "time": "X min", "desc": "string ≤35 chars"}'
        )
    else:
        kcal_range = {"breakfast": "300–500", "lunch": "450–700", "dinner": "600–850"}.get(
            req.meal_type, "400–700"
        )
        prompt = (
            f'Generate exactly {req.count} {req.meal_type} options inspired by "{req.query}". '
            f"Calories: {kcal_range} kcal each. Make every suggestion distinct and appetising. "
            "Return ONLY a raw JSON array — no markdown fences, no backticks, no explanation. "
            'Each item must have exactly these keys: '
            '{"name": "string ≤20 chars", "kcal": integer, "time": "X min", "desc": "string ≤35 chars"}'
        )

    response = await client.chat.completions.create(
        model=settings.OPENAI_CHAT_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a nutritionist AI assistant. "
                    "Always respond with ONLY a valid JSON array. "
                    "No markdown, no backticks, no extra text whatsoever."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.75,
        max_tokens=1000,
    )

    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)

    # Model sometimes wraps the array in an object like {"meals": [...]}
    if isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list):
                data = v
                break
        else:
            data = []

    return (data if isinstance(data, list) else [])[: req.count]
