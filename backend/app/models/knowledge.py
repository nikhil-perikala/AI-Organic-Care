import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, DateTime, Text, JSON, Float, Index
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.postgresql import UUID
from pgvector.sqlalchemy import Vector
from app.database import Base


class KnowledgeChunk(Base):
    __tablename__ = "knowledge_chunks"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    chunk_text: Mapped[str] = mapped_column(Text, nullable=False)
    embedding: Mapped[Optional[List[float]]] = mapped_column(Vector(1536))
    source_url: Mapped[Optional[str]] = mapped_column(String(1000))
    source_title: Mapped[Optional[str]] = mapped_column(String(500))
    source_type: Mapped[Optional[str]] = mapped_column(String(100))
    category: Mapped[Optional[str]] = mapped_column(String(100))
    ailment_tags: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    ingredient_tags: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    metadata_: Mapped[Optional[dict]] = mapped_column("metadata", JSON)
    language: Mapped[str] = mapped_column(String(10), default="en")
    chunk_index: Mapped[int] = mapped_column(default=0)
    token_count: Mapped[Optional[int]] = mapped_column()
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    ingestion_run_id: Mapped[Optional[str]] = mapped_column(String(100))

    __table_args__ = (
        Index(
            "ix_knowledge_embedding_hnsw",
            "embedding",
            postgresql_using="hnsw",
            postgresql_with={"m": 16, "ef_construction": 64},
            postgresql_ops={"embedding": "vector_cosine_ops"},
        ),
    )


class AilmentMapping(Base):
    """Maps user-reported symptoms to standardized ailment terms for retrieval."""
    __tablename__ = "ailment_mappings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_term: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    canonical_ailment: Mapped[str] = mapped_column(String(255), nullable=False)
    related_ailments: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    beneficial_nutrients: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    keywords: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    priority: Mapped[int] = mapped_column(default=5)
