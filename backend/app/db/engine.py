"""Async SQLAlchemy engine and session factory.

The app uses the **pooled** Neon endpoint (PgBouncer transaction mode), so we
disable asyncpg's prepared-statement cache to keep things compatible.
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import AsyncIterator

from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.db.config import db_config


def _connect_args() -> dict:
    args: dict = {
        # Required for transaction-mode pooling on PgBouncer (Neon pooled endpoint).
        # https://magicstack.github.io/asyncpg/current/api/index.html#asyncpg.connection.Connection
        "statement_cache_size": 0,
        "prepared_statement_cache_size": 0,
    }
    if db_config.ssl_required:
        args["ssl"] = "require"
    return args


def _make_engine() -> AsyncEngine:
    if not db_config.url:
        raise RuntimeError(
            "DATABASE_URL is not set. Add it to backend/.env "
            "(see docs/database/README.md)."
        )
    return create_async_engine(
        db_config.url,
        echo=db_config.echo,
        pool_size=db_config.pool_size,
        max_overflow=db_config.max_overflow,
        pool_pre_ping=True,
        connect_args=_connect_args(),
    )


engine: AsyncEngine = _make_engine()

async_session_factory: async_sessionmaker[AsyncSession] = async_sessionmaker(
    bind=engine,
    expire_on_commit=db_config.expire_on_commit,
    autoflush=False,
)


@asynccontextmanager
async def get_session() -> AsyncIterator[AsyncSession]:
    """Standalone async context manager for use outside FastAPI deps.

    Example:
        async with get_session() as db:
            await db.execute(...)
    """
    session = async_session_factory()
    try:
        yield session
        await session.commit()
    except Exception:
        await session.rollback()
        raise
    finally:
        await session.close()


async def dispose_engine() -> None:
    await engine.dispose()
