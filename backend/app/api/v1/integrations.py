"""Integrations API — connect/disconnect external ad platforms and link
their ad accounts to PaidPilot projects.

Currently houses the Meta Marketing API surface (STATUS A5). Google Ads
will follow the same shape under /integrations/google_ads in a later
phase; keeping the router single-file for now since the surfaces are
small and the duplication risk is low.

Phase 1 (this file) ships everything except real-data sync — the
insights cache table and its cron land in Phase 2.

Endpoint shape (`/api/v1` prefix is applied at router registration):

  GET   /integrations/status                — which providers are configured + which the user has connected
  GET   /integrations/meta/connect          — returns the Meta OAuth dialog URL (frontend redirects to it)
  GET   /integrations/meta/callback         — Meta redirects here with ?code; we exchange + persist
  DELETE /integrations/meta                 — disconnect the user (cascades to ad_account_links)
  GET   /integrations/meta/ad-accounts      — list ad accounts the OAuth'd user can read

  POST   /projects/{projectId}/ad-accounts  — link an external account to this project (handled by projects.py)
  DELETE /projects/{projectId}/ad-accounts/{linkId}
  GET    /projects/{projectId}/ad-accounts  — list links

The OAuth callback is the only endpoint that runs *unauthenticated* —
Meta hits it without our Bearer token. We bind the user identity via
the signed `state` cookie set on /meta/connect.
"""
from __future__ import annotations

import logging
import secrets
import uuid
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Query, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
from app.constants.constants import META_OAUTH_REDIRECT_URI
from app.db import get_db
from app.db.models import User
from app.db.repository import (
    delete_provider_connection,
    get_provider_connection,
    upsert_provider_connection,
)
from app.services.meta_api import (
    MetaNotConfiguredError,
    build_authorize_url,
    decrypt_token,
    encrypt_token,
    exchange_code_for_token,
    exchange_for_long_lived_token,
    fetch_me,
    is_configured,
    list_ad_accounts,
    token_expiry_from_now,
)

logger = logging.getLogger(__name__)

router = APIRouter()

# Cookie used to round-trip (user_id + CSRF state) across Meta's OAuth
# redirect, since Meta itself doesn't carry our Clerk JWT. We set this
# on /meta/connect and consume it on /meta/callback. HttpOnly + SameSite
# Lax: SameSite=Strict breaks the redirect-back flow.
_STATE_COOKIE = "pp_meta_oauth_state"
_STATE_COOKIE_MAX_AGE = 600  # 10 minutes — generous, OAuth flows finish in under 60s


# ---------- Response schemas -----------------------------------------------

class ProviderStatus(BaseModel):
    provider: str
    available: bool        # env-configured on this deploy
    connected: bool        # user has a row in provider_connections


class IntegrationsStatusOut(BaseModel):
    providers: list[ProviderStatus]


class AuthorizeUrlOut(BaseModel):
    authorize_url: str


class AdAccountOut(BaseModel):
    external_account_id: str
    name: str
    currency: str
    timezone_name: str
    is_active: bool


class AdAccountListOut(BaseModel):
    accounts: list[AdAccountOut]


# ---------- GET /integrations/status ---------------------------------------

@router.get("/integrations/status", response_model=IntegrationsStatusOut)
async def integrations_status(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Single source-of-truth the frontend hits on /settings/integrations
    mount to decide which provider cards to render in which state."""
    meta_conn = await get_provider_connection(db, user_id=user.id, provider="meta")
    return IntegrationsStatusOut(
        providers=[
            ProviderStatus(
                provider="meta",
                available=is_configured(),
                connected=meta_conn is not None,
            ),
            # Google Ads — stubbed for future shape parity. Always
            # available=False until the integration ships.
            ProviderStatus(
                provider="google_ads",
                available=False,
                connected=False,
            ),
        ]
    )


# ---------- Meta OAuth handshake -------------------------------------------

@router.get("/integrations/meta/connect", response_model=AuthorizeUrlOut)
async def meta_connect(
    response: Response,
    user: User = Depends(get_current_user),
):
    """Generate the Meta OAuth dialog URL + set the CSRF state cookie.

    The frontend reads `authorize_url` and `window.location = url`.
    Returning a JSON envelope (rather than a 302) lets the SPA preserve
    any unsaved client state before navigating away.
    """
    try:
        state_token = secrets.token_urlsafe(32)
        authorize_url = build_authorize_url(state=state_token)
    except MetaNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    # Encode the user id alongside the CSRF token so the unauthenticated
    # callback can identify who we're connecting on behalf of.
    cookie_value = f"{user.id}:{state_token}"
    response.set_cookie(
        key=_STATE_COOKIE,
        value=cookie_value,
        max_age=_STATE_COOKIE_MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=not META_OAUTH_REDIRECT_URI.startswith("http://") if META_OAUTH_REDIRECT_URI else True,
    )
    return AuthorizeUrlOut(authorize_url=authorize_url)


@router.get("/integrations/meta/callback")
async def meta_callback(
    code: Optional[str] = Query(default=None),
    state: Optional[str] = Query(default=None),
    error: Optional[str] = Query(default=None),
    pp_meta_oauth_state: Optional[str] = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
):
    """Meta redirects the user's browser here. We exchange the code for
    a long-lived token, persist (encrypted), and redirect to the
    /settings/integrations page with a success or error flag the SPA
    can render."""
    front_redirect = "/settings/integrations"

    if error:
        # User clicked "Cancel" on the Meta consent dialog — redirect
        # back with a soft error the SPA can display.
        return RedirectResponse(f"{front_redirect}?meta_error={error}", status_code=303)

    if not (code and state and pp_meta_oauth_state):
        raise HTTPException(status_code=400, detail="missing code/state")

    try:
        cookie_user_id_str, cookie_state = pp_meta_oauth_state.split(":", 1)
    except ValueError:
        raise HTTPException(status_code=400, detail="malformed state cookie")

    if not secrets.compare_digest(cookie_state, state):
        raise HTTPException(status_code=400, detail="state mismatch")

    try:
        user_id = uuid.UUID(cookie_user_id_str)
    except ValueError:
        raise HTTPException(status_code=400, detail="invalid user id in cookie")

    try:
        short = await exchange_code_for_token(code)
        long_lived = await exchange_for_long_lived_token(short.access_token)
        me = await fetch_me(long_lived.access_token)
    except MetaNotConfiguredError as exc:
        raise HTTPException(status_code=503, detail=str(exc))

    await upsert_provider_connection(
        db,
        user_id=user_id,
        provider="meta",
        external_user_id=me.id,
        access_token_ciphertext=encrypt_token(long_lived.access_token),
        token_expires_at=token_expiry_from_now(long_lived.expires_in),
        scopes=["ads_read"],
    )
    await db.commit()

    response = RedirectResponse(f"{front_redirect}?meta_connected=1", status_code=303)
    response.delete_cookie(_STATE_COOKIE)
    return response


@router.delete("/integrations/meta", status_code=204)
async def meta_disconnect(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Disconnect Meta for this user. Cascades to ad_account_links;
    historical insights rows (Phase 2) stay so prior investigations
    don't lose grounding."""
    await delete_provider_connection(db, user_id=user.id, provider="meta")
    await db.commit()
    return Response(status_code=204)


# ---------- /me/adaccounts proxy -------------------------------------------

@router.get("/integrations/meta/ad-accounts", response_model=AdAccountListOut)
async def meta_ad_accounts(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Return every Meta ad account the OAuth'd user can read. The
    frontend's AdAccountPicker uses this to render checkboxes for the
    "link to project" flow.

    We fetch live from Meta on each call rather than caching the list
    in our DB: account membership changes outside our control (a Business
    Manager admin grants/revokes access), so cached lists go stale and
    surface confusing "ghost" accounts in the picker.
    """
    if not is_configured():
        raise HTTPException(
            status_code=503,
            detail="Meta integration not configured on this deploy.",
        )

    conn = await get_provider_connection(db, user_id=user.id, provider="meta")
    if not conn:
        raise HTTPException(status_code=404, detail="meta not connected")

    access_token = decrypt_token(conn.access_token_ciphertext)
    accounts = await list_ad_accounts(access_token)
    return AdAccountListOut(
        accounts=[
            AdAccountOut(
                external_account_id=a.id,
                name=a.name,
                currency=a.currency,
                timezone_name=a.timezone_name,
                is_active=a.is_active,
            )
            for a in accounts
        ]
    )
