import structlog
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.api import auth, recommendations, pantry, users, feedback, recipes, foods, insights, chat, notifications, ai_meals

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting Organic Care AI", env=settings.APP_ENV)
    await init_db()
    yield
    logger.info("Shutting down")


app = FastAPI(
    title=settings.APP_NAME,
    version="1.0.0",
    description="Personalized organic-food wellness companion powered by RAG",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.BACKEND_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/v1")
app.include_router(recommendations.router, prefix="/api/v1")
app.include_router(pantry.router, prefix="/api/v1")
app.include_router(users.router, prefix="/api/v1")
app.include_router(feedback.router, prefix="/api/v1")
app.include_router(recipes.router, prefix="/api/v1")
app.include_router(foods.router, prefix="/api/v1")
app.include_router(insights.router, prefix="/api/v1")
app.include_router(chat.router, prefix="/api/v1")
app.include_router(notifications.router, prefix="/api/v1")
app.include_router(ai_meals.router, prefix="/api/v1")


@app.get("/health")
async def health():
    return {"status": "ok", "app": settings.APP_NAME}
