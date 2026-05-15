import uuid
from typing import Optional, List
from pydantic import BaseModel, Field


class RecommendationRequest(BaseModel):
    query: str = Field(min_length=2, max_length=1000, description="User's symptom or food question")
    use_pantry: bool = True


class ShoppingItem(BaseModel):
    ingredient_name: str
    quantity: Optional[str]
    unit: Optional[str]
    reason: str


class MealRecommendation(BaseModel):
    rank: int
    recipe_id: uuid.UUID
    title: str
    description: Optional[str]
    meal_type: Optional[str]
    prep_time_minutes: Optional[int]
    cook_time_minutes: Optional[int]
    servings: int
    efficacy_score: float
    health_benefits: List[str]
    dietary_labels: List[str]
    ailment_addressed: List[str]
    ingredients: List[dict]
    missing_ingredients: List[ShoppingItem]
    image_url: Optional[str]
    source_url: Optional[str]
    nutritional_info: Optional[dict]


class RecommendationResponse(BaseModel):
    session_id: uuid.UUID
    query: str
    detected_ailments: List[str]
    ai_explanation: str
    evidence_summary: str
    recommendations: List[MealRecommendation]
    shopping_list: List[ShoppingItem]
    knowledge_sources: List[str]
