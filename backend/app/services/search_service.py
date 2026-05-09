import logging
import os
import random
import re
import requests
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Dict, List, Optional

from bs4 import BeautifulSoup
from app.models.search_model import SearchResult
from app.utils.rate_limter import rate_limit
from app.services.youtube_service import YouTubeAPIError

# Constants
BING_ENDPOINT = "https://api.bing.microsoft.com/v7.0/search"
GOOGLE_ENDPOINT = "https://www.googleapis.com/customsearch/v1"
MAX_CONTENT_LENGTH = 5000
MAX_PARAGRAPHS = 5
# Per-engine web result count. We deliberately overfetch (vs. previous 2)
# so the LLM reranker has a real candidate set to choose from. The chat UI
# still trims to a sane number after ranking — this just gives us bench.
RESULTS_PER_ENGINE = 10
REQUEST_TIMEOUT = 5
CALLS_PER_MINUTE = 30

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

logger = logging.getLogger(__name__)

@rate_limit(calls=CALLS_PER_MINUTE, period=60)
def fetch_content_from_url(url: str) -> str:
    """Fetch and extract main text content from a URL.
    
    Args:
        url: The URL to fetch content from
    
    Returns:
        Extracted text content from the URL
        
    Raises:
        ContentFetchError: If content cannot be fetched or parsed
    """
    headers = {"User-Agent": random.choice(USER_AGENTS)}

    try:
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        paragraphs = [
            p.get_text() for p in soup.find_all('p')[:MAX_PARAGRAPHS]
            if p.get_text()
        ]
        
        content = ' '.join(
            '. '.join(p.split('. ')[:2]) + '.'
            for p in paragraphs
        )
        
        return content[:MAX_CONTENT_LENGTH]
    
    except Exception as e:
        logger.error(f"Error extracting content from {url}: {str(e)}")
        raise ContentFetchError(f"Failed to fetch content from {url}: {str(e)}")

@rate_limit(calls=CALLS_PER_MINUTE, period=60)
def search_bing(query: str) -> List[SearchResult]:
    """Perform a Bing search for the given query.
    
    Args:
        query: The search query to perform
    
    Returns:
        List of SearchResult objects
        
    Raises:
        SearchAPIError: If the Bing API request fails
    """
    subscription_key = os.getenv('BING_API_KEY')
    if not subscription_key:
        raise SearchAPIError("BING_API_KEY environment variable not set")

    headers = {"Ocp-Apim-Subscription-Key": subscription_key}
    params = {"q": query, "count": RESULTS_PER_ENGINE, "safeSearch": "Strict"}
    
    try:
        response = requests.get(
            BING_ENDPOINT,
            headers=headers,
            params=params,
            timeout=REQUEST_TIMEOUT
        )

        response.raise_for_status()
        
        results = []
        for result in response.json().get("webPages", {}).get("value", []):
            try:
                search_content = fetch_content_from_url(result.get("url", ""))
                search_result = SearchResult(
                    question=query,
                    title=result.get("name", ""),
                    url=result.get("url", ""),
                    snippet=result.get("snippet", ""),
                    search_content=search_content,
                    source="bing"
                )
                results.append(search_result)
            except ContentFetchError as e:
                logger.warning(f"Skipping result due to content fetch error: {str(e)}")
                continue
        
        return results
    
    except Exception as e:
        logger.error(f"Bing search error: {str(e)}")
        raise SearchAPIError(f"Bing search failed: {str(e)}")

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

# YouTube-side knobs. Overfetch in search.list so post-hoc shorts filtering
# still leaves a healthy bench. The chat right rail caps at 6, so 10 long-
# form returns gives us a comfortable buffer.
_YT_SEARCH_FETCH = 15
_YT_RESULT_CAP = 10
# Shorts are by definition ≤60s. A small buffer lets through edge-case
# 61-65s "soft shorts" that some marketing channels publish, which are
# usually fine for our context. Tune via env if needed.
_SHORTS_THRESHOLD_SECONDS = int(os.getenv("YOUTUBE_SHORTS_MIN_SECONDS", "70"))

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

def perform_search(query: str) -> List[SearchResult]:
    """Perform parallel searches on Google + YouTube and merge results.

    Bing was removed in 2026-05 — Microsoft permanently retired the Bing
    Search API on 2025-08-11; every call returned `410 Gone`. Keeping the
    future in the pool meant ~3s of pointless wait + log noise on every
    /search, contributing to gunicorn worker timeouts on /answer. The
    `search_bing` function is retained for now as dead code in case we
    swap a different provider in via the same shape — see PR #1 (Tavily).
    """
    try:
        with ThreadPoolExecutor(max_workers=2) as executor:
            google_future = executor.submit(search_google, query)
            youtube_future = executor.submit(search_youtube, query)

            results = []
            for future in [google_future, youtube_future]:
                try:
                    results.extend(future.result())
                except (SearchAPIError, YouTubeAPIError) as e:
                    logger.error(f"Search engine error: {str(e)}")
                    continue
            
            # Remove duplicates while preserving order
            seen_urls = set()
            unique_results = []
            for result in results:
                if result.url not in seen_urls:
                    seen_urls.add(result.url)
                    unique_results.append(result)
            
            return unique_results
            
    except Exception as e:
        logger.error(f"Error in perform_search: {str(e)}")
        return []

def fetch_content_from_custom_url(url: str) -> SearchResult:
    """Fetch and extract content from a custom URL.
    
    Args:
        url: The URL to fetch content from
    
    Returns:
        SearchResult object containing the extracted content
        
    Raises:
        ContentFetchError: If content cannot be fetched or parsed
    """
    headers = {"User-Agent": random.choice(USER_AGENTS)}

    try:
        response = requests.get(url, headers=headers, timeout=REQUEST_TIMEOUT)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, 'html.parser')
        
        # Extract title
        title = soup.title.string if soup.title else url
        
        # Extract main content
        paragraphs = [
            p.get_text() for p in soup.find_all('p')[:MAX_PARAGRAPHS]
            if p.get_text()
        ]
        
        content = ' '.join(paragraphs)
        
        return SearchResult(
            question="",  # Not needed for custom URL
            title=title,
            url=url,
            snippet=content[:200] + "...",
            search_content=content[:MAX_CONTENT_LENGTH],
            source="custom_url"
        )
    
    except Exception as e:
        logger.error(f"Error extracting content from {url}: {str(e)}")
        raise ContentFetchError(f"Failed to fetch content from {url}: {str(e)}")