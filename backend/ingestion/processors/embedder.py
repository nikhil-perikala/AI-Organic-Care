"""
Embedding generation: batches chunks and calls OpenAI text-embedding-3-small.
Stores results into PostgreSQL via SQLAlchemy.
"""
import asyncio
from typing import List, Dict
from openai import AsyncOpenAI
import structlog

from app.config import settings

logger = structlog.get_logger()

BATCH_SIZE = 100


async def embed_chunks_batch(chunks: List[Dict], client: AsyncOpenAI) -> List[Dict]:
    """Add 'embedding' field to each chunk dict."""
    texts = [c["chunk_text"] for c in chunks]
    response = await client.embeddings.create(
        model=settings.OPENAI_EMBEDDING_MODEL,
        input=texts,
        dimensions=settings.OPENAI_EMBEDDING_DIMENSIONS,
    )
    for i, item in enumerate(sorted(response.data, key=lambda x: x.index)):
        chunks[i]["embedding"] = item.embedding
    return chunks


async def embed_all_chunks(chunks: List[Dict]) -> List[Dict]:
    """Process all chunks in batches, returning chunks with embeddings."""
    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    embedded = []

    for i in range(0, len(chunks), BATCH_SIZE):
        batch = chunks[i:i + BATCH_SIZE]
        try:
            batch = await embed_chunks_batch(batch, client)
            embedded.extend(batch)
            logger.info("Embedded batch", batch_num=i // BATCH_SIZE + 1, size=len(batch))
        except Exception as e:
            logger.error("Embedding batch failed", batch_start=i, error=str(e))

    return embedded


async def store_chunks(chunks: List[Dict], run_id: str, db_session) -> int:
    """Upsert embedded chunks into knowledge_chunks table."""
    from app.models.knowledge import KnowledgeChunk
    import tiktoken

    enc = tiktoken.get_encoding("cl100k_base")
    stored = 0

    for chunk in chunks:
        if not chunk.get("embedding"):
            continue

        token_count = len(enc.encode(chunk["chunk_text"]))
        kc = KnowledgeChunk(
            chunk_text=chunk["chunk_text"],
            embedding=chunk["embedding"],
            source_url=chunk.get("source_url"),
            source_title=chunk.get("source_title"),
            source_type=chunk.get("source_type"),
            category=chunk.get("category"),
            ailment_tags=chunk.get("ailment_tags", []),
            ingredient_tags=chunk.get("ingredient_tags", []),
            metadata_=chunk.get("metadata"),
            language=chunk.get("language", "en"),
            chunk_index=chunk.get("chunk_index", 0),
            token_count=token_count,
            ingestion_run_id=run_id,
        )
        db_session.add(kc)
        stored += 1

    await db_session.commit()
    logger.info("Stored knowledge chunks", count=stored, run_id=run_id)
    return stored
