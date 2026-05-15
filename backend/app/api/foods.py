from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db

router = APIRouter(prefix="/foods", tags=["foods"])


@router.get("/search")
async def search_usda_foods(
    q: str = Query(..., min_length=2, max_length=100),
    limit: int = Query(8, ge=1, le=20),
    db: AsyncSession = Depends(get_db),
):
    sql = text("""
        SELECT fdc_id, description, data_type,
               ROUND(calories::numeric, 1)  AS calories,
               ROUND(protein::numeric, 1)   AS protein,
               ROUND(carbs::numeric, 1)     AS carbs,
               ROUND(fat::numeric, 1)       AS fat
        FROM food_ai_search
        WHERE description ILIKE :pattern
        ORDER BY length(description) ASC
        LIMIT :limit
    """)
    rows = await db.execute(sql, {"pattern": f"%{q}%", "limit": limit})
    return [dict(r) for r in rows.mappings().all()]
