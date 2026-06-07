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
from app.api.v1.integrations import router as integrations_router
from app.api.v1.plays import router as plays_router
from app.api.v1.projects import router as projects_router
from app.api.v1.query_handler import router
from app.core.config import config
from app.core.settings import BackendBaseSettings
from app.db.engine import async_session_factory, dispose_engine, engine
from app.db.repository import cleanup_expired_sessions

logger = logging.getLogger(__name__)

CLEANUP_INTERVAL_SECONDS = config.settings.cleanup.interval_seconds


async def _periodic_cleanup() -> None:
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


settings = BackendBaseSettings()

app = FastAPI(
    lifespan=lifespan,
    default_response_class=ORJSONResponse,
    **settings.set_backend_app_attributes,
)


class GZipExceptStreaming:
    """GZipMiddleware that skips compression for SSE endpoints."""

    def __init__(self, app: ASGIApp, minimum_size: int = 1024) -> None:
        self.app = app
        self.gzip = GZipMiddleware(app, minimum_size=minimum_size)

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http" and scope.get("path", "").endswith("/stream"):
            await self.app(scope, receive, send)
            return
        await self.gzip(scope, receive, send)


app.add_middleware(GZipExceptStreaming, minimum_size=1024)

app.add_middleware(
    CORSMiddleware,
    allow_origins=config.settings.cors.origins,
    # Netlify per-deploy preview URLs can't be enumerated up front.
    allow_origin_regex=r"https://[^/]+--(paidpilot|mini-perplexity)\.netlify\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
app.include_router(brand_profile_router, prefix="/api/v1", tags=["BrandProfile"])
app.include_router(plays_router, prefix="/api/v1", tags=["Plays"])
app.include_router(projects_router, prefix="/api/v1", tags=["Projects"])
app.include_router(integrations_router, prefix="/api/v1", tags=["Integrations"])


@app.get("/health", tags=["Health"])
async def health_check():
    return {"status": "healthy"}


@app.get("/health/db", tags=["Health"])
async def health_check_db():
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
    return {"status": "healthy", "database": "connected"}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
