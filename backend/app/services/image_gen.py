"""Cloudflare Workers AI image generation.

Studio surface calls this to render ad creatives via Flux. Model lives
on the same Cloudflare account as our chat models, so no new auth, no
new billing, no new SDK — same `CLOUDFLARE_ACCOUNT_ID` + `CLOUDFLARE_API_KEY`
env vars language_model.py already reads.

Pipeline per call:
  1. Hit Cloudflare's `/ai/run/<model>` endpoint with the prompt.
  2. Cloudflare returns either:
       - JSON  `{ "success": true, "result": { "image": "<base64-png>" } }`
       - raw binary PNG (some Cloudflare image models stream the bytes
         directly with `Content-Type: image/png` and skip the JSON
         envelope entirely)
     We handle both shapes — the response-type check is in
     `_decode_image_response`.
  3. Caller persists the PNG bytes through the storage abstraction
     and writes a `campaign_creatives` row with `prompt` + `ai_model`
     metadata.

The model id is a constructor argument (default Flux Schnell) so we can
A/B alternatives without touching call sites.
"""
from __future__ import annotations

import base64
import logging
import os
from dataclasses import dataclass
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


CLOUDFLARE_AI_BASE = "https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/"
DEFAULT_MODEL = "@cf/black-forest-labs/flux-1-schnell"
DEFAULT_STEPS = 4  # Flux Schnell is a 1-4 step distillation; 4 = max quality.
DEFAULT_TIMEOUT_S = 60.0  # Generation can take 10-30s under load.


class ImageGenError(RuntimeError):
    """Raised when Cloudflare returns a non-success response or the
    body can't be decoded. Surface the message to the caller; the
    endpoint translates it to a 502."""


class ImageGenNotConfiguredError(ImageGenError):
    """Raised when the Cloudflare env vars are missing."""


@dataclass(frozen=True)
class GeneratedImage:
    """A single generated image. `bytes_` is the raw PNG payload ready
    to upload to storage; `model` identifies which model produced it
    (we may A/B in the future and want provenance per row)."""
    bytes_: bytes
    model: str
    mime_type: str = "image/png"


def _credentials() -> tuple[str, str]:
    account_id = os.getenv("CLOUDFLARE_ACCOUNT_ID")
    api_key = os.getenv("CLOUDFLARE_API_KEY")
    if not account_id or not api_key:
        raise ImageGenNotConfiguredError(
            "CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_KEY not set"
        )
    return account_id, api_key


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
    works too."""

    def __init__(self, model: str = DEFAULT_MODEL, timeout_s: float = DEFAULT_TIMEOUT_S):
        self.model = model
        self.timeout_s = timeout_s

    async def generate(self, prompt: str, *, steps: int = DEFAULT_STEPS) -> GeneratedImage:
        if not prompt or not prompt.strip():
            raise ImageGenError("prompt cannot be empty")

        account_id, api_key = _credentials()
        endpoint = CLOUDFLARE_AI_BASE.format(account_id=account_id) + self.model
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        body = {"prompt": prompt.strip(), "steps": max(1, min(steps, 8))}

        try:
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                resp = await client.post(endpoint, headers=headers, json=body)
        except httpx.HTTPError as e:
            logger.error("Cloudflare image-gen request failed: %s", e)
            raise ImageGenError(f"Cloudflare request failed: {e}") from e

        if resp.status_code >= 400:
            # The gotcha-doc convention: include the response body so a
            # failed run tells us what to fix (rate limit, content-policy
            # rejection, model unavailable, etc.).
            body_preview = resp.text[:500]
            logger.error(
                "Cloudflare image-gen returned %s: %s",
                resp.status_code,
                body_preview,
            )
            raise ImageGenError(
                f"Cloudflare returned {resp.status_code}: {body_preview}"
            )

        return GeneratedImage(
            bytes_=_decode_image_response(resp),
            model=self.model,
        )


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
