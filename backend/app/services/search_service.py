import itertools
from typing import List, Dict
import requests
from concurrent.futures import ThreadPoolExecutor
import os
from bs4 import BeautifulSoup
import random
from app.models.search_model import SearchResult

import os
import random
import requests
from typing import List, Dict
from bs4 import BeautifulSoup

def fetch_content_from_url(url: str) -> str:
    """
    Fetch and extract main text content from a URL.
    Retrieves and parses the first two sentences from each paragraph in the page content.
    
    Args:
        url (str): The URL to fetch content from.
    
    Returns:
        str: Extracted text content from the URL.
    """
    headers = {
        "User-Agent": random.choice([
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/58.0.3029.110 Safari/537.3",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        ])
    }

    try:
        page_response = requests.get(url, headers=headers, timeout=5)
        page_response.raise_for_status()
        
        # Parse the page content with BeautifulSoup
        soup = BeautifulSoup(page_response.content, 'html.parser')
        
        # Extract main text content (first 2 sentences of each paragraph)
        search_content = ' '.join(
            '. '.join(p.get_text().split('. ')[:2]) + '.'
            for p in soup.find_all('p')[:5] if p.get_text()  # Ensure each <p> has text
        )
        
        # Limit the size to avoid excessively large content
        return search_content[:5000]
    
    except Exception as e:
        print(f"Error extracting content from {url}: {e}")
        return ""

def search_bing(query: str) -> List[Dict]:
    """
    Perform a Bing search for the given query.
    
    Args:
        query (str): The search query to perform.
    
    Returns:
        List[Dict]: A list of search results, each containing the title, URL, snippet,
                    search content, and source of the result.
    """
    subscription_key = os.getenv('BING_API_KEY')
    endpoint = "https://api.bing.microsoft.com/v7.0/search"
    
    headers = {"Ocp-Apim-Subscription-Key": subscription_key}
    params = {"q": query, "count": 2}
    
    try:
        response = requests.get(endpoint, headers=headers, params=params)
        response.raise_for_status()
        
        results = []
        for result in response.json().get("webPages", {}).get("value", []):
            title = result.get("name", "")
            url = result.get("url", "")
            snippet = result.get("snippet", "")
            
            results.append({
                "question": query,
                "title": title,
                "url": url,
                "snippet": snippet,
                "search_content": fetch_content_from_url(url),
                "source": "bing"
            })
        
        return results
    
    except Exception as e:
        print(f"Bing search error: {str(e)}")
        return []

def search_google(query: str) -> List[Dict]:
    """
    Perform a Google search for the given query.
    
    Args:
        query (str): The search query to perform.
    
    Returns:
        List[Dict]: A list of search results, each containing the title, URL, snippet,
                    search content, and source of the result.
    """
    api_key = os.getenv('GOOGLE_API_KEY')
    cx = os.getenv('GOOGLE_SEARCH_CX')
    endpoint = "https://www.googleapis.com/customsearch/v1"
    
    params = {
        "key": api_key,
        "cx": cx,
        "q": query,
        "num": 2
    }
    
    try:
        response = requests.get(endpoint, params=params)
        response.raise_for_status()
        search_results = response.json().get("items", [])
        
        results = [{
            "title": item.get("title", ""),
            "url": item.get("link", ""),
            "snippet": item.get("snippet", ""),
            "question": query,
            "search_content": fetch_content_from_url(item.get("link", "")),
            "source": "google",
        } for item in search_results]
        
        return results
    
    except Exception as e:
        print(f"Google search error: {str(e)}")
        return []


def perform_search(query: str) -> List[SearchResult]:
    """
    Perform searches on both Google and Bing Custom Search APIs.
    
    Args:
        query (str): The search query to run on both APIs.
    
    Returns:
        List[SearchResult]: A list of SearchResult objects containing the combined search results from both APIs.
    """
    # Use ThreadPoolExecutor to run searches in parallel
    with ThreadPoolExecutor(max_workers=2) as executor:
        bing_future, google_future = executor.submit(search_bing, query), executor.submit(search_google, query)
        
        # Combine results from both searches
        results = list(itertools.chain(bing_future.result(), google_future.result()))
        
        # Remove duplicate results (if any)
        seen = set()
        filtered_results = []
        for result in results:
            if result["url"] not in seen:
                seen.add(result["url"])
                filtered_results.append(result)
        
    return filtered_results