"""Cloudflare Workers AI image generation.

Studio surface calls this to render ad creatives via Flux.

CREDENTIAL POOL — separate from text generation
=================================================
Cloudflare's Workers AI free tier is 10,000 neurons/day PER ACCOUNT.
Image generation (Flux) burns through this far faster than chat
text generation (one Flux call ≈ 50-100 chat-token calls). To keep
text streaming from getting starved by the Studio surface, we read
image-gen credentials independently of the chat credentials.

Env-var precedence (first hit wins per slot):
  Slot 1 (primary image account):
    - CLOUDFLARE_IMAGE_ACCOUNT_ID  +  CLOUDFLARE_IMAGE_API_KEY
  Slot 2:
    - CLOUDFLARE_IMAGE_ACCOUNT_ID_2  +  CLOUDFLARE_IMAGE_API_KEY_2
  Slot 3:
    - CLOUDFLARE_IMAGE_ACCOUNT_ID_3  +  CLOUDFLARE_IMAGE_API_KEY_3

If slot 1 is unset, we fall back to the chat credentials
(CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_KEY) so single-account dev
deploys keep working with no change.

Rotation: `generate()` walks the pool in slot order. On a 429 ("daily
free allocation exhausted") or 5xx from one account, it moves to the
next and tries again. Logs each attempt so the operator can see
which slots are still in budget.

Pipeline per call:
  1. Hit `/ai/run/<model>` on the active slot.
  2. Cloudflare returns either JSON-with-base64 or raw image bytes —
     `_decode_image_response` handles both shapes.
  3. Caller persists the PNG through the storage abstraction +
     writes a `campaign_creatives` row with prompt + ai_model.

The model id is a constructor argument (default Flux Schnell) so we
can A/B alternatives without touching call sites.
"""
from __future__ import annotations

import base64
import logging
import os
from dataclasses import dataclass
from typing import List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)


CLOUDFLARE_AI_BASE = "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/"
DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell"
DEFAULT_STEPS = 4  # Flux Schnell is a 1-4 step distillation; 4 = max quality.
DEFAULT_TIMEOUT_S = 60.0  # Generation can take 10-30s under load.

# How many image-specific credential slots we honour. Bump if more
# accounts are added; matches the env-var convention
# CLOUDFLARE_IMAGE_API_KEY{,_2,_3,...}.
_MAX_IMAGE_SLOTS = 5


class ImageGenError(RuntimeError):
    """Raised when Cloudflare returns a non-success response or the
    body can't be decoded. Surface the message to the caller; the
    endpoint translates it to a 502."""


class ImageGenNotConfiguredError(ImageGenError):
    """Raised when no Cloudflare image-gen credentials are configured
    (neither the image-specific slots nor the text-credential fallback).
    Translated to a 503 by the endpoint."""


class ImageGenQuotaExhaustedError(ImageGenError):
    """Raised when every credential slot returned a 429 / quota error.
    Distinguishes 'we tried everything and all accounts are tapped' from
    'this single call had a transient issue' so the UI can show a
    quota-specific message ('add more API keys' vs 'try again')."""


@dataclass(frozen=True)
class GeneratedImage:
    """A single generated image. `bytes_` is the raw PNG payload ready
    to upload to storage; `model` identifies which model produced it
    (we may A/B in the future and want provenance per row)."""
    bytes_: bytes
    model: str
    mime_type: str = "image/png"


def _credential_pool() -> List[Tuple[str, str]]:
    """Resolve the (account_id, api_key) pairs to try in order.

    Pool order:
      1. CLOUDFLARE_IMAGE_ACCOUNT_ID + CLOUDFLARE_IMAGE_API_KEY
      2. CLOUDFLARE_IMAGE_ACCOUNT_ID_2 + CLOUDFLARE_IMAGE_API_KEY_2
      … up to _MAX_IMAGE_SLOTS
      Final fallback: CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_KEY
        (the same credentials chat uses — preserved so single-account
        dev deploys keep working without env changes).

    A slot only joins the pool when BOTH halves are set. Partially-
    configured slots are silently skipped.
    """
    pool: List[Tuple[str, str]] = []
    for i in range(1, _MAX_IMAGE_SLOTS + 1):
        suffix = "" if i == 1 else f"_{i}"
        acc = os.getenv(f"CLOUDFLARE_IMAGE_ACCOUNT_ID{suffix}")
        key = os.getenv(f"CLOUDFLARE_IMAGE_API_KEY{suffix}")
        if acc and key:
            pool.append((acc, key))
    # Fallback to shared text credentials only when no image-specific
    # slot is configured. Once the operator adds image-specific creds,
    # text usage stays isolated to the chat account.
    if not pool:
        fallback_acc = os.getenv("CLOUDFLARE_ACCOUNT_ID")
        fallback_key = os.getenv("CLOUDFLARE_API_KEY")
        if fallback_acc and fallback_key:
            pool.append((fallback_acc, fallback_key))
    return pool


def _is_quota_error(status: int, body: str) -> bool:
    """Decide whether a Cloudflare response represents a 'this account
    is tapped' error vs a 'try again later' transient. The free-tier
    daily allocation comes back as 429 with the literal phrase
    'daily free allocation' in the body — pattern-match on that so we
    don't burn through every slot on a transient 429 from one call."""
    if status == 429:
        return True
    if status in (401, 403):
        # Treat auth errors as exhaustion for THIS slot — we still want
        # to fall through to the next slot rather than crash.
        return True
    lowered = body.lower()
    return "daily free allocation" in lowered or "neurons" in lowered


def _decode_image_response(resp: httpx.Response) -> bytes:
    """Cloudflare's image-gen endpoints return either base64-in-JSON or
    raw PNG bytes depending on the model. Detect by Content-Type +
    body shape; raise a descriptive error if neither shape works."""
    ctype = resp.headers.get("content-type", "")
    if ctype.startswith("image/"):
        return resp.content
    if "application/json" in ctype or resp.text.lstrip().startswith("{"):
        try:
            payload = resp.json()
        except Exception as e:
            raise ImageGenError(
                f"non-JSON response from Cloudflare ({ctype}): {e}"
            ) from e
        if not payload.get("success", True):
            errs = payload.get("errors") or [payload.get("error")]
            raise ImageGenError(f"Cloudflare returned errors: {errs}")
        result = payload.get("result")
        if isinstance(result, dict):
            b64 = result.get("image") or result.get("b64_json")
            if isinstance(b64, str):
                try:
                    return base64.b64decode(b64)
                except Exception as e:
                    raise ImageGenError(f"could not decode base64 image: {e}") from e
        raise ImageGenError(
            f"unexpected JSON shape — no result.image field: {str(payload)[:300]}"
        )
    raise ImageGenError(
        f"unrecognised Cloudflare response Content-Type={ctype!r} "
        f"body-prefix={resp.text[:200]!r}"
    )


class FluxImageGenerator:
    """Default image-gen provider — Cloudflare Workers AI hosting Flux
    Schnell. Stateless; one instance per request is fine but reuse
    works too.

    Walks the credential pool (see `_credential_pool`) on every
    `generate` call. On a quota / auth error from one slot, falls
    through to the next. Raises `ImageGenQuotaExhaustedError` when all
    slots have been tried and all returned quota errors — distinguished
    from a single-call transient so the UI can prompt the operator to
    add more keys."""

    def __init__(self, model: str = DEFAULT_MODEL, timeout_s: float = DEFAULT_TIMEOUT_S):
        self.model = model
        self.timeout_s = timeout_s

    async def generate(self, prompt: str, *, steps: int = DEFAULT_STEPS) -> GeneratedImage:
        if not prompt or not prompt.strip():
            raise ImageGenError("prompt cannot be empty")

        pool = _credential_pool()
        if not pool:
            raise ImageGenNotConfiguredError(
                "no Cloudflare image-gen credentials configured. set "
                "CLOUDFLARE_IMAGE_ACCOUNT_ID + CLOUDFLARE_IMAGE_API_KEY "
                "(and optionally _2, _3, … for additional accounts), or "
                "the legacy CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_KEY."
            )

        body = {"prompt": prompt.strip(), "steps": max(1, min(steps, 8))}
        last_error: Optional[Exception] = None
        all_quota = True  # Flips false the moment any slot returns a non-quota error

        for slot_index, (account_id, api_key) in enumerate(pool, start=1):
            endpoint = CLOUDFLARE_AI_BASE.format(account_id=account_id) + self.model
            headers = {
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            }
            try:
                async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                    resp = await client.post(endpoint, headers=headers, json=body)
            except httpx.HTTPError as e:
                logger.warning(
                    "image-gen slot %d/%d HTTP error: %s — trying next slot",
                    slot_index, len(pool), e,
                )
                last_error = ImageGenError(f"Cloudflare request failed: {e}")
                all_quota = False
                continue

            if resp.status_code >= 400:
                body_preview = resp.text[:500]
                quota = _is_quota_error(resp.status_code, body_preview)
                if quota:
                    # Burn-through: this account is tapped (or unauthorised).
                    # Walk to the next slot.
                    logger.warning(
                        "image-gen slot %d/%d quota / auth (%s) — trying next slot. "
                        "body=%s",
                        slot_index, len(pool), resp.status_code, body_preview,
                    )
                    last_error = ImageGenError(
                        f"Cloudflare returned {resp.status_code}: {body_preview}"
                    )
                    continue
                # Non-quota error — model unavailable, content-policy
                # rejection, malformed prompt. Don't burn through the
                # rest of the pool; raise immediately so the user can
                # see the specific message.
                logger.error(
                    "image-gen slot %d/%d non-quota %s: %s",
                    slot_index, len(pool), resp.status_code, body_preview,
                )
                all_quota = False
                raise ImageGenError(
                    f"Cloudflare returned {resp.status_code}: {body_preview}"
                )

            # Success.
            if slot_index > 1:
                logger.info(
                    "image-gen succeeded on slot %d/%d (slots 1..%d exhausted)",
                    slot_index, len(pool), slot_index - 1,
                )
            return GeneratedImage(
                bytes_=_decode_image_response(resp),
                model=self.model,
            )

        # Pool walked, never returned.
        if all_quota:
            raise ImageGenQuotaExhaustedError(
                f"all {len(pool)} cloudflare image-gen account(s) hit "
                "their daily free allocation. add another "
                "CLOUDFLARE_IMAGE_API_KEY_N to env, or upgrade one of "
                "the existing accounts to the workers paid plan."
            )
        # Some non-quota failure path landed us here without a return —
        # surface the last error verbatim.
        raise last_error or ImageGenError("image-gen failed with no slots succeeding")


# ---------- Prompt composition ---------------------------------------------

_STYLE_MODIFIERS = {
    "photo": "photorealistic product photography, soft natural lighting, sharp focus",
    "illustration": "modern flat illustration, clean vector style, vibrant brand colors",
    "minimal": "minimalist composition, generous negative space, premium feel",
    "3d": "stylized 3d render, soft shadows, contemporary studio look",
}

_ASPECT_HINTS = {
    "1:1": "square 1:1 composition framed for instagram feed and meta ads",
    "9:16": "vertical 9:16 portrait composition framed for stories, reels, tiktok",
    "1.91:1": "horizontal 1.91:1 landscape composition framed for meta link previews",
    "4:5": "vertical 4:5 portrait composition framed for instagram in-feed",
}


def compose_prompt(
    *,
    user_prompt: str,
    aspect_ratio: Optional[str] = None,
    style: Optional[str] = None,
    brand_context: Optional[str] = None,
) -> str:
    """Combine the user's free-text prompt with structured modifiers.

    Flux Schnell on Cloudflare doesn't accept width/height params on
    the hosted endpoint (it renders at the model's default 1024×1024),
    so the aspect-ratio dropdown becomes a *prompt-level* hint rather
    than a render dimension. Users still get visually-appropriate
    framing; they'd just crop in their design tool for the final asset.

    `brand_context`, when set, is a short distilled phrase the caller
    has assembled from the campaign's brand profile (company, voice,
    channels). Appended as a final modifier; Flux uses it to steer
    palette + mood toward the brand without dominating the user's
    primary prompt.
    """
    parts = [user_prompt.strip()]
    if style and style in _STYLE_MODIFIERS:
        parts.append(_STYLE_MODIFIERS[style])
    if aspect_ratio and aspect_ratio in _ASPECT_HINTS:
        parts.append(_ASPECT_HINTS[aspect_ratio])
    if brand_context and brand_context.strip():
        parts.append(brand_context.strip())
    return ", ".join(p for p in parts if p)


def distill_brand_context(profile, campaign) -> str:
    """Compose a tight one-line context phrase for the generator.

    The full brand-profile system block is 100s of tokens — too rich for
    a Flux prompt where the user's primary intent should dominate.
    Distil to: brand name, voice (the one knob that actually shifts
    visuals), and the campaign objective if it's specific enough to
    influence imagery.
    """
    bits: list[str] = []
    if profile is not None:
        if getattr(profile, "company_name", None):
            bits.append(f"brand: {profile.company_name}")
        voice = getattr(profile, "voice_guidelines", None)
        if voice:
            # Cap to ~100 chars — full voice docs run paragraphs.
            v = voice.strip()
            if len(v) > 100:
                v = v[:99].rstrip() + "…"
            bits.append(f"voice: {v}")
    if campaign is not None:
        objective = getattr(campaign, "objective", None)
        if objective and objective.strip():
            obj = objective.strip()
            if len(obj) > 100:
                obj = obj[:99].rstrip() + "…"
            bits.append(f"campaign objective: {obj}")
    return ", ".join(bits)
