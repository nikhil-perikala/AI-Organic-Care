"""Add missing columns to users and user_pantry; add chat tables if absent

Revision ID: 002
Revises: 001
Create Date: 2026-06-04
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── users: add OTP reset columns (IF NOT EXISTS = safe on fresh DBs) ────
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_hash VARCHAR(255)")
    op.execute("ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_expires_at TIMESTAMP")

    # ── user_pantry: add expiry / storage columns ────────────────────────────
    op.execute("ALTER TABLE user_pantry ADD COLUMN IF NOT EXISTS expiry_date DATE")
    op.execute("ALTER TABLE user_pantry ADD COLUMN IF NOT EXISTS storage_tips VARCHAR(500)")

    # ── chat_history ─────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS chat_history (
            id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            role        VARCHAR(20) NOT NULL,
            content     TEXT NOT NULL,
            created_at  TIMESTAMP DEFAULT NOW()
        )
    """)

    # ── chat_feedback ────────────────────────────────────────────────────────
    op.execute("""
        CREATE TABLE IF NOT EXISTS chat_feedback (
            id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            message_id  UUID NOT NULL REFERENCES chat_history(id) ON DELETE CASCADE,
            rating      INTEGER NOT NULL,
            created_at  TIMESTAMP DEFAULT NOW(),
            CONSTRAINT uq_chat_feedback_user_msg UNIQUE (user_id, message_id)
        )
    """)


def downgrade() -> None:
    op.execute("DROP TABLE IF EXISTS chat_feedback")
    op.execute("DROP TABLE IF EXISTS chat_history")
    op.execute("ALTER TABLE user_pantry DROP COLUMN IF EXISTS storage_tips")
    op.execute("ALTER TABLE user_pantry DROP COLUMN IF EXISTS expiry_date")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS reset_otp_expires_at")
    op.execute("ALTER TABLE users DROP COLUMN IF EXISTS reset_otp_hash")
