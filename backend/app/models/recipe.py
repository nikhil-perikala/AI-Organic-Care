import uuid
from datetime import datetime
from typing import Optional, List
from sqlalchemy import String, Float, Integer, DateTime, ForeignKey, Text, JSON, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from app.database import Base


class Ingredient(Base):
    __tablename__ = "ingredients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    category: Mapped[Optional[str]] = mapped_column(String(100))
    nutrients: Mapped[Optional[dict]] = mapped_column(JSON)
    health_benefits: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    ailment_tags: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    efficacy_score: Mapped[float] = mapped_column(Float, default=0.5)
    is_organic: Mapped[bool] = mapped_column(default=False)
    usda_food_id: Mapped[Optional[str]] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    recipe_links: Mapped[List["RecipeIngredient"]] = relationship("RecipeIngredient", back_populates="ingredient")


class Recipe(Base):
    __tablename__ = "recipes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(500), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text)
    instructions: Mapped[Optional[str]] = mapped_column(Text)
    prep_time_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    cook_time_minutes: Mapped[Optional[int]] = mapped_column(Integer)
    servings: Mapped[int] = mapped_column(Integer, default=2)
    cuisine_type: Mapped[Optional[str]] = mapped_column(String(100))
    meal_type: Mapped[Optional[str]] = mapped_column(String(100))
    ailment_tags: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    health_benefits: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    dietary_labels: Mapped[Optional[List[str]]] = mapped_column(JSON, default=list)
    efficacy_score: Mapped[float] = mapped_column(Float, default=0.5)
    nutritional_info: Mapped[Optional[dict]] = mapped_column(JSON)
    source_url: Mapped[Optional[str]] = mapped_column(String(1000))
    image_url: Mapped[Optional[str]] = mapped_column(String(1000))
    embedding: Mapped[Optional[List[float]]] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    recipe_ingredients: Mapped[List["RecipeIngredient"]] = relationship("RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan")


class RecipeIngredient(Base):
    __tablename__ = "recipe_ingredients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    recipe_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("recipes.id", ondelete="CASCADE"))
    ingredient_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("ingredients.id", ondelete="CASCADE"))
    quantity: Mapped[Optional[str]] = mapped_column(String(100))
    unit: Mapped[Optional[str]] = mapped_column(String(50))
    notes: Mapped[Optional[str]] = mapped_column(String(255))
    is_optional: Mapped[bool] = mapped_column(default=False)

    recipe: Mapped["Recipe"] = relationship("Recipe", back_populates="recipe_ingredients")
    ingredient: Mapped["Ingredient"] = relationship("Ingredient", back_populates="recipe_links")
