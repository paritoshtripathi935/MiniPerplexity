"""Pluggable web-search providers.

Today's prod path is Google CSE + per-result `requests.get` + BeautifulSoup
extraction (see `search_service.py`). That stack has two known weaknesses:

  1. Latency — every result triggers a second HTTP round-trip just to parse
     the body. With 10 results × ~2-3s each the tail is hostile to a
     conversational answer flow.
  2. Modern-SPA blindness — the BS4 `<p>` walk returns near-empty content for
     anything React-rendered, so the LLM frequently sees only the snippet.

This package introduces a thin provider abstraction so we can drop in
"search-with-content-in-one-call" APIs (Anakin, Exa, Tavily, …) without
touching the call sites. Selection is via the `WEB_SEARCH_PROVIDER` env var
which defaults to `google` (current behavior).

Public surface:

    from app.services.search_providers import get_provider
    provider = get_provider()  # respects WEB_SEARCH_PROVIDER
    results = provider.search(query)  # → List[SearchResult]

Each provider implements `SearchProvider`. New providers should:
  - Set `name` to a stable identifier (used in logs + the `source` field on
    `SearchResult` rows that flow into the chat UI).
  - Return up to N results where N is the provider's RESULTS_PER_ENGINE.
  - Populate `search_content` with extracted text when the provider offers
    it; otherwise fall back to the snippet so the LLM still has something.
"""
from __future__ import annotations

import logging
import os
from typing import Optional

from .anakin import AnakinProvider
from .base import SearchProvider, SearchProviderError
from .fallback import FallbackProvider
from .google_cse import GoogleCSEProvider

logger = logging.getLogger(__name__)


def get_provider(override: Optional[str] = None) -> SearchProvider:
    """Resolve the active provider.

    Order of precedence:
        explicit arg  >  WEB_SEARCH_PROVIDER env  >  smart default

    Smart default: when ANAKIN_API_KEY is present, use the
    "anakin_then_google" fallback chain — Anakin first, Google CSE on
    failure / empty results. When the key is absent, fall back to the
    existing Google-only path so production behaviour is unchanged for
    deploys that haven't configured Anakin yet.

    Recognised values for WEB_SEARCH_PROVIDER / override:
      - "anakin"               — Anakin only (raises if key missing)
      - "google" | "cse"       — Google CSE only (existing path)
      - "anakin_then_google"   — Anakin → fall through to Google
      - "fallback"             — alias for "anakin_then_google"
    """
    raw = override if override is not None else os.getenv("WEB_SEARCH_PROVIDER")
    if not raw:
        # Smart default: use the chain if we can; otherwise plain google.
        raw = "anakin_then_google" if os.getenv("ANAKIN_API_KEY") else "google"
    choice = raw.lower()

    if choice in ("google", "google_cse", "cse"):
        return GoogleCSEProvider()
    if choice == "anakin":
        return AnakinProvider()
    if choice in ("anakin_then_google", "fallback"):
        return FallbackProvider(
            providers=[AnakinProvider(), GoogleCSEProvider()],
            name="anakin_then_google",
        )
    raise SearchProviderError(f"unknown WEB_SEARCH_PROVIDER: {choice!r}")


__all__ = [
    "AnakinProvider",
    "FallbackProvider",
    "GoogleCSEProvider",
    "SearchProvider",
    "SearchProviderError",
    "get_provider",
]
