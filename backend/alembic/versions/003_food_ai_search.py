"""Create food_ai_search table for USDA ingredient lookup

Revision ID: 003
Revises: 002
Create Date: 2026-06-17
"""
from typing import Sequence, Union
from alembic import op

revision: str = "003"
down_revision: Union[str, None] = "002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS food_ai_search (
            fdc_id      INTEGER PRIMARY KEY,
            description TEXT    NOT NULL,
            data_type   TEXT,
            calories    FLOAT,
            protein     FLOAT,
            carbs       FLOAT,
            fat         FLOAT
        )
    """)
    # Trigram index for fast ILIKE '%query%' searches (pg_trgm enabled in 001)
    op.execute("""
        CREATE INDEX IF NOT EXISTS idx_food_ai_search_trgm
        ON food_ai_search USING GIN (description gin_trgm_ops)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_food_ai_search_trgm")
    op.execute("DROP TABLE IF EXISTS food_ai_search")
