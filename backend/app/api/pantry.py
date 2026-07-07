import base64
import io
import json
import uuid
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.core.deps import get_current_user
from app.models.user import User, UserPantry
from app.schemas.user import PantryItemCreate, PantryItemOut

router = APIRouter(prefix="/pantry", tags=["pantry"])

# ── Existing CRUD endpoints ────────────────────────────────────────────────────

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


# ── Receipt OCR endpoint ───────────────────────────────────────────────────────

_RECEIPT_PROMPT = """You are a grocery receipt and shopping list parser. Extract every food and grocery item, including its weight or quantity.

Return ONLY a valid JSON array. No explanation, no markdown, no extra text.
Each item must be an object with exactly these keys:
- "ingredient_name": clean readable food name ONLY — no numbers, no units, no prices (string)
- "quantity": the numeric amount as a number (e.g. 500, 1.5, 2) or null if truly absent
- "unit": unit of measure (e.g. "g","kg","ml","L","lb","oz","gallon","count","bag","box","can","bunch","pack","piece") or null
- "expiry_date": always null

CRITICAL — always separate weight/quantity from the name:
- "Chicken Breast 500g"   → ingredient_name: "Chicken Breast",   quantity: 500,  unit: "g"
- "Whole Milk 2L"         → ingredient_name: "Whole Milk",        quantity: 2,    unit: "L"
- "Basmati Rice 1kg"      → ingredient_name: "Basmati Rice",      quantity: 1,    unit: "kg"
- "Tomatoes - 250g"       → ingredient_name: "Tomatoes",          quantity: 250,  unit: "g"
- "2 LB APPLES"           → ingredient_name: "Apples",            quantity: 2,    unit: "lb"
- "Eggs x12"              → ingredient_name: "Eggs",              quantity: 12,   unit: "count"
- "ORG BNNA"              → ingredient_name: "Organic Bananas",   quantity: null, unit: null
- "Olive Oil 500ml"       → ingredient_name: "Olive Oil",         quantity: 500,  unit: "ml"

Rules:
- Include ONLY food/grocery items (produce, dairy, meat, pantry staples, beverages, snacks)
- Exclude: store name, address, phone, cashier, prices, taxes, subtotals, totals, receipt number, bags, non-food items
- If weight/size appears anywhere in the line (before or after the name, in parentheses, after a dash), always extract it into quantity + unit
- Clean up abbreviated or abbreviated names into readable English

Example output:
[{"ingredient_name":"Whole Milk","quantity":2,"unit":"L","expiry_date":null},{"ingredient_name":"Chicken Breast","quantity":500,"unit":"g","expiry_date":null},{"ingredient_name":"Organic Bananas","quantity":3,"unit":"count","expiry_date":null}]"""


def _parse_ai_response(content: str) -> list:
    """Extract and validate the JSON array from the AI response."""
    content = content.strip()
    start = content.find('[')
    end   = content.rfind(']') + 1
    if start == -1 or end == 0:
        return []
    try:
        raw = json.loads(content[start:end])
    except json.JSONDecodeError:
        return []

    result = []
    for item in raw:
        if not isinstance(item, dict) or not item.get("ingredient_name"):
            continue
        qty = item.get("quantity")
        result.append({
            "ingredient_name": str(item["ingredient_name"]).strip(),
            "quantity": str(qty) if qty is not None else None,
            "unit": str(item.get("unit") or "").strip() or None,
            "expiry_date": None,
        })
    return result


async def _extract_from_image(client, image_bytes: bytes, mime: str) -> list:
    b64 = base64.b64encode(image_bytes).decode()
    response = await client.chat.completions.create(
        model=settings.OPENAI_CHAT_MODEL,
        messages=[{
            "role": "user",
            "content": [
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:{mime};base64,{b64}",
                        "detail": "high",
                    },
                },
                {"type": "text", "text": _RECEIPT_PROMPT},
            ],
        }],
        max_tokens=1500,
    )
    return _parse_ai_response(response.choices[0].message.content or "")


async def _extract_from_text(client, text: str) -> list:
    response = await client.chat.completions.create(
        model=settings.OPENAI_CHAT_MODEL,
        messages=[{
            "role": "user",
            "content": f"{_RECEIPT_PROMPT}\n\nReceipt text:\n{text[:5000]}",
        }],
        max_tokens=1500,
    )
    return _parse_ai_response(response.choices[0].message.content or "")


@router.post("/upload-receipt")
async def upload_receipt(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """
    OCR a grocery receipt photo or PDF and return extracted pantry items.
    Items are NOT saved — the frontend presents them for user review first.
    Accepts: JPEG, PNG, WebP (photo of receipt) or PDF (digital receipt).
    """
    from openai import AsyncOpenAI
    from PyPDF2 import PdfReader

    MAX_BYTES = 10 * 1024 * 1024  # 10 MB
    content = await file.read()
    if len(content) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File too large. Maximum size is 10 MB.",
        )

    mime     = (file.content_type or "").lower().split(";")[0].strip()
    filename = (file.filename or "").lower()

    SUPPORTED_IMAGES = {"image/jpeg", "image/jpg", "image/png", "image/webp"}
    is_pdf   = "pdf" in mime or filename.endswith(".pdf")
    is_image = mime in SUPPORTED_IMAGES or filename.endswith((".jpg", ".jpeg", ".png", ".webp"))

    if not is_pdf and not is_image:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file type. Please upload a JPEG, PNG, WebP image or a PDF.",
        )

    client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)

    try:
        if is_pdf:
            reader = PdfReader(io.BytesIO(content))
            text = "\n".join(
                page.extract_text() or "" for page in reader.pages[:5]
            ).strip()
            if not text:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="This PDF has no extractable text. Please upload a photo of the receipt instead.",
                )
            items = await _extract_from_text(client, text)
        else:
            items = await _extract_from_image(client, content, mime or "image/jpeg")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI processing failed: {str(exc)}",
        )

    return {"items": items}
