import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, DateTime, ForeignKey, Text, JSON, Boolean, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID
from app.database import Base


class RecommendationSession(Base):
    __tablename__ = "recommendation_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    user_query: Mapped[str] = mapped_column(Text, nullable=False)
    detected_ailments: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    retrieved_chunk_ids: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    recipe_ids_returned: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    ai_explanation: Mapped[Optional[str]] = mapped_column(Text)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[Optional["User"]] = relationship("User", back_populates="sessions")
    feedback: Mapped[List["UserFeedback"]] = relationship("UserFeedback", back_populates="session", cascade="all, delete-orphan")


class UserFeedback(Base):
    __tablename__ = "user_feedback"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"))
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("recommendation_sessions.id", ondelete="SET NULL"))
    recipe_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="SET NULL"))
    feedback_type: Mapped[str] = mapped_column(String(20), nullable=False)  # like / dislike / save / skip
    comment: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped[Optional["User"]] = relationship("User", back_populates="feedback")
    session: Mapped[Optional["RecommendationSession"]] = relationship("RecommendationSession", back_populates="feedback")


class SavedRecommendation(Base):
    __tablename__ = "saved_recommendations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"))
    recipe_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"))
    notes: Mapped[Optional[str]] = mapped_column(Text)
    saved_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="saved_recommendations")
