"""
LLM generation: builds a prompt from RAG context and streams or returns the explanation.
Uses prompt caching headers for cost efficiency on repeated system prompts.
"""
import json
from typing import List, AsyncIterator, Optional
from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential
from app.config import settings
from app.services.embedding_service import get_openai_client

SYSTEM_PROMPT = """You are Organic Care AI — a knowledgeable, warm, and evidence-based wellness companion.
Your role is to explain why specific organic foods and recipes help with the user's symptoms.
Guidelines:
- Base explanations on the provided knowledge context (cite nutrients, compounds, studies).
- Be personalized: reference the user's pantry and dietary profile when available.
- Keep explanations clear, empathetic, and actionable.
- Do not diagnose medical conditions or replace professional medical advice.
- If evidence is limited, be transparent about uncertainty.
- Structure: 1) Acknowledge the symptom, 2) Explain the mechanism, 3) Connect to recommended foods.
"""


def _fmt_macro(val) -> str:
    return f"{float(val):.1f}" if val is not None else "—"


def _build_prompt(
    query: str,
    ailment_tags: List[str],
    knowledge_chunks: List[dict],
    usda_foods: List[dict],
    recipes: List[dict],
    user_profile: Optional[dict],
    pantry: List[str],
) -> str:
    context_parts = []

    if knowledge_chunks:
        context_parts.append("## Evidence & Knowledge Base\n")
        for i, chunk in enumerate(knowledge_chunks[:6], 1):
            source = chunk.get("source_title") or chunk.get("source_url") or "Unknown source"
            context_parts.append(f"[{i}] ({source})\n{chunk.get('chunk_text', '')}\n")

    if usda_foods:
        context_parts.append("\n## Real Food Database (USDA FoodData Central)\n")
        context_parts.append("Top semantically matching foods from 1.9M USDA entries:\n")
        for food in usda_foods:
            desc = food.get("description") or "Unknown food"
            cal  = _fmt_macro(food.get("calories"))
            prot = _fmt_macro(food.get("protein"))
            carb = _fmt_macro(food.get("carbs"))
            fat  = _fmt_macro(food.get("fat"))
            sim  = float(food.get("similarity") or 0)
            context_parts.append(
                f"- {desc} | cal: {cal} kcal, protein: {prot}g, "
                f"carbs: {carb}g, fat: {fat}g (relevance: {sim:.2f})\n"
            )

    if recipes:
        context_parts.append("\n## Top Recommended Recipes\n")
        for r in recipes:
            context_parts.append(
                f"- **{r['title']}** (efficacy: {r['efficacy_score']:.2f}) "
                f"| ailments: {', '.join(r.get('ailment_tags') or [])} "
                f"| benefits: {', '.join(r.get('health_benefits') or [])}\n"
            )

    profile_info = ""
    if user_profile:
        lines = ["\n## User Wellness Profile"]
        if user_profile.get("dietary_preferences"):
            lines.append(f"- Dietary preferences: {', '.join(user_profile['dietary_preferences'])}")
        if user_profile.get("allergies"):
            lines.append(f"- Allergies / must avoid: {', '.join(user_profile['allergies'])} — NEVER recommend ingredients containing these")
        if user_profile.get("health_goals"):
            lines.append(f"- Health goals: {', '.join(user_profile['health_goals'])}")
        if user_profile.get("disliked_ingredients"):
            lines.append(f"- Dislikes: {', '.join(user_profile['disliked_ingredients'])} — avoid these ingredients where possible")
        profile_info = "\n".join(lines)
    pantry_info = f"\nUser's available pantry: {', '.join(pantry)}" if pantry else ""

    return f"""User query: "{query}"
Detected ailments: {', '.join(ailment_tags) or 'general wellness'}
{profile_info}{pantry_info}

{chr(10).join(context_parts)}

Please provide:
1. A warm, personalized explanation (3-4 sentences) of why the recommended foods address the user's needs. Reference specific USDA foods and their nutrients where relevant.
2. A concise evidence summary (1-2 sentences) citing key nutrients or compounds from the knowledge base and USDA data.
Keep both sections distinct and label them clearly."""


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=8))
async def generate_explanation(
    query: str,
    ailment_tags: List[str],
    knowledge_chunks: List[dict],
    recipes: List[dict],
    user_profile: Optional[dict] = None,
    pantry: Optional[List[str]] = None,
    usda_foods: Optional[List[dict]] = None,
) -> dict:
    client = get_openai_client()
    prompt = _build_prompt(query, ailment_tags, knowledge_chunks, usda_foods or [], recipes, user_profile, pantry or [])

    response = await client.chat.completions.create(
        model=settings.OPENAI_CHAT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
        max_tokens=600,
    )

    full_text = response.choices[0].message.content or ""

    # Split into explanation + evidence summary
    lines = full_text.strip().split("\n")
    explanation_lines, evidence_lines = [], []
    in_evidence = False

    for line in lines:
        low = line.lower()
        if "evidence summary" in low or "evidence:" in low or low.startswith("2."):
            in_evidence = True
        if in_evidence:
            evidence_lines.append(line)
        else:
            explanation_lines.append(line)

    return {
        "ai_explanation": "\n".join(explanation_lines).strip() or full_text,
        "evidence_summary": "\n".join(evidence_lines).strip() or "",
    }


async def stream_explanation(
    query: str,
    ailment_tags: List[str],
    knowledge_chunks: List[dict],
    recipes: List[dict],
    user_profile: Optional[dict] = None,
    pantry: Optional[List[str]] = None,
    usda_foods: Optional[List[dict]] = None,
) -> AsyncIterator[str]:
    client = get_openai_client()
    prompt = _build_prompt(query, ailment_tags, knowledge_chunks, usda_foods or [], recipes, user_profile, pantry or [])

    stream = await client.chat.completions.create(
        model=settings.OPENAI_CHAT_MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ],
        temperature=0.4,
        max_tokens=600,
        stream=True,
    )

    async for chunk in stream:
        delta = chunk.choices[0].delta.content
        if delta:
            yield delta
