from functools import lru_cache
from typing import List
from pydantic import AnyHttpUrl, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App
    APP_NAME: str = "Organic Care AI"
    APP_ENV: str = "development"
    LOG_LEVEL: str = "INFO"

    # Database
    DATABASE_URL: str = "postgresql+asyncpg://organic_user:organic_pass@localhost:5432/organic_care"
    POSTGRES_USER: str = "organic_user"
    POSTGRES_PASSWORD: str = "organic_pass"
    POSTGRES_DB: str = "organic_care"
    POSTGRES_HOST: str = "localhost"
    POSTGRES_PORT: int = 5432

    # Redis
    REDIS_URL: str = "redis://localhost:6379/0"

    # OpenAI
    OPENAI_API_KEY: str
    OPENAI_EMBEDDING_MODEL: str = "text-embedding-3-small"
    OPENAI_CHAT_MODEL: str = "gpt-4o-mini"
    OPENAI_EMBEDDING_DIMENSIONS: int = 1536

    # Auth
    SECRET_KEY: str = "change-this-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # CORS
    BACKEND_CORS_ORIGINS: List[str] = ["http://localhost:4200", "http://localhost:3000", "https://frontend-olive-five-95.vercel.app", "https://ai-organic-care.vercel.app", "https://ai-organic-care-git-main-nikhil-perikala-s-projects.vercel.app"]

    # Frontend (used to build password-reset links)
    FRONTEND_URL: str = "http://localhost:4200"

    # Email / SMTP
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_TLS: bool = True
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "noreply@organiccare.ai"

    # Ingestion
    USDA_API_KEY: str = ""
    NUTRITIONIX_APP_ID: str = ""
    NUTRITIONIX_APP_KEY: str = ""

    # RAG
    TOP_K_CHUNKS: int = 8
    TOP_K_RECIPES: int = 3
    SIMILARITY_THRESHOLD: float = 0.70

    @field_validator("BACKEND_CORS_ORIGINS", mode="before")
    @classmethod
    def parse_cors(cls, v):
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
