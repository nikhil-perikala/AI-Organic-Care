"""
RAG retrieval: embed query → pgvector HNSW search → ranked results.
Retrieves both knowledge chunks (for LLM context) and recipes (for recommendations).
"""
from typing import List, Tuple, Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select
from app.models.knowledge import KnowledgeChunk, AilmentMapping
from app.models.recipe import Recipe
from app.services.embedding_service import embed_text
from app.config import settings


async def detect_ailments(query: str, db: AsyncSession) -> List[str]:
    """Map user query to canonical ailment terms using the ailment_mappings table."""
    query_lower = query.lower()
    result = await db.execute(select(AilmentMapping))
    mappings = result.scalars().all()

    matched = []
    for m in mappings:
        keywords = [k.lower() for k in (m.keywords or [])] + [m.user_term.lower()]
        if any(kw in query_lower for kw in keywords):
            matched.append(m.canonical_ailment)
            matched.extend(m.related_ailments or [])

    return list(dict.fromkeys(matched))[:5]  # deduplicate, cap at 5


def _vec_literal(embedding: List[float]) -> str:
    """Render a float list as a pgvector literal safe to inline in SQL.
    These are OpenAI model outputs (floats), never user-supplied strings.
    """
    return "'" + "[" + ",".join(f"{v:.8f}" for v in embedding) + "]" + "'::vector"


async def retrieve_knowledge_chunks(
    query_embedding: List[float],
    ailment_tags: List[str],
    top_k: int,
    db: AsyncSession,
) -> List[KnowledgeChunk]:
    """HNSW cosine similarity search on knowledge_chunks."""
    vec = _vec_literal(query_embedding)

    sql = text(f"""
        SELECT id, chunk_text, source_url, source_title, source_type,
               ailment_tags, ingredient_tags, metadata,
               1 - (embedding <=> {vec}) AS similarity
        FROM knowledge_chunks
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> {vec}
        LIMIT :top_k
    """)

    rows = await db.execute(sql, {"top_k": top_k})
    return rows.mappings().all()


async def retrieve_recipes(
    query_embedding: List[float],
    ailment_tags: List[str],
    pantry_ingredients: List[str],
    top_k: int,
    db: AsyncSession,
) -> List[dict]:
    """
    Retrieve recipes ranked by:
    1. Vector cosine similarity to query
    2. Ailment tag overlap bonus
    3. Efficacy score
    """
    vec = _vec_literal(query_embedding)

    # Base vector search — get top_k * 4 candidates, then re-rank
    sql = text(f"""
        SELECT r.id, r.title, r.description, r.instructions,
               r.prep_time_minutes, r.cook_time_minutes, r.servings,
               r.cuisine_type, r.meal_type, r.ailment_tags, r.health_benefits,
               r.dietary_labels, r.efficacy_score, r.nutritional_info,
               r.source_url, r.image_url,
               1 - (r.embedding <=> {vec}) AS vector_sim
        FROM recipes r
        WHERE r.embedding IS NOT NULL
        ORDER BY r.embedding <=> {vec}
        LIMIT :candidate_pool
    """)

    rows = (await db.execute(sql, {"candidate_pool": top_k * 4})).mappings().all()

    pantry_set = {p.lower().strip() for p in pantry_ingredients}
    ailment_set = {a.lower() for a in ailment_tags}

    scored = []
    for row in rows:
        vector_sim = float(row["vector_sim"] or 0)
        recipe_ailments = {t.lower() for t in (row["ailment_tags"] or [])}
        ailment_bonus = len(ailment_set & recipe_ailments) * 0.05
        efficacy_bonus = float(row["efficacy_score"] or 0.5) * 0.1
        final_score = vector_sim + ailment_bonus + efficacy_bonus
        scored.append({**dict(row), "final_score": final_score})

    scored.sort(key=lambda x: x["final_score"], reverse=True)
    return scored[:top_k]


async def retrieve_usda_foods(
    query_embedding: List[float],
    top_k: int,
    db: AsyncSession,
) -> List[dict]:
    """IVFFlat cosine similarity search on food_ai_search (1.9M USDA foods).
    Raises probes to 10 for better recall before querying.
    """
    vec = _vec_literal(query_embedding)

    # Set probes separately so the SELECT can use the higher recall setting
    await db.execute(text("SET LOCAL ivfflat.probes = 10"))

    sql = text(f"""
        SELECT fdc_id, description, data_type,
               calories, protein, carbs, fat, search_text,
               1 - (embedding <=> {vec}) AS similarity
        FROM food_ai_search
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> {vec}
        LIMIT :top_k
    """)

    rows = await db.execute(sql, {"top_k": top_k})
    return [dict(r) for r in rows.mappings().all()]


async def run_rag_pipeline(
    query: str,
    pantry_ingredients: List[str],
    db: AsyncSession,
) -> dict:
    """Full RAG pipeline: embed → detect ailments → retrieve chunks + USDA foods + recipes."""
    query_embedding = await embed_text(query)
    ailment_tags = await detect_ailments(query, db)

    chunks = await retrieve_knowledge_chunks(
        query_embedding, ailment_tags, settings.TOP_K_CHUNKS, db
    )
    usda_foods = await retrieve_usda_foods(query_embedding, top_k=6, db=db)
    recipes = await retrieve_recipes(
        query_embedding, ailment_tags, pantry_ingredients, settings.TOP_K_RECIPES, db
    )

    return {
        "query_embedding": query_embedding,
        "ailment_tags": ailment_tags,
        "knowledge_chunks": chunks,
        "usda_foods": usda_foods,
        "recipes": recipes,
    }
