"""Initial schema with pgvector

Revision ID: 001
Revises:
Create Date: 2024-01-01
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from pgvector.sqlalchemy import Vector
from sqlalchemy.dialects import postgresql

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"')
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("full_name", sa.String(255)),
        sa.Column("is_active", sa.Boolean(), default=True),
        sa.Column("is_verified", sa.Boolean(), default=False),
        sa.Column("reset_otp_hash", sa.String(255), nullable=True),
        sa.Column("reset_otp_expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("NOW()")),
        if_not_exists=True,
    )
    op.create_index("ix_users_email", "users", ["email"], if_not_exists=True)

    op.create_table(
        "user_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), unique=True),
        sa.Column("dietary_preferences", postgresql.JSON()),
        sa.Column("allergies", postgresql.JSON()),
        sa.Column("health_goals", postgresql.JSON()),
        sa.Column("disliked_ingredients", postgresql.JSON()),
        sa.Column("liked_cuisines", postgresql.JSON()),
        sa.Column("serving_size", sa.Integer(), default=2),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("NOW()")),
        if_not_exists=True,
    )

    op.create_table(
        "user_pantry",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("ingredient_name", sa.String(255), nullable=False),
        sa.Column("quantity", sa.String(100)),
        sa.Column("unit", sa.String(50)),
        sa.Column("category", sa.String(100)),
        sa.Column("expiry_date", sa.Date(), nullable=True),
        sa.Column("storage_tips", sa.String(500), nullable=True),
        sa.Column("added_at", sa.DateTime(), server_default=sa.text("NOW()")),
        if_not_exists=True,
    )

    op.create_table(
        "ingredients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("name", sa.String(255), nullable=False, unique=True),
        sa.Column("category", sa.String(100)),
        sa.Column("nutrients", postgresql.JSON()),
        sa.Column("health_benefits", postgresql.JSON()),
        sa.Column("ailment_tags", postgresql.JSON()),
        sa.Column("efficacy_score", sa.Float(), default=0.5),
        sa.Column("is_organic", sa.Boolean(), default=False),
        sa.Column("usda_food_id", sa.String(100)),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()")),
        if_not_exists=True,
    )
    op.create_index("ix_ingredients_name", "ingredients", ["name"], if_not_exists=True)

    op.create_table(
        "recipes",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("instructions", sa.Text()),
        sa.Column("prep_time_minutes", sa.Integer()),
        sa.Column("cook_time_minutes", sa.Integer()),
        sa.Column("servings", sa.Integer(), default=2),
        sa.Column("cuisine_type", sa.String(100)),
        sa.Column("meal_type", sa.String(100)),
        sa.Column("ailment_tags", postgresql.JSON()),
        sa.Column("health_benefits", postgresql.JSON()),
        sa.Column("dietary_labels", postgresql.JSON()),
        sa.Column("efficacy_score", sa.Float(), default=0.5),
        sa.Column("nutritional_info", postgresql.JSON()),
        sa.Column("source_url", sa.String(1000)),
        sa.Column("image_url", sa.String(1000)),
        sa.Column("embedding", Vector(1536)),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()")),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("NOW()")),
        if_not_exists=True,
    )
    op.create_index("ix_recipes_title", "recipes", ["title"], if_not_exists=True)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_recipe_embedding_hnsw ON recipes
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

    op.create_table(
        "recipe_ingredients",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id", ondelete="CASCADE")),
        sa.Column("ingredient_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("ingredients.id", ondelete="CASCADE")),
        sa.Column("quantity", sa.String(100)),
        sa.Column("unit", sa.String(50)),
        sa.Column("notes", sa.String(255)),
        sa.Column("is_optional", sa.Boolean(), default=False),
        if_not_exists=True,
    )

    op.create_table(
        "knowledge_chunks",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("chunk_text", sa.Text(), nullable=False),
        sa.Column("embedding", Vector(1536)),
        sa.Column("source_url", sa.String(1000)),
        sa.Column("source_title", sa.String(500)),
        sa.Column("source_type", sa.String(100)),
        sa.Column("category", sa.String(100)),
        sa.Column("ailment_tags", postgresql.JSON()),
        sa.Column("ingredient_tags", postgresql.JSON()),
        sa.Column("metadata", postgresql.JSON()),
        sa.Column("language", sa.String(10), default="en"),
        sa.Column("chunk_index", sa.Integer(), default=0),
        sa.Column("token_count", sa.Integer()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()")),
        sa.Column("ingestion_run_id", sa.String(100)),
        if_not_exists=True,
    )
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_knowledge_embedding_hnsw ON knowledge_chunks
        USING hnsw (embedding vector_cosine_ops)
        WITH (m = 16, ef_construction = 64)
    """)

    op.create_table(
        "ailment_mappings",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_term", sa.String(255), nullable=False),
        sa.Column("canonical_ailment", sa.String(255), nullable=False),
        sa.Column("related_ailments", postgresql.JSON()),
        sa.Column("beneficial_nutrients", postgresql.JSON()),
        sa.Column("keywords", postgresql.JSON()),
        sa.Column("priority", sa.Integer(), default=5),
        if_not_exists=True,
    )
    op.create_index("ix_ailment_mappings_user_term", "ailment_mappings", ["user_term"], if_not_exists=True)

    op.create_table(
        "recommendation_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("user_query", sa.Text(), nullable=False),
        sa.Column("detected_ailments", postgresql.JSON()),
        sa.Column("retrieved_chunk_ids", postgresql.JSON()),
        sa.Column("recipe_ids_returned", postgresql.JSON()),
        sa.Column("ai_explanation", sa.Text()),
        sa.Column("latency_ms", sa.Integer()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()")),
        if_not_exists=True,
    )

    op.create_table(
        "user_feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recommendation_sessions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("feedback_type", sa.String(20), nullable=False),
        sa.Column("comment", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()")),
        if_not_exists=True,
    )

    op.create_table(
        "saved_recommendations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("recipe_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("recipes.id", ondelete="CASCADE")),
        sa.Column("notes", sa.Text()),
        sa.Column("saved_at", sa.DateTime(), server_default=sa.text("NOW()")),
        if_not_exists=True,
    )

    op.create_table(
        "chat_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("role", sa.String(20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()")),
        if_not_exists=True,
    )

    op.create_table(
        "chat_feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("uuid_generate_v4()")),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE")),
        sa.Column("message_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("chat_history.id", ondelete="CASCADE")),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("NOW()")),
        sa.UniqueConstraint("user_id", "message_id", name="uq_chat_feedback_user_msg"),
        if_not_exists=True,
    )

    # Seed ailment mappings (INSERT … ON CONFLICT DO NOTHING = idempotent)
    op.execute("""
    INSERT INTO ailment_mappings (id, user_term, canonical_ailment, related_ailments, keywords, priority)
    SELECT uuid_generate_v4(), user_term, canonical_ailment, related_ailments::json, keywords::json, priority
    FROM (VALUES
        ('tired',           'fatigue',            '["low energy", "exhaustion"]',       '["tired", "exhausted", "no energy", "sluggish", "fatigue", "worn out"]', 9),
        ('stressed',        'stress',             '["anxiety", "overwhelmed"]',          '["stressed", "anxious", "overwhelmed", "tense", "nervous", "stress"]', 9),
        ('bloated',         'bloating',           '["digestive issues", "gas"]',         '["bloated", "bloating", "gassy", "stomach pain", "distended"]', 8),
        ('can''t sleep',    'insomnia',           '["sleep issues", "fatigue"]',         '["can''t sleep", "insomnia", "sleepless", "sleep better", "sleep", "awake at night"]', 9),
        ('fighting a cold', 'immune support',     '["illness", "infection"]',            '["cold", "flu", "sick", "fighting a cold", "immune", "sneezing", "runny nose"]', 8),
        ('headache',        'headache',           '["migraine", "stress"]',              '["headache", "migraine", "head pain", "tension headache"]', 7),
        ('gut issues',      'gut health',         '["digestive issues", "bloating"]',    '["gut", "digestion", "ibs", "constipation", "diarrhea", "stomach"]', 8),
        ('inflammation',    'inflammation',       '["joint pain", "arthritis"]',         '["inflamed", "inflammation", "swollen", "joint pain", "arthritis"]', 8),
        ('brain fog',       'cognitive function', '["focus", "memory"]',                '["brain fog", "focus", "concentration", "memory", "clarity", "think clearly"]', 7),
        ('weight loss',     'weight management',  '["metabolism", "obesity"]',           '["weight loss", "lose weight", "slim", "metabolism", "fat burning"]', 7)
    ) AS t(user_term, canonical_ailment, related_ailments, keywords, priority)
    WHERE NOT EXISTS (SELECT 1 FROM ailment_mappings WHERE ailment_mappings.user_term = t.user_term)
    """)


def downgrade() -> None:
    op.drop_table("chat_feedback", if_exists=True)
    op.drop_table("chat_history", if_exists=True)
    op.drop_table("saved_recommendations", if_exists=True)
    op.drop_table("user_feedback", if_exists=True)
    op.drop_table("recommendation_sessions", if_exists=True)
    op.drop_table("ailment_mappings", if_exists=True)
    op.drop_table("knowledge_chunks", if_exists=True)
    op.drop_table("recipe_ingredients", if_exists=True)
    op.drop_table("recipes", if_exists=True)
    op.drop_table("ingredients", if_exists=True)
    op.drop_table("user_pantry", if_exists=True)
    op.drop_table("user_profiles", if_exists=True)
    op.drop_table("users", if_exists=True)
