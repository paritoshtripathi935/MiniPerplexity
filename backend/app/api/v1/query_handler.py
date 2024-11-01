from fastapi import APIRouter, HTTPException, Depends
from app.models.query_model import QueryRequest, QueryResponse
from app.services import perform_search, CloudflareChat
from app.utils.citation_tracker import track_citations
from app.constants.constants import CLOUDFLARE_API_KEY, CLOUDFLARE_ACCOUNT_ID
from typing import Dict, List
import traceback
import logging

router = APIRouter()

# In-memory session storage (consider using Redis for production)
chat_sessions: Dict[str, List[dict]] = {}

@router.post("/answer/{session_id}", response_model=QueryResponse)
async def get_answer(session_id: str, query_request: QueryRequest):
    try:
        # Initialize session if it doesn't exist
        if session_id not in chat_sessions:
            chat_sessions[session_id] = []
        
        # Get chat history for this session
        chat_history = chat_sessions[session_id]
        
        # Perform search with context
        search_results = perform_search(query_request.query)
        
        # Initialize CloudflareChat with session context
        cf_chat = CloudflareChat(
            api_key=CLOUDFLARE_API_KEY, 
            account_id=CLOUDFLARE_ACCOUNT_ID
        )
        
        # Generate answer using chat history
        answer = cf_chat.generate_answer(
            search_results,
            chat_history=chat_history
        )
        
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

# Optional: Endpoint to clear session
@router.delete("/session/{session_id}")
async def clear_session(session_id: str):
    if session_id in chat_sessions:
        del chat_sessions[session_id]
        return {"message": f"Session {session_id} cleared"}
    raise HTTPException(status_code=404, detail="Session not found")

# Optional: Endpoint to get session history
@router.get("/session/{session_id}/history")
async def get_session_history(session_id: str):
    if session_id not in chat_sessions:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"history": chat_sessions[session_id]}
