from pydantic import BaseModel

class SearchResult(BaseModel):
    """Search result model"""
    question: str
    title: str
    url: str
    snippet: str
    search_content: str
    source: str