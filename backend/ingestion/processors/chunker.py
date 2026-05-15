"""
Three chunking strategies — pure Python, no LangChain dependency.
"""
import re
from typing import List, Dict

CHUNK_SIZE = 600
CHUNK_OVERLAP = 80

SEPARATORS = ["\n\n", "\n", ". ", "! ", "? ", "; ", " "]


def _split_by_separator(text: str, sep: str, chunk_size: int, overlap: int) -> List[str]:
    parts = text.split(sep)
    chunks, current = [], ""
    for part in parts:
        candidate = (current + sep + part).strip() if current else part.strip()
        if len(candidate) <= chunk_size:
            current = candidate
        else:
            if current:
                chunks.append(current)
            # part itself may be longer than chunk_size — fixed-split it
            if len(part) > chunk_size:
                chunks.extend(fixed_size_chunk(part, chunk_size, overlap))
                current = ""
            else:
                current = part.strip()
    if current:
        chunks.append(current)
    return [c for c in chunks if len(c.strip()) > 50]


def fixed_size_chunk(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    chunks, start = [], 0
    while start < len(text):
        end = min(start + size, len(text))
        chunks.append(text[start:end])
        start += size - overlap
    return [c for c in chunks if len(c.strip()) > 50]


def recursive_chunk(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    if len(text) <= size:
        return [text] if len(text.strip()) > 50 else []
    for sep in SEPARATORS:
        if sep in text:
            chunks = _split_by_separator(text, sep, size, overlap)
            if len(chunks) > 1:
                return chunks
    return fixed_size_chunk(text, size, overlap)


def chunk_document(doc: Dict) -> List[Dict]:
    text = doc.get("text", "")
    if not text:
        return []

    if len(text) > 2000:
        raw_chunks = recursive_chunk(text)
    else:
        raw_chunks = fixed_size_chunk(text)

    return [
        {
            "chunk_text": chunk.strip(),
            "chunk_index": idx,
            "source_url": doc.get("url"),
            "source_title": doc.get("title"),
            "source_type": doc.get("source_type", "article"),
            "category": doc.get("category", "general"),
            "language": doc.get("language", "en"),
            "ailment_tags": doc.get("ailment_tags", []),
            "ingredient_tags": doc.get("ingredient_tags", []),
            "metadata": {"content_hash": doc.get("content_hash"), "original_length": len(text)},
        }
        for idx, chunk in enumerate(raw_chunks)
    ]


def chunk_all_documents(docs: List[Dict]) -> List[Dict]:
    all_chunks = []
    for doc in docs:
        all_chunks.extend(chunk_document(doc))
    return all_chunks
