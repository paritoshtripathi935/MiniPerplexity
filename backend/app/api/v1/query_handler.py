from fastapi import APIRouter, HTTPException, Depends
from app.models.query_model import QueryRequest, QueryResponse, SearchRequest
from app.models.search_model import SearchResult
from app.services import perform_search, CloudflareChat
from app.utils.citation_tracker import track_citations
from app.constants.constants import CLOUDFLARE_API_KEY, CLOUDFLARE_ACCOUNT_ID
from typing import Dict, List
import traceback
import logging

router = APIRouter()

# In-memory session storage (consider using Redis for production)
chat_sessions: Dict[str, List[dict]] = {}

@router.post("/search", response_model=List[SearchResult])
async def get_search_results(search_request: SearchRequest):
    """
    Perform a search for the given query and return the results.

    Args:
        search_request: SearchRequest with the query string

    Returns:
        List[SearchResult]: List of search results, each containing title, URL, snippet, search content, and source of the result

    Raises:
        HTTPException: 500 Internal Server Error if error occurs during search
    """
    try:
        search_results = perform_search(search_request.query)
        return [SearchResult(**result) for result in search_results]
    except Exception as e:
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail="Error performing search.")

@router.post("/answer/{session_id}", response_model=QueryResponse)
async def get_answer(session_id: str, query_request: QueryRequest):
    """
    Generate an answer using the given search results and chat history.

    Args:
        session_id: Unique session ID
        query_request: QueryRequest with query string and search results

    Returns:
        QueryResponse: QueryResponse containing the generated answer, citations, and search results

    Raises:
        HTTPException: 500 Internal Server Error if error occurs generating answer
    """
    try:
        search_results = [result.model_dump() for result in query_request.search_results]

        # Initialize session if it doesn't exist
        if session_id not in chat_sessions:
            chat_sessions[session_id] = []
        
        # Initialize CloudflareChat with session context
        cf_chat = CloudflareChat(
            api_key=CLOUDFLARE_API_KEY, 
            account_id=CLOUDFLARE_ACCOUNT_ID
        )
        
        # Generate answer using chat history
        answer = cf_chat.generate_answer(search_results=search_results, chat_history=chat_sessions[session_id], query=query_request.query)
        
        # Update chat history
        chat_sessions[session_id].append({
            "role": "user",
            "content": query_request.query
        })
        chat_sessions[session_id].append({
            "role": "assistant",
            "content": answer
        })
        
        citations = track_citations(search_results)
        return QueryResponse(
            answer=answer, 
            citations=citations, 
            search_results=search_results
        )
        
    except Exception as e:
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating answer: {e}")

@router.delete("/session/{session_id}")
async def clear_session(session_id: str):
    """
    Clear a user's session.

    Deletes the session from the chat history.

    Args:
        session_id (str): The session ID to clear.

    Returns:
        dict: A message indicating the session was cleared.

    Raises:
        HTTPException: If the session ID is not found.
    """
    if session_id in chat_sessions:
        del chat_sessions[session_id]
        return {"message": f"Session {session_id} cleared"}
    raise HTTPException(status_code=404, detail="Session not found")

# Optional: Endpoint to get session history
@router.get("/session/{session_id}/history")
async def get_session_history(session_id: str):
    """
    Get the chat history for a session.

    Args:
        session_id (str): The session ID to retrieve the chat history for.

    Returns:
        dict: A dictionary containing the chat history for the session.

    Raises:
        HTTPException: If the session ID is not found.
    """
    # Check if the session ID exists in the chat history
    if session_id not in chat_sessions:
        # If not, raise a 404 error
        raise HTTPException(status_code=404, detail="Session not found")
    
    # Return the chat history for the session
    return {"history": chat_sessions[session_id]}
