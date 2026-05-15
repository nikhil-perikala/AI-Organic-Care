from typing import List
from openai import AsyncOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential
from app.config import settings

_client: AsyncOpenAI | None = None


def get_openai_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def embed_text(text: str) -> List[float]:
    client = get_openai_client()
    response = await client.embeddings.create(
        model=settings.OPENAI_EMBEDDING_MODEL,
        input=text.strip(),
        dimensions=settings.OPENAI_EMBEDDING_DIMENSIONS,
    )
    return response.data[0].embedding


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def embed_batch(texts: List[str]) -> List[List[float]]:
    if not texts:
        return []
    client = get_openai_client()
    cleaned = [t.strip() for t in texts if t.strip()]
    response = await client.embeddings.create(
        model=settings.OPENAI_EMBEDDING_MODEL,
        input=cleaned,
        dimensions=settings.OPENAI_EMBEDDING_DIMENSIONS,
    )
    return [item.embedding for item in sorted(response.data, key=lambda x: x.index)]
