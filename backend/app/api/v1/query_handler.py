from fastapi import APIRouter, HTTPException, Depends
from app.models.query_model import QueryRequest, QueryResponse, SearchRequest
from app.models.search_model import SearchResult
from app.services import perform_search, CloudflareChat
from app.utils.citation_tracker import track_citations
from app.constants.constants import CLOUDFLARE_API_KEY, CLOUDFLARE_ACCOUNT_ID
from typing import Dict, List, Optional
import traceback
import logging
from datetime import datetime, timedelta
from dataclasses import dataclass

router = APIRouter()

# Constants
SESSION_TTL = timedelta(minutes=10)
MAX_PREVIOUS_QUERIES = 3

@dataclass
class SessionData:
    messages: List[Dict[str, str]]
    queries: List[str]
    last_accessed: datetime

    @classmethod
    def create_new(cls) -> 'SessionData':
        return cls(
            messages=[],
            queries=[],
            last_accessed=datetime.utcnow()
        )

# Replace chat_sessions dict with typed version
chat_sessions: Dict[str, SessionData] = {}

def cleanup_expired_sessions() -> None:
    """Remove sessions that have exceeded their TTL."""
    current_time = datetime.utcnow()
    expired_sessions = [
        session_id for session_id, session_data in chat_sessions.items()
        if current_time - session_data.last_accessed > SESSION_TTL
    ]
    for session_id in expired_sessions:
        del chat_sessions[session_id]

def update_session_timestamp(session_id: str) -> None:
    """Update the last accessed timestamp for a session.
    
    Args:
        session_id: The ID of the session to update
    """
    if session_id in chat_sessions:
        chat_sessions[session_id].last_accessed = datetime.utcnow()

def get_or_create_session(session_id: str) -> SessionData:
    """Get existing session or create new one if it doesn't exist.
    
    Args:
        session_id: The session ID to lookup
        
    Returns:
        SessionData: The session data object
    """
    if session_id not in chat_sessions:
        chat_sessions[session_id] = SessionData.create_new()
    else:
        update_session_timestamp(session_id)
    return chat_sessions[session_id]

@router.post("/search/{session_id}", response_model=List[SearchResult])
async def get_search_results(session_id: str, search_request: SearchRequest) -> List[SearchResult]:
    """Perform a search for the given query and return the results.
    
    Args:
        session_id: Unique session identifier
        search_request: Search request containing the query
        
    Returns:
        List of search results
        
    Raises:
        HTTPException: If search fails
    """
    try:
        cleanup_expired_sessions()
        session = get_or_create_session(session_id)
        
        session.queries.append(search_request.query)
        
        # Get last N queries for context
        previous_queries = session.queries[-MAX_PREVIOUS_QUERIES:]
        combined_query = " ".join([search_request.query] + previous_queries[:-1])
        
        search_results = perform_search(combined_query)
        
        # Convert SearchResult objects to list of dictionaries
        return [
            SearchResult(
                question=result.question,
                title=result.title,
                url=result.url,
                snippet=result.snippet,
                search_content=result.search_content,
                source=result.source
            ) for result in search_results
        ]
        
    except Exception as e:
        logging.error(f"Search error: {str(e)}")
        logging.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

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
        # Clean up expired sessions first
        cleanup_expired_sessions()
        
        search_results = [result.model_dump() for result in query_request.search_results]

        # Initialize session if it doesn't exist
        if session_id not in chat_sessions:
            chat_sessions[session_id] = SessionData.create_new()
        else:
            update_session_timestamp(session_id)
        
        # Add current query to session queries
        chat_sessions[session_id].queries.append(query_request.query)
        
        # Initialize CloudflareChat with session context
        cf_chat = CloudflareChat(
            api_key=CLOUDFLARE_API_KEY, 
            account_id=CLOUDFLARE_ACCOUNT_ID
        )
        
        # Generate answer using chat history and all queries
        answer = cf_chat.generate_answer(
            search_results=search_results, 
            chat_history=chat_sessions[session_id].messages,
            query=query_request.query,
            previous_queries=chat_sessions[session_id].queries
        )
        
        # Update chat history
        chat_sessions[session_id].messages.append({
            "role": "user",
            "content": query_request.query
        })
        chat_sessions[session_id].messages.append({
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
    # Clean up expired sessions first
    cleanup_expired_sessions()
    
    if session_id not in chat_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    
    update_session_timestamp(session_id)
    return {"history": chat_sessions[session_id]}
