"""Apply a single SQL migration file from docs/database/migrations/.

Usage:
    python -m scripts.apply_migration 001_clerk_auth.sql
"""
from __future__ import annotations

import asyncio
import pathlib
import sys

from sqlalchemy.ext.asyncio import create_async_engine

from app.db.config import db_config


MIGRATIONS_DIR = (
    pathlib.Path(__file__).resolve().parent.parent.parent
    / "docs"
    / "database"
    / "migrations"
)


async def main(filename: str) -> int:
    if not db_config.url_unpooled:
        print("✗ DATABASE_URL_UNPOOLED is not set in backend/.env", file=sys.stderr)
        return 1

    path = MIGRATIONS_DIR / filename
    if not path.exists():
        print(f"✗ Migration not found: {path}", file=sys.stderr)
        return 1

    sql = path.read_text(encoding="utf-8")

    connect_args: dict = {"statement_cache_size": 0}
    if db_config.ssl_required:
        connect_args["ssl"] = "require"

    engine = create_async_engine(db_config.url_unpooled, connect_args=connect_args)

    print(f"→ Applying {path.name}")
    async with engine.connect() as conn:
        raw = await conn.get_raw_connection()
        await raw.driver_connection.execute(sql)

    await engine.dispose()
    print(f"✓ {path.name} applied.")
    return 0


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print(f"Usage: python -m scripts.apply_migration <filename.sql>", file=sys.stderr)
        sys.exit(2)
    sys.exit(asyncio.run(main(sys.argv[1])))
