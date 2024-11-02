from typing import List, Dict
import os
import requests
from app.models.search_model import SearchResult

YOUTUBE_API_ENDPOINT = "https://www.googleapis.com/youtube/v3/search"
MAX_RESULTS = 2

class YouTubeAPIError(Exception):
    """Raised when YouTube API returns an error"""
    pass

def search_youtube(query: str) -> List[SearchResult]:
    """Search YouTube for relevant videos.
    
    Args:
        query: The search query
        
    Returns:
        List of SearchResult objects containing video information
        
    Raises:
        YouTubeAPIError: If the API request fails
    """
    api_key = os.getenv('YOUTUBE_API_KEY')
    if not api_key:
        raise YouTubeAPIError("YOUTUBE_API_KEY environment variable not set")

    # add safe search parameter
    params = {
        "key": api_key,
        "q": query,
        "part": "snippet",
        "type": "video",
        "maxResults": MAX_RESULTS,
        "safe": "high"
    }

    try:
        response = requests.get(
            YOUTUBE_API_ENDPOINT,
            params=params,
            timeout=5
        )
        response.raise_for_status()
        
        results = []
        for item in response.json().get("items", []):
            video_id = item["id"]["videoId"]
            snippet = item["snippet"]
            
            result = SearchResult(
                question=query,
                title=snippet["title"],
                url=f"https://www.youtube.com/watch?v={video_id}",
                snippet=snippet["description"],
                search_content=snippet["description"],
                source="youtube"
            )
            results.append(result)
            
        return results
        
    except Exception as e:
        raise YouTubeAPIError(f"YouTube search failed: {str(e)}") 