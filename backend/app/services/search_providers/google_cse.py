"""Google Custom Search Engine provider — the current production path.

This is a thin wrapper around `search_service.search_google` so the existing
logic (rate limiter, BS4 content extraction per result) is reused verbatim.
We keep the original function as-is to minimize blast radius on the spike
branch; the wrapper just adapts it to the SearchProvider Protocol so the
eval harness can call it uniformly with Anakin.
"""
from __future__ import annotations

import logging
from typing import List

from app.models.search_model import SearchResult

from .base import SearchProvider

logger = logging.getLogger(__name__)


class GoogleCSEProvider(SearchProvider):
    name = "google"

    def search(self, query: str) -> List[SearchResult]:
        # Imported lazily so the search_providers package can be imported in
        # contexts that don't have requests/BS4 wired up (eval CLI, tests).
        from app.services.search_service import SearchAPIError, search_google

        try:
            return search_google(query)
        except SearchAPIError as e:
            logger.error("GoogleCSEProvider.search failed: %s", e)
            return []
