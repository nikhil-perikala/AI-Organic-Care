import json
import re
import uuid
import random
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Optional
from sqlalchemy import select, delete, or_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import structlog

from app.database import get_db
from app.core.deps import get_optional_user, get_current_user
from app.models.user import User, UserPantry, UserProfile, ChatHistory, ChatFeedback
from app.models.recipe import Recipe, RecipeIngredient
from app.services.embedding_service import get_openai_client
from app.services.rag_service import run_rag_pipeline
from app.config import settings

logger = structlog.get_logger()

router = APIRouter(prefix="/chat", tags=["chat"])

SYSTEM_PROMPT = """You are OrganicCare AI, a modern and professional wellness assistant focused on organic food, nutrition, and healthy living.

Your responses must always be:
- Clean and well-structured
- User-friendly and easy to read on mobile
- Professional but conversational
- Short when possible, detailed only when needed

IMPORTANT RULES:
- Do NOT always use the same fixed sections.
- Decide the structure dynamically based on the user's question.
- Avoid robotic or repetitive formatting.
- Never return large paragraphs.
- Use spacing and bullets naturally.
- Sound like a smart health assistant, not a textbook.

RESPONSE STYLE — adapt based on intent:
- Simple questions → short clean answer, no rigid sections
- Benefit questions → concise bullet list
- Recipe questions → ingredients + numbered steps
- Comparison questions → bullet comparison or table
- Health questions → gentle caution only when truly necessary
- Pantry questions → reference the user's actual pantry items by name

FORMATTING RULES:
- Use headings only when the answer is multi-section
- Use bullets for readability, not decoration
- Highlight important words in **bold**
- Keep each point concise — one idea per line
- Mobile-friendly formatting is mandatory
- Never pad a short answer with unnecessary sections

PERSONALIZATION RULES:
- Strictly respect allergies — never suggest anything containing an allergen
- Align all suggestions with the user's stated health goals
- Prioritize expiring pantry items in recommendations

PANTRY CHECK — MANDATORY BEFORE EVERY FOOD OR RECIPE ANSWER:
Before answering any question about food, ingredients, or recipes, you MUST check the user's pantry from the context above.

CASE 1 — Pantry is empty (no items listed):
Open your response with this exact block:

🧺 **Pantry:** Empty — no ingredients on file.
➕ *Add items to your pantry so I can personalise suggestions for you.*

Then continue answering the question using general recommendations.
For every ingredient or food you mention, append **(buy)** after it.

CASE 2 — Pantry has items:
Open every food/recipe answer with a compact pantry check block:

🧺 **Pantry Check**
✅ **Have:** [ingredients from your answer that match the user's pantry — match loosely]
🛒 **Missing:** [ingredients from your answer NOT in the pantry] — *add to shopping list*

Rules for Case 2:
- If the user already has ALL the needed ingredients → write "✅ You have everything you need!" and omit the Missing line.
- List only ingredients relevant to this specific answer — do not dump the entire pantry.
- Match loosely: "garlic" matches "garlic cloves", "olive oil" matches "extra virgin olive oil".
- Keep the block to 2–3 lines max — compact, not a wall of text.
- After the pantry block, give the full answer (recipe steps, benefits, etc.).

CASE 3 — Non-food questions (greetings, general wellness, etc.):
Skip the pantry check entirely for questions that do not involve specific foods or ingredients.

Do not diagnose medical conditions or prescribe treatments.

END-OF-REPLY RULE — MANDATORY FOR EVERY RESPONSE:
Always finish every reply with a short follow-up suggestion on a new line, formatted exactly like this:

💡 **Try asking:** "[one relevant follow-up question the user might want to ask next]"

Rules:
- The suggestion must be directly related to what the user just asked.
- Write it as a natural follow-up, not a generic tip.
- Keep it to one short sentence inside quotes.
- Always place it as the very last line of your response.
- Never skip this — it appears on every single reply."""

STATIC_SUGGESTIONS = [
    "What foods boost energy?",
    "Best foods for better sleep?",
    "Anti-inflammatory diet tips",
    "High-protein organic foods",
]


class ChatMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=4000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: List[ChatMessage] = Field(default_factory=list, max_length=20)


class FeedbackRequest(BaseModel):
    message_id: str
    rating: int


def _build_rag_context(rag_results: dict) -> str:
    lines: List[str] = []

    chunks = rag_results.get("knowledge_chunks", [])
    if chunks:
        lines.append("Evidence-based facts (use to enhance accuracy if relevant):")
        for chunk in chunks[:2]:
            text = str(chunk.get("chunk_text", ""))[:280].strip()
            if text:
                lines.append(f"• {text}")

    usda_foods = rag_results.get("usda_foods", [])
    if usda_foods:
        lines.append("\nUSDA nutritional data:")
        for food in usda_foods[:3]:
            kcal = food.get("calories") or "?"
            prot = food.get("protein") or "?"
            carbs = food.get("carbs") or "?"
            lines.append(f"• {food['description']}: {kcal} kcal, {prot}g protein, {carbs}g carbs")

    recipes = rag_results.get("recipes", [])
    if recipes:
        lines.append("\nRelevant recipe from our database:")
        r = recipes[0]
        desc = (r.get("description") or "")[:150]
        lines.append(f"• **{r['title']}**: {desc}")
        # Ingredient list fetched from DB (used for accurate pantry cross-reference)
        ings = r.get("_ingredients", [])
        if ings:
            parts = []
            for ing in ings:
                qty  = (ing.get("quantity") or "").strip()
                unit = (ing.get("unit") or "").strip()
                name = (ing.get("name") or "").strip()
                parts.append(" ".join(filter(None, [qty, unit, name])))
            lines.append(f"  Ingredients: {', '.join(parts)}")
            lines.append("  → Use this exact ingredient list for the Pantry Check.")

    return "\n".join(lines)


async def _build_user_context(user: User, db: AsyncSession) -> tuple[str, List[str]]:
    lines: List[str] = []

    profile_result = await db.execute(
        select(UserProfile).where(UserProfile.user_id == user.id)
    )
    profile: Optional[UserProfile] = profile_result.scalar_one_or_none()

    lines.append(f"User name: {user.full_name or user.email}")

    if profile:
        if profile.dietary_preferences:
            lines.append(f"Dietary preferences: {', '.join(profile.dietary_preferences)}")
        if profile.allergies:
            lines.append(
                f"Allergies — NEVER recommend foods containing: {', '.join(profile.allergies)}"
            )
        if profile.health_goals:
            lines.append(f"Health goals: {', '.join(profile.health_goals)}")
        if profile.disliked_ingredients:
            lines.append(f"Dislikes (avoid): {', '.join(profile.disliked_ingredients)}")
        if profile.liked_cuisines:
            lines.append(f"Preferred cuisines: {', '.join(profile.liked_cuisines)}")
        if profile.serving_size:
            lines.append(f"Serving size: {profile.serving_size} people")

    pantry_result = await db.execute(
        select(UserPantry).where(UserPantry.user_id == user.id)
    )
    pantry_items: List[UserPantry] = list(pantry_result.scalars().all())
    pantry_ingredient_names = [item.ingredient_name for item in pantry_items]

    if pantry_items:
        today = date.today()
        by_category: dict[str, List[str]] = {}
        expiring: List[str] = []

        for item in pantry_items:
            cat = item.category or "Other"
            by_category.setdefault(cat, []).append(item.ingredient_name)
            if item.expiry_date:
                days = (item.expiry_date - today).days
                if 0 <= days <= 7:
                    expiring.append(f"{item.ingredient_name} ({days}d left)")

        lines.append(f"\nPantry — {len(pantry_items)} items:")
        for cat, names in by_category.items():
            lines.append(f"  {cat}: {', '.join(names)}")

        if expiring:
            lines.append(
                f"\nExpiring soon — suggest using these first: {', '.join(expiring)}"
            )
    else:
        lines.append("\nPantry: empty (no ingredients added yet)")

    lines.append(
        "\nIMPORTANT: Personalize every response using the data above. "
        "Reference the user's actual pantry ingredients when suggesting foods or recipes. "
        "Strictly respect all allergies and dietary preferences. "
        "Prioritize expiring ingredients in suggestions."
    )

    return "\n".join(lines), pantry_ingredient_names


@router.get("/history")
async def get_chat_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(ChatHistory)
        .where(ChatHistory.user_id == user.id)
        .order_by(ChatHistory.created_at.desc())
        .limit(50)
    )
    messages = list(reversed(result.scalars().all()))
    return {
        "messages": [
            {
                "id": str(m.id),
                "role": m.role,
                "content": m.content,
                "created_at": m.created_at.isoformat(),
            }
            for m in messages
        ]
    }


@router.delete("/history")
async def clear_chat_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await db.execute(delete(ChatHistory).where(ChatHistory.user_id == user.id))
    await db.commit()
    return {"ok": True}


@router.post("/feedback")
async def submit_feedback(
    payload: FeedbackRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if payload.rating not in (1, -1):
        raise HTTPException(status_code=400, detail="rating must be 1 or -1")

    try:
        msg_uuid = uuid.UUID(payload.message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid message_id")

    msg_result = await db.execute(
        select(ChatHistory).where(
            ChatHistory.id == msg_uuid,
            ChatHistory.user_id == user.id,
        )
    )
    if not msg_result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="message not found")

    existing = await db.execute(
        select(ChatFeedback).where(
            ChatFeedback.message_id == msg_uuid,
            ChatFeedback.user_id == user.id,
        )
    )
    fb = existing.scalar_one_or_none()
    if fb:
        fb.rating = payload.rating
    else:
        db.add(ChatFeedback(user_id=user.id, message_id=msg_uuid, rating=payload.rating))

    await db.commit()
    return {"ok": True}


@router.get("/suggestions")
async def get_suggestions(
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    if not user:
        return {"suggestions": STATIC_SUGGESTIONS}

    pantry_result = await db.execute(
        select(UserPantry).where(UserPantry.user_id == user.id)
    )
    items = list(pantry_result.scalars().all())

    suggestions: List[str] = []
    today = date.today()

    expiring = [
        i for i in items
        if i.expiry_date and 0 <= (i.expiry_date - today).days <= 7
    ]
    if expiring:
        suggestions.append(f"Quick recipe using {expiring[0].ingredient_name}?")

    if items:
        sample = random.sample(items, min(3, len(items)))
        for item in sample:
            if len(suggestions) >= 4:
                break
            chip = f"Benefits of {item.ingredient_name}?"
            if chip not in suggestions:
                suggestions.append(chip)

    for s in STATIC_SUGGESTIONS:
        if len(suggestions) >= 4:
            break
        if s not in suggestions:
            suggestions.append(s)

    return {"suggestions": suggestions[:4]}


@router.post("/stream")
async def chat_stream(
    payload: ChatRequest,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    client = get_openai_client()

    system = SYSTEM_PROMPT
    pantry_ingredients: List[str] = []

    if user:
        context, pantry_ingredients = await _build_user_context(user, db)
        system += f"\n\n---\n## 👤 Personalized User Context\n{context}"

    try:
        rag_results = await run_rag_pipeline(payload.message, pantry_ingredients, db)

        # Enrich top RAG recipe with its full ingredient list for pantry cross-reference
        top_recipes = rag_results.get("recipes", [])
        if top_recipes:
            top_id = top_recipes[0].get("id")
            if top_id:
                try:
                    ing_result = await db.execute(
                        select(RecipeIngredient)
                        .where(RecipeIngredient.recipe_id == top_id)
                        .options(selectinload(RecipeIngredient.ingredient))
                    )
                    ing_rows = ing_result.scalars().all()
                    top_recipes[0]["_ingredients"] = [
                        {
                            "name": ri.ingredient.name,
                            "quantity": ri.quantity,
                            "unit": ri.unit,
                        }
                        for ri in ing_rows
                    ]
                except Exception as e:
                    logger.warning("Failed to enrich recipe ingredients", error=str(e))

        rag_context = _build_rag_context(rag_results)
        if rag_context:
            system += f"\n\n---\n## 📚 Knowledge Base\n{rag_context}"
    except Exception as e:
        logger.error("RAG pipeline failed — chat will proceed without knowledge context", error=str(e))

    messages: list[dict] = [{"role": "system", "content": system}]
    for msg in payload.history[-10:]:
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": payload.message})

    async def event_generator():
        full_response = ""
        had_error = False

        try:
            stream = await client.chat.completions.create(
                model=settings.OPENAI_CHAT_MODEL,
                messages=messages,
                temperature=0.7,
                max_tokens=600,
                stream=True,
            )
            async for chunk in stream:
                delta = chunk.choices[0].delta.content
                if delta:
                    full_response += delta
                    yield f"data: {json.dumps({'token': delta})}\n\n"
        except Exception as e:
            had_error = True
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

        recipe_refs: List[dict] = []
        ai_msg_id: Optional[str] = None

        if not had_error and full_response:
            # Extract bold phrases that look like recipe / food names
            raw_names = re.findall(r'\*\*([^*]{2,80})\*\*', full_response)
            candidate_names = list(dict.fromkeys(raw_names))[:12]

            if candidate_names:
                try:
                    # Fetch all recipes and score each against candidate names.
                    # This avoids false positives from broad word-OR queries.
                    all_rows = (await db.execute(select(Recipe.id, Recipe.title))).all()

                    SKIP = {'with', 'and', 'the', 'for', 'from', 'your',
                            'you', 'are', 'have', 'that', 'this', 'can', 'will'}

                    scored: list[dict] = []
                    for row in all_rows:
                        r_words = {w.lower() for w in row.title.split()
                                   if len(w) >= 4 and w.lower() not in SKIP}
                        best = 0.0
                        for name in candidate_names:
                            n_words = {w.lower() for w in name.split()
                                       if len(w) >= 4 and w.lower() not in SKIP}
                            if not n_words:
                                continue
                            overlap = len(r_words & n_words)
                            if overlap == 0:
                                continue
                            prec = overlap / len(n_words)
                            rec  = overlap / len(r_words) if r_words else 0
                            f1   = 2 * prec * rec / (prec + rec) if (prec + rec) else 0
                            best = max(best, f1)
                        if best >= 0.55:
                            scored.append({"id": str(row.id), "title": row.title, "_s": best})

                    scored.sort(key=lambda x: x["_s"], reverse=True)
                    recipe_refs = [{"id": m["id"], "title": m["title"]} for m in scored[:3]]
                except Exception as e:
                    logger.warning("Recipe ref matching failed", error=str(e))

            if user:
                try:
                    user_msg = ChatHistory(
                        user_id=user.id, role="user", content=payload.message
                    )
                    ai_msg = ChatHistory(
                        user_id=user.id, role="assistant", content=full_response
                    )
                    db.add_all([user_msg, ai_msg])
                    await db.commit()
                    await db.refresh(ai_msg)
                    ai_msg_id = str(ai_msg.id)
                except Exception as e:
                    logger.warning("Failed to persist chat history", error=str(e))

        yield f"data: {json.dumps({'done': True, 'recipe_refs': recipe_refs, 'ai_msg_id': ai_msg_id})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
