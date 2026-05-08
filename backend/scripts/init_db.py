"""One-shot bootstrap: apply docs/database/schema.sql against Neon.

Use this until Alembic is wired in. It is **idempotent** — safe to run repeatedly.

Connects via DATABASE_URL_UNPOOLED (direct, not the PgBouncer pooler) because
some statements (`CREATE EXTENSION`, `CREATE TYPE`) need session-mode pooling
or no pooling at all to work reliably.

Run from the backend/ directory:
    python -m scripts.init_db
"""
from __future__ import annotations

import asyncio
import pathlib
import sys

from sqlalchemy.ext.asyncio import create_async_engine

from app.db.config import db_config


SCHEMA_PATH = (
    pathlib.Path(__file__).resolve().parent.parent.parent
    / "docs"
    / "database"
    / "schema.sql"
)


async def main() -> int:
    if not db_config.url_unpooled:
        print("✗ DATABASE_URL_UNPOOLED is not set in backend/.env", file=sys.stderr)
        return 1

    if not SCHEMA_PATH.exists():
        print(f"✗ Schema file not found: {SCHEMA_PATH}", file=sys.stderr)
        return 1

    sql = SCHEMA_PATH.read_text(encoding="utf-8")

    connect_args: dict = {"statement_cache_size": 0}
    if db_config.ssl_required:
        connect_args["ssl"] = "require"

    engine = create_async_engine(
        db_config.url_unpooled,
        connect_args=connect_args,
        # NullPool would be cleaner, but the default short-lived engine is fine
        # for a one-shot script.
    )

    print(f"→ Applying {SCHEMA_PATH.relative_to(SCHEMA_PATH.parents[2])}")

    # asyncpg's prepared-statement path can't handle multi-statement scripts;
    # the underlying connection's `execute()` method can. Drop down to it via
    # the raw asyncpg connection.
    async with engine.connect() as conn:
        raw = await conn.get_raw_connection()
        asyncpg_conn = raw.driver_connection  # asyncpg.Connection
        await asyncpg_conn.execute(sql)

    await engine.dispose()
    print("✓ Schema applied successfully.")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
