from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import uuid

from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User, UserPantry
from app.schemas.user import PantryItemCreate, PantryItemOut

router = APIRouter(prefix="/pantry", tags=["pantry"])


@router.get("", response_model=List[PantryItemOut])
async def list_pantry(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(UserPantry).where(UserPantry.user_id == user.id))
    return result.scalars().all()


@router.post("", response_model=PantryItemOut, status_code=status.HTTP_201_CREATED)
async def add_pantry_item(
    payload: PantryItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = UserPantry(
        user_id=user.id,
        ingredient_name=payload.ingredient_name,
        quantity=payload.quantity,
        unit=payload.unit,
        category=payload.category,
        expiry_date=payload.expiry_date,
        storage_tips=payload.storage_tips,
    )
    db.add(item)
    await db.commit()
    await db.refresh(item)
    return item


@router.post("/bulk", response_model=List[PantryItemOut], status_code=status.HTTP_201_CREATED)
async def add_pantry_bulk(
    items: List[PantryItemCreate],
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if len(items) > 100:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Max 100 items per bulk add")

    new_items = [
        UserPantry(user_id=user.id, ingredient_name=i.ingredient_name,
                   quantity=i.quantity, unit=i.unit, category=i.category,
                   expiry_date=i.expiry_date, storage_tips=i.storage_tips)
        for i in items
    ]
    db.add_all(new_items)
    await db.commit()
    for item in new_items:
        await db.refresh(item)
    return new_items


@router.patch("/{item_id}", response_model=PantryItemOut)
async def update_pantry_item(
    item_id: uuid.UUID,
    payload: PantryItemCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserPantry).where(UserPantry.id == item_id, UserPantry.user_id == user.id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    item.ingredient_name = payload.ingredient_name
    item.quantity        = payload.quantity
    item.unit            = payload.unit
    item.category        = payload.category
    item.expiry_date     = payload.expiry_date
    item.storage_tips    = payload.storage_tips
    await db.commit()
    await db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_pantry_item(
    item_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(UserPantry).where(UserPantry.id == item_id, UserPantry.user_id == user.id)
    )
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Item not found")
    await db.delete(item)
    await db.commit()
