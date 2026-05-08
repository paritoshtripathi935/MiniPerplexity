"""Database configuration loaded from environment.

Reads the Neon connection strings provided by the user in `backend/.env`:
- DATABASE_URL          — pooled (PgBouncer transaction-mode); used by the app.
- DATABASE_URL_UNPOOLED — direct; used by Alembic and one-shot init scripts.

Other DB knobs (DB_POOL_SIZE, DB_POOL_OVERFLOW, IS_DB_ECHO_LOG, …) are also
read here so we have a single source of truth.
"""
from __future__ import annotations

import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


def _to_async_url(url: str) -> str:
    """Normalise a Postgres URL to the asyncpg dialect.

    Neon hands out URLs like:
      postgresql://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
    SQLAlchemy needs the +asyncpg suffix to pick the async driver.
    asyncpg also doesn't understand `sslmode` as a URL param, so we strip it
    and pass it via connect_args instead (handled in engine.py).
    """
    if not url:
        return url
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+asyncpg" not in url:
        url = "postgresql+asyncpg://" + url[len("postgresql://"):]
    return url


_LIBPQ_ONLY_PARAMS = {
    "sslmode",          # asyncpg uses `ssl=` instead
    "channel_binding",  # libpq-only
    "sslcompression",
    "sslsni",
    "gssencmode",
    "krbsrvname",
    "target_session_attrs",
}


def _strip_libpq_params(url: str) -> tuple[str, bool]:
    """Remove libpq-only query params from a URL; flag whether SSL was required."""
    if not url or "?" not in url:
        return url, False

    base, _, query = url.partition("?")
    pairs = [p for p in query.split("&") if p]
    ssl_required = False
    kept: list[str] = []
    for pair in pairs:
        key = pair.split("=", 1)[0].lower()
        if key == "sslmode" and pair.split("=", 1)[-1].lower() in {"require", "verify-ca", "verify-full"}:
            ssl_required = True
            continue
        if key in _LIBPQ_ONLY_PARAMS:
            continue
        kept.append(pair)

    return (base + ("?" + "&".join(kept) if kept else "")), ssl_required


@dataclass(frozen=True)
class DBConfig:
    url: str
    url_unpooled: str
    ssl_required: bool
    pool_size: int
    max_overflow: int
    echo: bool
    expire_on_commit: bool


def _load() -> DBConfig:
    raw_pooled = os.getenv("DATABASE_URL", "")
    raw_unpooled = os.getenv("DATABASE_URL_UNPOOLED", raw_pooled)

    pooled, ssl_pool = _strip_libpq_params(_to_async_url(raw_pooled))
    unpooled, ssl_unpool = _strip_libpq_params(_to_async_url(raw_unpooled))

    return DBConfig(
        url=pooled,
        url_unpooled=unpooled,
        ssl_required=ssl_pool or ssl_unpool,
        pool_size=int(os.getenv("DB_POOL_SIZE", "5")),
        max_overflow=int(os.getenv("DB_POOL_OVERFLOW", "10")),
        echo=os.getenv("IS_DB_ECHO_LOG", "false").lower() == "true",
        expire_on_commit=os.getenv("IS_DB_EXPIRE_ON_COMMIT", "false").lower() == "true",
    )


db_config: DBConfig = _load()
