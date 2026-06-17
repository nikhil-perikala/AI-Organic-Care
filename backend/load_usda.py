"""
Load USDA FoodData Central foods into food_ai_search table.

Uses the official USDA FDC API (free key from https://api.nal.usda.gov/).
Loads Foundation Foods + SR Legacy (~10,000 whole foods) with nutrition data.
Safe to re-run: uses ON CONFLICT DO NOTHING.

Usage:
    USDA_API_KEY=your_key python load_usda.py
"""
import asyncio
import os
import time

import asyncpg
import httpx
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
API_KEY = os.environ.get("USDA_API_KEY", "DEMO_KEY")
BASE_URL = "https://api.nal.usda.gov/fdc/v1"

# Foundation Foods: ~2,000 meticulously documented whole foods
# SR Legacy: ~8,000 classic USDA reference foods
DATA_TYPES = ["Foundation", "SR Legacy"]

# USDA nutrient IDs
NUTRIENT_CALORIES = 1008   # Energy (kcal)
NUTRIENT_PROTEIN  = 1003   # Protein (g)
NUTRIENT_CARBS    = 1005   # Carbohydrates, by difference (g)
NUTRIENT_FAT      = 1004   # Total lipids / fat (g)

WANTED_NUTRIENTS = [NUTRIENT_CALORIES, NUTRIENT_PROTEIN, NUTRIENT_CARBS, NUTRIENT_FAT]

PAGE_SIZE   = 200   # max allowed by USDA API
BATCH_SIZE  = 50    # foods per POST /foods request (keep well under limits)
INSERT_CHUNK = 500  # rows per DB insert


def _extract_nutrient(food: dict, nutrient_id: int) -> float | None:
    for fn in food.get("foodNutrients", []):
        nid = fn.get("nutrientId") or fn.get("nutrient", {}).get("id")
        if nid == nutrient_id:
            return fn.get("value") or fn.get("amount")
    return None


async def fetch_all_fdc_ids(client: httpx.AsyncClient) -> list[int]:
    """Paginate through /foods/list for all matching data types."""
    fdc_ids: list[int] = []
    for data_type in DATA_TYPES:
        page = 1
        while True:
            resp = client.get(
                f"{BASE_URL}/foods/list",
                params={
                    "dataType": data_type,
                    "pageSize": PAGE_SIZE,
                    "pageNumber": page,
                    "api_key": API_KEY,
                },
                timeout=30,
            )
            resp.raise_for_status()
            items = resp.json()
            if not items:
                break
            fdc_ids.extend(item["fdcId"] for item in items)
            print(f"  {data_type} page {page}: +{len(items)} foods ({len(fdc_ids)} total)")
            if len(items) < PAGE_SIZE:
                break
            page += 1
            time.sleep(0.1)   # be a polite API citizen
    return fdc_ids


async def fetch_food_details(client: httpx.AsyncClient, fdc_ids: list[int]) -> list[dict]:
    """POST /foods to get abridged nutrition data for a batch of IDs."""
    resp = client.post(
        f"{BASE_URL}/foods",
        json={
            "fdcIds": fdc_ids,
            "format": "abridged",
            "nutrients": WANTED_NUTRIENTS,
        },
        params={"api_key": API_KEY},
        timeout=60,
    )
    resp.raise_for_status()
    return resp.json()


async def main() -> None:
    conn = await asyncpg.connect(DB_URL)

    # Verify table exists
    exists = await conn.fetchval(
        "SELECT to_regclass('public.food_ai_search')::text"
    )
    if not exists:
        print("ERROR: food_ai_search table does not exist.")
        print("Run 'alembic upgrade head' first.")
        await conn.close()
        return

    existing = await conn.fetchval("SELECT COUNT(*) FROM food_ai_search")
    print(f"food_ai_search currently has {existing} rows.")

    with httpx.Client() as client:
        print(f"\nFetching food IDs from USDA FDC (API key: {API_KEY[:8]}...)...")
        fdc_ids = await fetch_all_fdc_ids(client)
        print(f"\nTotal foods to load: {len(fdc_ids)}")

        # Fetch nutrition details in batches
        rows_to_insert: list[tuple] = []
        total_batches = (len(fdc_ids) + BATCH_SIZE - 1) // BATCH_SIZE

        for i in range(0, len(fdc_ids), BATCH_SIZE):
            batch_ids = fdc_ids[i : i + BATCH_SIZE]
            batch_num = i // BATCH_SIZE + 1
            try:
                foods = await fetch_food_details(client, batch_ids)
                for food in foods:
                    rows_to_insert.append((
                        food["fdcId"],
                        food.get("description", ""),
                        food.get("dataType", ""),
                        _extract_nutrient(food, NUTRIENT_CALORIES),
                        _extract_nutrient(food, NUTRIENT_PROTEIN),
                        _extract_nutrient(food, NUTRIENT_CARBS),
                        _extract_nutrient(food, NUTRIENT_FAT),
                    ))
            except Exception as e:
                print(f"  Batch {batch_num}/{total_batches} failed: {e} — skipping")

            if batch_num % 10 == 0 or batch_num == total_batches:
                print(f"  Fetched batch {batch_num}/{total_batches} ({len(rows_to_insert)} rows ready)")

            time.sleep(0.05)  # gentle rate limiting

        # Bulk insert in chunks
        print(f"\nInserting {len(rows_to_insert)} rows into food_ai_search...")
        inserted = 0
        for j in range(0, len(rows_to_insert), INSERT_CHUNK):
            chunk = rows_to_insert[j : j + INSERT_CHUNK]
            await conn.executemany(
                """
                INSERT INTO food_ai_search
                    (fdc_id, description, data_type, calories, protein, carbs, fat)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (fdc_id) DO NOTHING
                """,
                chunk,
            )
            inserted += len(chunk)
            print(f"  Inserted {inserted}/{len(rows_to_insert)} rows")

    final = await conn.fetchval("SELECT COUNT(*) FROM food_ai_search")
    print(f"\nDone. food_ai_search now has {final} rows.")
    await conn.close()


asyncio.run(main())
