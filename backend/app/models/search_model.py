from pydantic import BaseModel, ConfigDict

class SearchResult(BaseModel):
    """Search result model.

    `extra="allow"` so re-ranker tags (`_authority`, `_authoritative`) survive
    the /search → frontend → /answer round-trip; the alternative is the badge
    on chat sources flickering to false on the live answer flow.
    """
    model_config = ConfigDict(extra="allow")

    question: str
    title: str
    url: str
    snippet: str
    search_content: str
    source: str