"""Fallback chain — try providers in order, return the first that
yields results.

Designed for the production-safe rollout pattern: put Anakin first so we
get its single-call search-with-content benefit, but fall through to the
existing Google CSE path on any failure (provider down, bad API key,
empty result set, malformed response). Means we can ship the integration
with confidence — the worst case is "search behaves exactly like it does
today on main".

Used in two places:

  1. `perform_search` (production /search endpoint) when
     `WEB_SEARCH_PROVIDER=anakin_then_google` (or just `fallback`).
  2. The eval harness, as a separate "row" in the comparison report so
     we can measure end-to-end behaviour the way prod sees it, not just
     the raw providers in isolation.
"""
from __future__ import annotations

import logging
from typing import List, Sequence

from app.models.search_model import SearchResult

from .base import SearchProvider, SearchProviderError

logger = logging.getLogger(__name__)


class FallbackProvider(SearchProvider):
    """Wraps an ordered list of providers. Tries each in order; returns
    the first non-empty result set.

    A provider that *raises* `SearchProviderError` (config / shape issue)
    is treated the same as one returning `[]` — we move on to the next.
    The intent is "graceful degradation" rather than strict-error: the
    /answer flow should not 500 because Anakin's API key was rotated."""

    def __init__(self, providers: Sequence[SearchProvider], name: str = "fallback") -> None:
        if not providers:
            raise ValueError("FallbackProvider needs at least one provider")
        self.providers = list(providers)
        self.name = name

    def search(self, query: str) -> List[SearchResult]:
        for prov in self.providers:
            try:
                results = prov.search(query)
            except SearchProviderError as e:
                logger.warning(
                    "fallback: provider %r unavailable (%s); trying next",
                    getattr(prov, "name", type(prov).__name__),
                    e,
                )
                continue
            except Exception as e:
                # Defensive — a provider should never reach here, but if
                # it does we still want to fall through.
                logger.exception(
                    "fallback: provider %r raised unexpectedly (%s); trying next",
                    getattr(prov, "name", type(prov).__name__),
                    e,
                )
                continue
            if results:
                logger.info(
                    "fallback: %r returned %d results",
                    getattr(prov, "name", type(prov).__name__),
                    len(results),
                )
                return results
            logger.info(
                "fallback: %r returned 0 results; trying next",
                getattr(prov, "name", type(prov).__name__),
            )
        logger.warning("fallback: every provider returned 0 results for %r", query)
        return []
