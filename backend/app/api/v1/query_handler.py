
from fastapi import APIRouter, HTTPException
from app.models.query_model import QueryRequest, QueryResponse
from app.services import perform_search, generate_answer
import logging

router = APIRouter()

@router.post("/answer", response_model=QueryResponse)
async def get_answer(query_request: QueryRequest):
    # log the query
    logging.info(f"Received query: {query_request.query}")
    try:
        search_results = perform_search(query_request.query)
        answer, citations = generate_answer(search_results)
        return QueryResponse(answer=answer, citations=citations, search_results=search_results)
    except Exception as e:
        raise HTTPException(status_code=500, detail="Error generating answer")
