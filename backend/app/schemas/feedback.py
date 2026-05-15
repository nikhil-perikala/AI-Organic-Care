import uuid
from datetime import datetime
from typing import Optional, Literal
from pydantic import BaseModel, ConfigDict


class FeedbackCreate(BaseModel):
    session_id: Optional[uuid.UUID] = None
    recipe_id: Optional[uuid.UUID] = None
    feedback_type: Literal["like", "dislike", "save", "skip"]
    comment: Optional[str] = None


class FeedbackOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    feedback_type: str
    comment: Optional[str]
    created_at: datetime
