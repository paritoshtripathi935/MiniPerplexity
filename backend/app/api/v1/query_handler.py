
from fastapi import APIRouter, HTTPException
from app.models.query_model import QueryRequest, QueryResponse
from app.services import perform_search, CloudflareChat
from app.utils.citation_tracker import track_citations
from app.constants.constants import CLOUDFLARE_API_KEY, CLOUDFLARE_ACCOUNT_ID
import traceback
import logging
router = APIRouter()

@router.post("/answer", response_model=QueryResponse)
async def get_answer(query_request: QueryRequest):
    try:
        search_results = perform_search(query_request.query)
        answer = CloudflareChat(api_key=CLOUDFLARE_API_KEY, account_id=CLOUDFLARE_ACCOUNT_ID).generate_answer(search_results)
        citations = track_citations(search_results)
        return QueryResponse(answer=answer, citations=citations, search_results=search_results)
    except Exception as e:
        print(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating answer {e}")
