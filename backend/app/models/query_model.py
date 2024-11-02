
from pydantic import BaseModel
from typing import List
from .search_model import SearchResult

class QueryRequest(BaseModel):
    query: str
    search_results: List[SearchResult]
    
class SearchRequest(BaseModel):
    query: str

class QueryResponse(BaseModel):
    answer: str
    citations: List[str]
    search_results: List[dict]