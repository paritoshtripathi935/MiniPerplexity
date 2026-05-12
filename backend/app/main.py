import asyncio
import logging
import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import ORJSONResponse
from starlette.middleware.gzip import GZipMiddleware
from starlette.types import ASGIApp, Receive, Scope, Send
from sqlalchemy import text

from app.api.v1.brand_profile import router as brand_profile_router
from app.api.v1.plays import router as plays_router
from app.api.v1.projects import router as projects_router
from app.api.v1.query_handler import router
from app.core.settings import BackendBaseSettings
from app.db.engine import async_session_factory, dispose_engine, engine
from app.db.repository import cleanup_expired_sessions

logger = logging.getLogger(__name__)

CLEANUP_INTERVAL_SECONDS = int(os.getenv("DB_CLEANUP_INTERVAL_SECONDS", "300"))


async def _periodic_cleanup() -> None:
    """Drop expired sessions every CLEANUP_INTERVAL_SECONDS."""
    while True:
        try:
            await asyncio.sleep(CLEANUP_INTERVAL_SECONDS)
            async with async_session_factory() as db:
                deleted = await cleanup_expired_sessions(db)
                await db.commit()
                if deleted:
                    logger.info("Cleaned up %d expired sessions", deleted)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("Periodic cleanup failed; will retry on next tick")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: ping DB so we fail fast on bad credentials.
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        logger.info("Database connection OK")
    except Exception:
        logger.exception("Database connection failed on startup")
        raise

    cleanup_task = asyncio.create_task(_periodic_cleanup())
    try:
        yield
    finally:
        cleanup_task.cancel()
        try:
            await cleanup_task
        except asyncio.CancelledError:
            pass
        await dispose_engine()


# Load settings
settings = BackendBaseSettings()

# Initialize FastAPI app with settings.
# `default_response_class=ORJSONResponse` switches every JSON response
# to orjson serialization — 2-3x faster than the stdlib json default,
# with no API change at the route level (handlers still return dicts).
app = FastAPI(
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
    **settings.set_backend_app_attributes,
)


class GZipExceptStreaming:
    """GZipMiddleware wrapper that bypasses compression for SSE.

    The native Starlette GZipMiddleware buffers the response body and
    compresses it as a unit, which breaks `text/event-stream` responses
    — every token-by-token chunk would be held back until the stream
    completes. We can't tell the response Content-Type from the request
    alone, but we know our single streaming endpoint by path
    (`/answer/{session_id}/stream`). Bypass GZip for paths ending in
    `/stream`; everything else goes through normal compression.
    """

    def __init__(self, app: ASGIApp, minimum_size: int = 1024) -> None:
        self.app = app
        self.gzip = GZipMiddleware(app, minimum_size=minimum_size)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("path", "").endswith("/stream"):
            await self.app(scope, receive, send)
            return
        await self.gzip(scope, receive, send)


# Response compression — typical JSON saves 70-80% over the wire.
# minimum_size=1024 skips tiny responses (health checks, etc.) where
# gzip overhead would dominate. SSE is bypassed via the wrapper above.
app.add_middleware(GZipExceptStreaming, minimum_size=1024)

# Set up CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "https://mini-perplexity.netlify.app"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(router, prefix="/api/v1")
app.include_router(brand_profile_router, prefix="/api/v1", tags=["BrandProfile"])
app.include_router(plays_router, prefix="/api/v1", tags=["Plays"])
app.include_router(projects_router, prefix="/api/v1", tags=["Projects"])


@app.get("/health", tags=["Health"])
async def health_check():
    """Liveness probe — does not hit the DB to stay cheap."""
    return {"status": "healthy"}


@app.get("/health/db", tags=["Health"])
async def health_check_db():
    """Readiness probe — verifies DB round-trip."""
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "healthy", "database": "connected"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
