from pydantic import BaseModel
from typing import List

class SearchResult(BaseModel):
    title: str
    url: str
    snippet: str
    search_content: str
    source: str