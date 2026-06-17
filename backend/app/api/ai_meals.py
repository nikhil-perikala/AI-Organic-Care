import json
from fastapi import APIRouter
from pydantic import BaseModel

from app.services.embedding_service import get_openai_client
from app.config import settings

router = APIRouter(prefix="/ai", tags=["ai-meals"])

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

    if req.meal_type == "mixed":
        # query carries the ordered slot-type list for auto-fill
        prompt = (
            f"You are a meal planner. The user needs {req.count} meals. "
            f"Slot types in order: {req.query}. "
            "Return ONLY a raw JSON array matching the slot order — no markdown, no backticks. "
            f"Each item: {SCHEMA}"
        )
    else:
        type_label = req.meal_type.capitalize()
        kcal_range = {"breakfast": "300–500", "lunch": "450–700", "dinner": "600–850"}.get(
            req.meal_type, "400–700"
        )
        prompt = (
            f"You are a meal planning assistant. The user wants {type_label} ideas related to "
            f'"{req.query}". Return exactly {req.count} meal options as a JSON array only, '
            "no markdown, no backticks. "
            f"Calories: {kcal_range} kcal. Keep names under 22 chars. "
            f"Each item: {SCHEMA}"
        )

    response = await client.chat.completions.create(
        model=settings.OPENAI_CHAT_MODEL,
        messages=[
            {
                "role": "system",
                "content": (
                    "You are a nutritionist AI. "
                    "Always respond with ONLY a valid JSON array — no markdown, no backticks, no extra text."
                ),
            },
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=0.75,
        max_tokens=1100,
    )

    raw = response.choices[0].message.content or "{}"
    data = json.loads(raw)

    if isinstance(data, dict):
        for v in data.values():
            if isinstance(v, list):
                data = v
                break
        else:
            data = []

    return (data if isinstance(data, list) else [])[: req.count]
