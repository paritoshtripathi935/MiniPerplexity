import json
import logging
import time
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, Response, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth import get_current_user
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
    get_brand_profile_for_user,
    get_chat_history,
    get_message,
    get_or_create_session,
    get_session_campaign,
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
    CloudflareModel,
    is_valid_chat_model,
    resolve_chat_model,
)
from app.utils.citation_tracker import track_citations

logger = logging.getLogger(__name__)

router = APIRouter()

MAX_PREVIOUS_QUERIES = 3


def _make_cf_chat() -> CloudflareChat:
    return CloudflareChat(api_key=CLOUDFLARE_API_KEY, account_id=CLOUDFLARE_ACCOUNT_ID)


async def _build_context(
    db: AsyncSession,
    session_id: str,
    user: User,
    search_results: list[dict],
    campaign_id: Optional[uuid.UUID],
    play_id: Optional[str],
) -> tuple[list[dict], list[str], str, CloudflareModel]:
    await get_or_create_session(db, session_id, user_id=user.id, campaign_id=campaign_id)
    tag_authority_in_place(search_results)
    chat_history = await get_chat_history(db, session_id)
    previous_queries = await get_recent_queries(db, session_id, limit=MAX_PREVIOUS_QUERIES)
    profile = await get_brand_profile_for_user(db, user.id)
    campaign = await get_session_campaign(db, session_id)
    play = get_play(play_id) if play_id else None
    system_override = compose_system_prompt(profile=profile, campaign=campaign, play=play)
    chosen_model = resolve_chat_model(user.preferred_chat_model)
    return chat_history, previous_queries, system_override, chosen_model


async def _persist_answer(
    db: AsyncSession,
    session_id: str,
    query_text: str,
    search_results: list[dict],
    answer: str,
    play_id: Optional[str],
    latency_ms: int,
    chosen_model: CloudflareModel,
):
    query_row = await find_or_create_query(db, session_id=session_id, query_text=query_text)
    sr_rows = await upsert_search_results(db, query_row.id, search_results)
    await append_message(
        db, session_id=session_id, role=MessageRole.user,
        content=query_text, query_id=query_row.id,
    )
    assistant_msg = await append_message(
        db, session_id=session_id, role=MessageRole.assistant,
        content=answer, query_id=query_row.id,
        play_id=play_id, latency_ms=latency_ms, model_name=chosen_model,
    )
    citations_text = track_citations(search_results)
    cited_urls = [r.get("url") for r in search_results if r.get("url")]
    url_to_id = {row.url: row.id for row in sr_rows}
    await add_citations(db, assistant_msg.id, [url_to_id[u] for u in cited_urls if u in url_to_id])
    return assistant_msg, citations_text


@router.post("/search/{session_id}")
async def search(
    session_id: str,
    search_request: SearchRequest,
    custom_url: Optional[str] = None,
    campaign_id: Optional[uuid.UUID] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        await get_or_create_session(db, session_id, user_id=user.id, campaign_id=campaign_id)
        query_row = await add_query(
            db,
            session_id=session_id,
            query_text=search_request.query,
            custom_url=(custom_url.strip() if custom_url and custom_url.strip() else None),
        )

        if custom_url and custom_url.strip():
            try:
                results = [fetch_content_from_custom_url(custom_url.strip())]
            except Exception as e:
                raise HTTPException(status_code=400, detail=str(e))
        else:
            results = perform_search(search_request.query)

        normalised = [r if isinstance(r, dict) else r.model_dump() for r in results]

        llm_scores: dict[int, int] = {}
        if not (custom_url and custom_url.strip()) and len(normalised) > 1:
            try:
                llm_scores = _make_cf_chat().score_search_results(
                    query=search_request.query, results=normalised
                )
            except Exception:
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
    campaign_id: Optional[uuid.UUID] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        search_results = [r.model_dump() for r in query_request.search_results]
        chat_history, previous_queries, system_override, chosen_model = await _build_context(
            db, session_id, user, search_results, campaign_id, play_id
        )

        t0 = time.perf_counter()
        answer = _make_cf_chat().generate_answer(
            search_results=search_results,
            chat_history=chat_history,
            query=query_request.query,
            previous_queries=previous_queries + [query_request.query],
            system_override=system_override,
            model=chosen_model,
        )
        latency_ms = int((time.perf_counter() - t0) * 1000)

        assistant_msg, citations_text = await _persist_answer(
            db, session_id, query_request.query, search_results,
            answer, play_id, latency_ms, chosen_model,
        )
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
        logger.exception("Error generating answer")
        raise HTTPException(status_code=500, detail=f"Error generating answer: {e}")


def _sse(event: str, data: dict) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n".encode("utf-8")


@router.post("/answer/{session_id}/stream")
async def stream_answer(
    session_id: str,
    query_request: QueryRequest,
    play_id: Optional[str] = None,
    campaign_id: Optional[uuid.UUID] = Query(default=None),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    search_results = [r.model_dump() for r in query_request.search_results]
    chat_history, previous_queries, system_override, chosen_model = await _build_context(
        db, session_id, user, search_results, campaign_id, play_id
    )
    cf_chat = _make_cf_chat()

    async def event_stream():
        t0 = time.perf_counter()
        collected: list[str] = []
        try:
            async for delta in cf_chat.stream_answer(
                search_results=search_results,
                chat_history=chat_history,
                query=query_request.query,
                previous_queries=previous_queries + [query_request.query],
                system_override=system_override,
                model=chosen_model,
            ):
                collected.append(delta)
                yield _sse("token", {"text": delta})
        except Exception as e:
            logger.exception("Streaming failed")
            yield _sse("error", {"detail": f"Streaming failed: {e}"})
            return

        answer = "".join(collected)
        latency_ms = int((time.perf_counter() - t0) * 1000)

        try:
            assistant_msg, citations_text = await _persist_answer(
                db, session_id, query_request.query, search_results,
                answer, play_id, latency_ms, chosen_model,
            )
        except Exception as e:
            logger.exception("Post-stream persistence failed")
            yield _sse("error", {"detail": f"Persisted partial: {e}"})
            return

        yield _sse("done", {
            "message_id": str(assistant_msg.id),
            "latency_ms": latency_ms,
            "citations": citations_text,
            "search_results": search_results,
        })

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )


class SessionUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    is_archived: Optional[bool] = None


@router.get("/sessions")
async def list_my_sessions(
    include_archived: bool = False,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    campaign_id: Optional[uuid.UUID] = Query(default=None),
    project_id: Optional[uuid.UUID] = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = await list_sessions_for_user(
        db, user.id,
        include_archived=include_archived,
        limit=limit, offset=offset,
        campaign_id=campaign_id, project_id=project_id,
    )
    return {"sessions": rows}


@router.patch("/session/{session_id}")
async def patch_session(
    session_id: str,
    payload: SessionUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    updated = await update_session(
        db, session_id, user_id=user.id,
        title=payload.title, is_archived=payload.is_archived,
    )
    if updated is None:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"id": str(updated.id), "title": updated.title, "is_archived": updated.is_archived}


@router.get("/session/{session_id}/export")
async def export_session(session_id: str, db: AsyncSession = Depends(get_db)):
    md = await export_session_markdown(db, session_id)
    if md is None:
        raise HTTPException(status_code=404, detail="Session not found")
    safe_name = session_id.replace("/", "_")[:64]
    return Response(
        content=md,
        media_type="text/markdown; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="miniperplexity-{safe_name}.md"'},
    )


@router.get("/search")
async def search_history(
    q: str = Query(..., min_length=1, max_length=200),
    limit: int = Query(default=20, ge=1, le=50),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    results = await search_user_messages(db, user.id, q, limit=limit)
    return {"query": q, "results": results}


@router.get("/me")
async def me(user: User = Depends(get_current_user)):
    return {
        "id": str(user.id),
        "clerk_user_id": user.clerk_user_id,
        "email": user.email,
        "display_name": user.display_name,
        "image_url": user.image_url,
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
    if not is_valid_chat_model(payload.model_id):
        raise HTTPException(status_code=400, detail="Unknown model")
    await update_user_preferred_model(db, user.id, payload.model_id)
    return {"preferred_chat_model": payload.model_id}


@router.get("/models")
async def list_chat_models(response: Response):
    response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"
    return {
        "models": [
            {"id": m.id, "label": m.label, "description": m.description, "recommended": m.recommended}
            for m in CHAT_MODEL_CATALOG
        ],
        "default": DEFAULT_CHAT_MODEL.value,
    }


@router.delete("/session/{session_id}")
async def clear_session(
    session_id: str,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    deleted = await delete_session(db, session_id, user_id=user.id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Session not found")
    return {"message": f"Session {session_id} cleared"}


@router.get("/session/{session_id}/history")
async def get_history(session_id: str, db: AsyncSession = Depends(get_db)):
    history = await get_session_history(db, session_id)
    if history is None:
        raise HTTPException(status_code=404, detail="Session not found")
    await touch_session(db, session_id)
    return {"history": history}


@router.post("/messages/{message_id}/next-steps")
async def post_message_next_steps(message_id: str, db: AsyncSession = Depends(get_db)):
    msg = await get_message(db, message_id)
    if msg is None or msg.role != MessageRole.assistant:
        raise HTTPException(status_code=404, detail="Message not found")

    cached = (msg.next_steps or {}).get("items") if isinstance(msg.next_steps, dict) else None
    if cached:
        return {"items": cached}

    user_query = (
        await get_query_text(db, msg.query_id) if msg.query_id is not None else None
    ) or ""

    items = _make_cf_chat().generate_next_steps(user_query=user_query, assistant_answer=msg.content)
    await set_message_next_steps(db, msg.id, items)
    return {"items": items}


@router.get("/plays/history")
async def get_plays_history(
    campaign_id: Optional[uuid.UUID] = Query(default=None),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items = await list_recent_plays_for_user(db, user.id, campaign_id=campaign_id)
    return {"items": items}
