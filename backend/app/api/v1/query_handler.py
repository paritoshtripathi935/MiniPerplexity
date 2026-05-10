import logging
import time
import traceback
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user, get_optional_user
from app.constants.constants import CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_KEY
from app.db import get_db
from app.db.models import MessageRole, User
from app.db.repository import (
    add_citations,
    add_query,
    append_message,
    delete_session,
    export_session_markdown,
    find_or_create_query,
    get_brand_profile,
    get_chat_history,
    get_message,
    get_or_create_session,
    get_query_text,
    get_recent_queries,
    get_session_history,
    list_recent_plays_for_user,
    list_sessions_for_user,
    search_user_messages,
    set_message_next_steps,
    touch_session,
    update_session,
    update_user_preferred_model,
    upsert_search_results,
)
from app.plays import get_play
from app.services.source_ranker import rerank, tag_authority_in_place
from app.services.system_prompt import compose_system_prompt
from app.models.query_model import QueryRequest, QueryResponse, SearchRequest
from app.services import CloudflareChat, fetch_content_from_custom_url, perform_search
from app.services.language_model import (
    CHAT_MODEL_CATALOG,
    DEFAULT_CHAT_MODEL,
    is_valid_chat_model,
    resolve_chat_model,
)
from app.utils.citation_tracker import track_citations

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_PREVIOUS_QUERIES = 3


@router.post("/search/{session_id}")
async def search(
    session_id: str,
    search_request: SearchRequest,
    custom_url: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Run a search (or fetch a custom URL) and persist the query + results."""
    try:
        await get_or_create_session(
            db, session_id, user_id=(user.id if user else None)
        )
        query_row = await add_query(
            db,
            session_id=session_id,
            query_text=search_request.query,
            custom_url=(custom_url.strip() if custom_url and custom_url.strip() else None),
        )

        if custom_url and custom_url.strip():
            try:
                custom_result = fetch_content_from_custom_url(custom_url.strip())
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e))
            results = [custom_result]
        else:
            results = perform_search(search_request.query)

        # Persist results so /answer can resolve citation_number → search_result_id.
        normalised = [r if isinstance(r, dict) else r.model_dump() for r in results]

        # LLM-driven relevance scoring layered on top of the static domain
        # authority. Skipped for custom-URL fetches (single result) and when
        # there are no results — both are no-op cases for ranking.
        llm_scores: dict[int, int] = {}
        if not (custom_url and custom_url.strip()) and len(normalised) > 1:
            try:
                cf_chat = CloudflareChat(
                    api_key=CLOUDFLARE_API_KEY,
                    account_id=CLOUDFLARE_ACCOUNT_ID,
                )
                llm_scores = cf_chat.score_search_results(
                    query=search_request.query, results=normalised
                )
            except Exception:
                # Reranking is a quality boost, not a correctness requirement.
                # Static authority alone is fine when the LLM call fails.
                logger.warning("LLM rerank failed; falling back to static authority", exc_info=True)

        ranked = rerank(normalised, llm_scores=llm_scores or None)
        await upsert_search_results(db, query_row.id, ranked)

        return ranked

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("Search failed")
        raise HTTPException(status_code=500, detail=f"Search failed: {e}")


@router.post("/answer/{session_id}", response_model=QueryResponse)
async def get_answer(
    session_id: str,
    query_request: QueryRequest,
    play_id: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
    user: Optional[User] = Depends(get_optional_user),
):
    """Generate an answer grounded in the supplied search results, with citations.

    `play_id`, when supplied, layers a Play's instructions + output schema
    onto the system prompt. The user's brand profile (if any) is always
    composed in for signed-in users.
    """
    try:
        await get_or_create_session(
            db, session_id, user_id=(user.id if user else None)
        )

        search_results = [r.model_dump() for r in query_request.search_results]
        # Belt-and-suspenders: re-attach authority tags so the chat UI's
        # "authoritative" badge renders even if the client dropped them.
        tag_authority_in_place(search_results)

        chat_history = await get_chat_history(db, session_id)
        previous_queries = await get_recent_queries(db, session_id, limit=MAX_PREVIOUS_QUERIES)

        # Compose marketing-tuned system prompt.
        profile = await get_brand_profile(db, user.id) if user else None
        play = get_play(play_id) if play_id else None
        system_override = compose_system_prompt(profile=profile, play=play)

        cf_chat = CloudflareChat(
            api_key=CLOUDFLARE_API_KEY,
            account_id=CLOUDFLARE_ACCOUNT_ID,
        )
        # Honour the signed-in user's chosen chat model when present.
        # Anonymous turns use the backend default.
        chosen_model = resolve_chat_model(user.preferred_chat_model if user else None)
        # Time only the LLM call: it's the dominant + most variable cost and
        # the number is directly attributable to the chosen model. DB writes
        # below are excluded so the surfaced metric stays a clean signal.
        t0 = time.perf_counter()
        answer = cf_chat.generate_answer(
            search_results=search_results,
            chat_history=chat_history,
            query=query_request.query,
            previous_queries=previous_queries + [query_request.query],
            system_override=system_override,
            model=chosen_model,
        )
        latency_ms = int((time.perf_counter() - t0) * 1000)

        # Track this turn: reuse the query row from /search if it's still the
        # latest, otherwise create one. Search results upsert is idempotent.
        query_row = await find_or_create_query(
            db, session_id=session_id, query_text=query_request.query
        )
        sr_rows = await upsert_search_results(db, query_row.id, search_results)

        await append_message(
            db,
            session_id=session_id,
            role=MessageRole.user,
            content=query_request.query,
            query_id=query_row.id,
        )
        assistant_msg = await append_message(
            db,
            session_id=session_id,
            role=MessageRole.assistant,
            content=answer,
            query_id=query_row.id,
            play_id=play_id,
            latency_ms=latency_ms,
            model_name=chosen_model,
        )

        # Build citation rows mapping cited URLs back to the search_result UUIDs.
        citations_text = track_citations(search_results)
        cited_urls_in_order = [r.get("url") for r in search_results if r.get("url")]
        url_to_id = {row.url: row.id for row in sr_rows}
        cited_ids = [url_to_id[u] for u in cited_urls_in_order if u in url_to_id]
        await add_citations(db, assistant_msg.id, cited_ids)

        return QueryResponse(
            answer=answer,
            citations=citations_text,
            search_results=search_results,
            message_id=str(assistant_msg.id),
            latency_ms=latency_ms,
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Error generating answer: {e}")


class SessionUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    is_archived: Optional[bool] = None


@router.get("/sessions")
async def list_my_sessions(
    include_archived: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Sidebar feed of the authenticated user's sessions."""
    rows = await list_sessions_for_user(
        db, user.id, include_archived=include_archived, limit=limit, offset=offset
    )
    return {"sessions": rows}


@router.patch("/session/{session_id}")
async def patch_session(
    session_id: str,
    payload: SessionUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Rename or archive a session. Only the owner can patch."""
    updated = await update_session(
        db,
        session_id,
        user_id=user.id,
        title=payload.title,
        is_archived=payload.is_archived,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {
        "id": str(updated.id),
        "title": updated.title,
        "is_archived": updated.is_archived,
    }


@router.get("/session/{session_id}/export")
async def export_session(
    session_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Download a session's chat transcript as Markdown.

    No auth required — anyone with the session_id can export, mirroring the
    `/history` endpoint's access model.
    """
    md = await export_session_markdown(db, session_id)
    if md is None:
        raise HTTPException(status_code=404, detail="Session not found")

    safe_name = session_id.replace("/", "_")[:64]
    return Response(
        content=md,
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="miniperplexity-{safe_name}.md"'
        },
    )


@router.get("/search")
async def search_history(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Full-text search across the user's past messages."""
    results = await search_user_messages(db, user.id, q, limit=limit)
    return {"query": q, "results": results}


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    """Return the authenticated user's profile (creates the row on first call)."""
    return {
        "id": str(user.id),
        "clerk_user_id": user.clerk_user_id,
        "email": user.email,
        "display_name": user.display_name,
        "image_url": user.image_url,
        # Materialise the preference so the UI dropdown can preselect even when
        # the user hasn't chosen one (NULL → backend default).
        "preferred_chat_model": user.preferred_chat_model or DEFAULT_CHAT_MODEL.value,
    }


class PreferredModelUpdate(BaseModel):
    model_id: str = Field(..., min_length=3, max_length=200)


@router.patch("/me/preferred-model")
async def set_preferred_model(
    payload: PreferredModelUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Persist the user's chat-model preference. Whitelist-validated against
    the curated catalog so we never write an arbitrary slug to the DB."""
    if not is_valid_chat_model(payload.model_id):
        raise HTTPException(status_code=400, detail="Unknown model")
    await update_user_preferred_model(db, user.id, payload.model_id)
    return {"preferred_chat_model": payload.model_id}


@router.get("/models")
async def list_chat_models():
    """Catalog of models the chat surface can choose from. Public — the UI
    fetches this to populate the model selector. Stable IDs match what
    `/me/preferred-model` accepts."""
    return {
        "models": [
            {
                "id": m.id,
                "label": m.label,
                "description": m.description,
                "recommended": m.recommended,
            }
            for m in CHAT_MODEL_CATALOG
        ],
        "default": DEFAULT_CHAT_MODEL.value,
    }


@router.delete("/session/{session_id}")
async def clear_session(session_id: str, db: AsyncSession = Depends(get_db)):
    """Delete a session and everything underneath it (cascades)."""
    deleted = await delete_session(db, session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": f"Session {session_id} cleared"}


@router.get("/session/{session_id}/history")
async def get_history(session_id: str, db: AsyncSession = Depends(get_db)):
    """Return chat history + query list for a session."""
    history = await get_session_history(db, session_id)
    if history is None:
        raise HTTPException(status_code=404, detail="Session not found")
    await touch_session(db, session_id)
    return {"history": history}


@router.post("/messages/{message_id}/next-steps")
async def post_message_next_steps(
    message_id: str,
    db: AsyncSession = Depends(get_db),
):
    """Generate (or return cached) follow-up suggestions for an assistant turn.

    Cheap single-shot LLM call. Persisted on the message's `next_steps`
    JSONB so subsequent loads of the same conversation are free.
    Returns `{items: string[]}` (possibly empty if generation failed).
    """
    msg = await get_message(db, message_id)
    if msg is None or msg.role != MessageRole.assistant:
        raise HTTPException(status_code=404, detail="Message not found")

    cached = (msg.next_steps or {}).get("items") if isinstance(msg.next_steps, dict) else None
    if cached:
        return {"items": cached}

    user_query = (
        await get_query_text(db, msg.query_id) if msg.query_id is not None else None
    ) or ""

    cf_chat = CloudflareChat(
        api_key=CLOUDFLARE_API_KEY,
        account_id=CLOUDFLARE_ACCOUNT_ID,
    )
    items = cf_chat.generate_next_steps(user_query=user_query, assistant_answer=msg.content)

    # Persist even when empty so we don't re-roll an LLM call that produced
    # garbage on every page revisit. Subsequent loads will short-circuit.
    await set_message_next_steps(db, msg.id, items)
    return {"items": items}


@router.get("/plays/history")
async def get_plays_history(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Recently used plays for the authenticated user — feeds the Plays page's
    "Recently used" section. Aggregated from assistant messages with non-null
    play_id."""
    items = await list_recent_plays_for_user(db, user.id)
    return {"items": items}
