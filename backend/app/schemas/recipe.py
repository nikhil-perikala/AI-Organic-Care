import uuid
from typing import Optional, List, Any
from pydantic import BaseModel, ConfigDict


class IngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    category: Optional[str]
    health_benefits: List[str]
    efficacy_score: float
    is_organic: bool


class RecipeIngredientOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    ingredient: IngredientOut
    quantity: Optional[str]
    unit: Optional[str]
    notes: Optional[str]
    is_optional: bool


class RecipeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: str
    description: Optional[str]
    instructions: Optional[str]
    prep_time_minutes: Optional[int]
    cook_time_minutes: Optional[int]
    servings: int
    cuisine_type: Optional[str]
    meal_type: Optional[str]
    ailment_tags: List[str]
    health_benefits: List[str]
    dietary_labels: List[str]
    efficacy_score: float
    nutritional_info: Optional[dict]
    source_url: Optional[str]
    image_url: Optional[str]
    recipe_ingredients: List[RecipeIngredientOut] = []


class AiIngredientOut(BaseModel):
    name: str
    quantity: Optional[str] = None
    unit: Optional[str] = None


class GeneratedRecipeOut(BaseModel):
    id: Optional[str] = None
    is_ai_generated: bool = False
    title: str
    description: Optional[str] = None
    prep_time_minutes: Optional[int] = None
    cook_time_minutes: Optional[int] = None
    servings: int = 2
    meal_type: Optional[str] = None
    cuisine_type: Optional[str] = None
    ingredients: List[AiIngredientOut] = []
    instructions: List[str] = []
    nutritional_info: Optional[dict] = None
    cooking_tips: List[str] = []
    dietary_labels: List[str] = []
    health_benefits: List[str] = []
    ailment_tags: List[str] = []
    image_url: Optional[str] = None
