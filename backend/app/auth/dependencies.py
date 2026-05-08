"""FastAPI auth dependencies — verify Clerk tokens and JIT-provision users."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.clerk import ClerkAuthError, ClerkClaims, verify_token
from app.db.dependencies import get_db
from app.db.models import User


def _extract_bearer(authorization: Optional[str]) -> Optional[str]:
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


async def _upsert_user(db: AsyncSession, claims: ClerkClaims) -> User:
    """Idempotently create-or-update the user row for these Clerk claims."""
    now = datetime.now(timezone.utc)

    # First-time provisioning. ON CONFLICT keeps it idempotent so concurrent
    # first requests for the same user don't blow up.
    stmt = (
        pg_insert(User)
        .values(
            clerk_user_id=claims.sub,
            email=claims.email,
            display_name=claims.name,
            image_url=claims.image_url,
            last_seen_at=now,
        )
        .on_conflict_do_update(
            index_elements=[User.clerk_user_id],
            set_={
                # Only refresh fields when Clerk actually sent a value;
                # avoid clobbering a previously-known email with NULL.
                **({"email": claims.email} if claims.email else {}),
                **({"display_name": claims.name} if claims.name else {}),
                **({"image_url": claims.image_url} if claims.image_url else {}),
                "last_seen_at": now,
                "updated_at": now,
            },
        )
        .returning(User)
    )
    result = await db.execute(stmt)
    user = result.scalar_one()
    await db.commit()
    return user


async def get_optional_user(
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Return the authenticated user, or None if no/invalid token.

    Use this on endpoints that work for both signed-in and guest visitors.
    Invalid tokens are treated as anonymous rather than 401 — keeps the
    "Continue as guest" UX from breaking on stale local tokens.
    """
    token = _extract_bearer(authorization)
    if not token:
        return None
    try:
        claims = await verify_token(token)
    except ClerkAuthError:
        return None
    return await _upsert_user(db, claims)


async def get_current_user(
    authorization: Optional[str] = Header(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Return the authenticated user, or raise 401.

    Use this on endpoints that strictly require auth (e.g. /me).
    """
    token = _extract_bearer(authorization)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        claims = await verify_token(token)
    except ClerkAuthError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(e),
            headers={"WWW-Authenticate": "Bearer"},
        ) from e
    return await _upsert_user(db, claims)
