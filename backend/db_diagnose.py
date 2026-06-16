"""One-shot DB diagnostic: checks food_ai_search table schema and content."""
import asyncio
import os

import asyncpg
from dotenv import load_dotenv

load_dotenv()

DB_URL = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")


async def main() -> None:
    conn = await asyncpg.connect(DB_URL)

    print("=== TABLE EXISTS? ===")
    exists = await conn.fetchval("SELECT to_regclass('public.food_ai_search')::text")
    print("food_ai_search:", exists)

    print("\n=== ALL TABLES IN DB ===")
    tables = await conn.fetch(
        "SELECT table_schema, table_name "
        "FROM information_schema.tables "
        "WHERE table_schema NOT IN ('pg_catalog','information_schema') "
        "ORDER BY table_schema, table_name"
    )
    for t in tables:
        print(dict(t))

    if not exists:
        print("\nfood_ai_search does not exist — nothing more to check.")
        await conn.close()
        return

    print("\n=== ROW COUNT ===")
    count = await conn.fetchval("SELECT COUNT(*) FROM food_ai_search")
    print("rows:", count)

    print("\n=== COLUMN NAMES ===")
    cols = await conn.fetch(
        "SELECT column_name, data_type "
        "FROM information_schema.columns "
        "WHERE table_name='food_ai_search' "
        "ORDER BY ordinal_position"
    )
    for c in cols:
        print(dict(c))

    print("\n=== SAMPLE ROW ===")
    sample = await conn.fetchrow("SELECT * FROM food_ai_search LIMIT 1")
    print(dict(sample) if sample else "NO ROWS")

    print("\n=== TAMARIND SEARCH ===")
    rows = await conn.fetch(
        "SELECT * FROM food_ai_search WHERE description ILIKE '%tamarind%' LIMIT 5"
    )
    for r in rows:
        print(dict(r))
    if not rows:
        print("(no results)")

    print("\n=== TOMATO SEARCH ===")
    rows = await conn.fetch(
        "SELECT * FROM food_ai_search WHERE description ILIKE '%tomato%' LIMIT 3"
    )
    for r in rows:
        print(dict(r))
    if not rows:
        print("(no results)")

    await conn.close()


asyncio.run(main())
