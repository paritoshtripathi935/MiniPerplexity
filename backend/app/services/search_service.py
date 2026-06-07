import logging
import os
import random
import re
import requests
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional

from bs4 import BeautifulSoup
from app.models.search_model import SearchResult
from app.utils.rate_limter import rate_limit
from app.core.config import config as _cfg

GOOGLE_ENDPOINT = "https://www.googleapis.com/customsearch/v1"

# Read from config/settings.yaml — change there, no code deploy needed.
_http = _cfg.settings.http
MAX_CONTENT_LENGTH = _http.max_content_length
MAX_PARAGRAPHS = _http.max_paragraphs
REQUEST_TIMEOUT = _http.request_timeout
CALLS_PER_MINUTE = _cfg.settings.rate_limits.search_calls_per_minute

# Read per-engine knobs from config/search_engines.yaml.
_google_cfg = _cfg.search.get("google")
_yt_cfg = _cfg.search.get("youtube")
RESULTS_PER_ENGINE = _google_cfg.max_results if _google_cfg else 10
_YT_SEARCH_FETCH = _yt_cfg.overfetch if _yt_cfg else 15
_YT_RESULT_CAP = _yt_cfg.max_results if _yt_cfg else 10
_SHORTS_THRESHOLD_SECONDS = _yt_cfg.shorts_min_seconds if _yt_cfg else 70

# User agent rotation
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
]

# Custom exceptions
class SearchAPIError(Exception):
    """Raised when search API returns an error"""
    pass

class ContentFetchError(Exception):
    """Raised when content fetching fails"""
    pass

class YouTubeAPIError(Exception):
    """Raised when YouTube API returns an error"""
    pass

logger = logging.getLogger(__name__)


def _get_soup(url: str) -> BeautifulSoup:
    """Fetch a URL and return parsed HTML. Raises ContentFetchError on failure."""
    try:
        response = requests.get(
            url,
            headers={"User-Agent": random.choice(USER_AGENTS)},
            timeout=REQUEST_TIMEOUT,
        )
        response.raise_for_status()
        return BeautifulSoup(response.content, "html.parser")
    except Exception as e:
        raise ContentFetchError(f"Failed to fetch content from {url}: {e}") from e


@rate_limit(calls=CALLS_PER_MINUTE, period=60)
def fetch_content_from_url(url: str) -> str:
    """Fetch and extract the first two sentences of each leading paragraph."""
    try:
        soup = _get_soup(url)
        paragraphs = [p.get_text() for p in soup.find_all("p")[:MAX_PARAGRAPHS] if p.get_text()]
        content = " ".join(". ".join(p.split(". ")[:2]) + "." for p in paragraphs)
        return content[:MAX_CONTENT_LENGTH]
    except ContentFetchError:
        raise
    except Exception as e:
        logger.error(f"Error extracting content from {url}: {e}")
        raise ContentFetchError(f"Failed to fetch content from {url}: {e}") from e

@rate_limit(calls=CALLS_PER_MINUTE, period=60)
def search_google(query: str) -> List[SearchResult]:
    """Perform a Google search for the given query.
    
    Args:
        query: The search query to perform
    
    Returns:
        List of SearchResult objects
        
    Raises:
        SearchAPIError: If the Google API request fails
    """
    api_key = os.getenv('GOOGLE_API_KEY')
    cx = os.getenv('GOOGLE_SEARCH_CX')
    
    if not api_key or not cx:
        raise SearchAPIError("Google API credentials not properly configured")
    
    params = {
        "key": api_key,
        "cx": cx,
        "q": query,
        "num": RESULTS_PER_ENGINE,
        "safeSearch": "strict"
    }
    
    try:
        response = requests.get(
            GOOGLE_ENDPOINT,
            params=params,
            timeout=REQUEST_TIMEOUT
        )
        response.raise_for_status()
        
        results = []
        for item in response.json().get("items", []):
            try:
                search_content = fetch_content_from_url(item.get("link", ""))
                search_result = SearchResult(
                    question=query,
                    title=item.get("title", ""),
                    url=item.get("link", ""),
                    snippet=item.get("snippet", ""),
                    search_content=search_content,
                    source="google"
                )
                results.append(search_result)
            except ContentFetchError as e:
                logger.warning(f"Skipping result due to content fetch error: {str(e)}")
                continue
                
        return results
    
    except Exception as e:
        logger.error(f"Google search error: {str(e)}")
        raise SearchAPIError(f"Google search failed: {str(e)}")

_ISO_DURATION_RE = re.compile(r"^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$")


def _iso8601_duration_seconds(value: str) -> int:
    """Parse YouTube's ISO-8601 duration ("PT1M30S") into total seconds.
    Returns 0 on a missing/unparseable value so callers can default-skip."""
    m = _ISO_DURATION_RE.match(value or "")
    if not m:
        return 0
    h, mn, s = m.groups()
    return int(h or 0) * 3600 + int(mn or 0) * 60 + int(s or 0)


@rate_limit(calls=CALLS_PER_MINUTE, period=60)
def search_youtube(query: str) -> List[SearchResult]:
    """Search YouTube for relevant videos, excluding Shorts.

    Two-call flow: search.list to find candidates, then videos.list for
    contentDetails so we can drop anything under _SHORTS_THRESHOLD_SECONDS.
    The second call is one HTTP request regardless of candidate count and
    costs 1 quota unit (vs 100 for search.list), so the overhead is trivial.

    Returns up to _YT_RESULT_CAP non-Shorts videos. Order from search.list
    is preserved (relevance ranking).
    """
    api_key = os.getenv('YOUTUBE_API_KEY')
    if not api_key:
        raise YouTubeAPIError("YOUTUBE_API_KEY environment variable not set")

    search_params = {
        "key": api_key,
        "q": query,
        "part": "snippet",
        "type": "video",
        "maxResults": _YT_SEARCH_FETCH,
        "safeSearch": "strict",
    }

    try:
        search_resp = requests.get(
            "https://www.googleapis.com/youtube/v3/search",
            params=search_params,
            timeout=5,
        )
        search_resp.raise_for_status()
        items = search_resp.json().get("items", [])
        if not items:
            return []

        # Bulk-fetch durations for the candidate set so we can drop Shorts.
        # If this call fails we degrade gracefully and return everything —
        # better to show some Shorts than to surface zero videos.
        durations: Dict[str, int] = {}
        try:
            ids = [it["id"]["videoId"] for it in items if it.get("id", {}).get("videoId")]
            if ids:
                details_resp = requests.get(
                    "https://www.googleapis.com/youtube/v3/videos",
                    params={
                        "key": api_key,
                        "id": ",".join(ids),
                        "part": "contentDetails",
                    },
                    timeout=5,
                )
                details_resp.raise_for_status()
                for d in details_resp.json().get("items", []):
                    durations[d["id"]] = _iso8601_duration_seconds(
                        d.get("contentDetails", {}).get("duration", "")
                    )
        except requests.exceptions.RequestException as e:
            logger.warning(f"YouTube duration lookup failed; skipping shorts filter: {e}")

        results: List[SearchResult] = []
        for item in items:
            video_id = item.get("id", {}).get("videoId")
            if not video_id:
                continue
            # When durations is empty (lookup failed) skip the filter rather
            # than return nothing.
            if durations and durations.get(video_id, 0) < _SHORTS_THRESHOLD_SECONDS:
                continue
            snippet = item["snippet"]
            results.append(
                SearchResult(
                    question=query,
                    title=snippet["title"],
                    url=f"https://www.youtube.com/watch?v={video_id}",
                    snippet=snippet["description"],
                    search_content=snippet["description"],
                    source="youtube",
                )
            )
            if len(results) >= _YT_RESULT_CAP:
                break

        return results
        
    except Exception as e:
        raise YouTubeAPIError(f"YouTube search failed: {str(e)}")

# Registry maps engine id → callable. Add a new engine here after wiring it in
# config/search_engines.yaml with enabled: true.
_ENGINE_REGISTRY: Dict[str, callable] = {
    "google": search_google,
    "youtube": search_youtube,
}


def perform_search(query: str) -> List[SearchResult]:
    """Run all enabled engines in parallel and merge deduplicated results.

    Which engines run is controlled by config/search_engines.yaml — flip
    `enabled: true/false` there and restart; no code change needed.
    """
    engines = [e for e in _cfg.search.enabled if e.id in _ENGINE_REGISTRY]
    try:
        with ThreadPoolExecutor(max_workers=len(engines)) as executor:
            futures = {executor.submit(_ENGINE_REGISTRY[e.id], query): e.id for e in engines}
            results = []
            for future, engine_id in futures.items():
                try:
                    results.extend(future.result())
                except (SearchAPIError, YouTubeAPIError) as e:
                    logger.error(f"{engine_id} search error: {e}")

        seen_urls: set[str] = set()
        unique: List[SearchResult] = []
        for result in results:
            if result.url not in seen_urls:
                seen_urls.add(result.url)
                unique.append(result)
        return unique

    except Exception as e:
        logger.error(f"Error in perform_search: {e}")
        return []

@rate_limit(calls=CALLS_PER_MINUTE, period=60)
def fetch_content_from_custom_url(url: str) -> SearchResult:
    """Fetch a URL and return a SearchResult with full paragraph text."""
    soup = _get_soup(url)
    title = soup.title.string if soup.title else url
    paragraphs = [p.get_text() for p in soup.find_all("p")[:MAX_PARAGRAPHS] if p.get_text()]
    content = " ".join(paragraphs)
    return SearchResult(
        question="",
        title=title,
        url=url,
        snippet=content[:200] + "...",
        search_content=content[:MAX_CONTENT_LENGTH],
        source="custom_url",
    )