import json
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.core.deps import get_current_user, get_optional_user
from app.models.user import User
from app.schemas.recommendation import RecommendationRequest, RecommendationResponse
from app.services.recommendation_service import build_recommendations
from app.services.rag_service import run_rag_pipeline
from app.services.llm_service import stream_explanation

router = APIRouter(prefix="/recommendations", tags=["recommendations"])


@router.post("", response_model=RecommendationResponse)
async def get_recommendations(
    payload: RecommendationRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    try:
        return await build_recommendations(
            query=payload.query,
            user=user,
            use_pantry=payload.use_pantry,
            db=db,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Recommendation pipeline failed: {str(e)}",
        )


@router.post("/stream")
async def stream_recommendations(
    payload: RecommendationRequest,
    db: AsyncSession = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """
    SSE endpoint: streams the AI explanation token-by-token while recipes
    are returned as the final SSE event.
    """
    pantry: list[str] = []
    if user and payload.use_pantry:
        from sqlalchemy import select
        from app.models.user import UserPantry
        result = await db.execute(select(UserPantry).where(UserPantry.user_id == user.id))
        pantry = [p.ingredient_name for p in result.scalars().all()]

    rag = await run_rag_pipeline(payload.query, pantry, db)

    async def event_generator():
        yield f"data: {json.dumps({'type': 'ailments', 'data': rag['ailment_tags']})}\n\n"

        recipe_summaries = [
            {"title": r["title"], "efficacy_score": r.get("efficacy_score", 0.5)}
            for r in rag["recipes"]
        ]
        yield f"data: {json.dumps({'type': 'recipes_preview', 'data': recipe_summaries})}\n\n"

        async for token in stream_explanation(
            payload.query,
            rag["ailment_tags"],
            [dict(c) for c in rag["knowledge_chunks"]],
            rag["recipes"],
        ):
            yield f"data: {json.dumps({'type': 'token', 'data': token})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")
