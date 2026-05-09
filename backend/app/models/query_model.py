from pydantic import BaseModel
from typing import List, Optional
from .search_model import SearchResult

class QueryRequest(BaseModel):
    query: str
    search_results: List[SearchResult]
    previous_queries: List[str] = []

class SearchRequest(BaseModel):
    query: str
    previous_queries: List[str] = []

class QueryResponse(BaseModel):
    answer: str
    citations: List[str]
    search_results: List[dict]
    # Database id of the persisted assistant message; the frontend uses it to
    # request next-step suggestions and to attach later edits to the right turn.
    message_id: Optional[str] = None