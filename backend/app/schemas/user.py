import uuid
from datetime import datetime, date
from typing import Optional, List
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator


class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    full_name: Optional[str] = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenRefresh(BaseModel):
    refresh_token: str


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    full_name: Optional[str]
    is_active: bool
    created_at: datetime


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyOtpRequest(BaseModel):
    email: EmailStr
    otp: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class VerifyOtpOut(BaseModel):
    reset_token: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class UserProfileUpdate(BaseModel):
    dietary_preferences: Optional[List[str]] = None
    allergies: Optional[List[str]] = None
    health_goals: Optional[List[str]] = None
    disliked_ingredients: Optional[List[str]] = None
    liked_cuisines: Optional[List[str]] = None
    serving_size: Optional[int] = Field(None, ge=1, le=20)


class PantryItemCreate(BaseModel):
    ingredient_name: str = Field(min_length=1, max_length=255)
    quantity: Optional[str] = None
    unit: Optional[str] = None
    category: Optional[str] = None
    expiry_date: Optional[date] = None
    storage_tips: Optional[str] = Field(None, max_length=500)

    @field_validator('quantity', mode='before')
    @classmethod
    def coerce_quantity_to_str(cls, v):
        if v is None:
            return None
        return str(v)


class PantryItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    ingredient_name: str
    quantity: Optional[str]
    unit: Optional[str]
    category: Optional[str]
    expiry_date: Optional[date]
    storage_tips: Optional[str]
    added_at: datetime
