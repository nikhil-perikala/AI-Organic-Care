import os
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool
from app.config import settings

_testing = os.getenv("TESTING") == "1"

engine = create_async_engine(
    settings.DATABASE_URL,
    # NullPool: every request opens/closes its own connection — no reuse.
    # Required in tests to avoid asyncpg future-loop conflicts across tests.
    poolclass=NullPool if _testing else None,
    echo=False if _testing else settings.APP_ENV == "development",
    **({} if _testing else {"pool_size": 10, "max_overflow": 20, "pool_pre_ping": True}),
)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autocommit=False,
    autoflush=False,
)


class Base(DeclarativeBase):
    pass


async def get_db() -> AsyncSession:
    async with AsyncSessionLocal() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Safe column additions for existing databases
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_hash VARCHAR(255)"
        ))
        await conn.execute(text(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_otp_expires_at TIMESTAMP"
        ))
