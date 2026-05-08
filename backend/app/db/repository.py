"""Repository functions — thin wrappers around SQLAlchemy queries.

Kept as plain async functions (not classes) because they're straightforward,
each one is self-contained, and FastAPI's DI passes the session in cleanly.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    Citation,
    Message,
    MessageRole,
    Query,
    SearchResultRow,
    SearchSource,
    Session as DBSession,
)


# Mirrors the original SESSION_TTL = timedelta(minutes=10), but configurable.
SESSION_TTL = timedelta(seconds=int(os.getenv("SESSION_TTL_SECONDS", "600")))
MAX_HISTORY_MESSAGES = 50  # Cap loaded chat history to keep prompt sizes sane.


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _to_uuid(session_id: str) -> uuid.UUID:
    """Coerce the frontend's session_id string to a UUID.

    The frontend may pass any opaque string. We hash non-UUID strings into a
    deterministic UUIDv5 so existing clients don't need to change.
    """
    try:
        return uuid.UUID(session_id)
    except (ValueError, AttributeError):
        return uuid.uuid5(uuid.NAMESPACE_URL, f"miniperplexity:session:{session_id}")


# ---------- Sessions --------------------------------------------------------
async def get_or_create_session(
    db: AsyncSession,
    session_id: str,
    *,
    user_id: Optional[uuid.UUID] = None,
) -> DBSession:
    """Upsert a session row.

    If `user_id` is supplied, attach it on insert and on subsequent touches
    (claiming a previously-anonymous session for the user that just signed in).
    """
    sid = _to_uuid(session_id)
    now = _now()
    expires = now + SESSION_TTL

    values: dict = {
        "id": sid,
        "last_accessed_at": now,
        "expires_at": expires,
    }
    update_set: dict = {"last_accessed_at": now, "expires_at": expires}
    if user_id is not None:
        values["user_id"] = user_id
        # COALESCE so we never overwrite an existing owner with a different user.
        update_set["user_id"] = func.coalesce(DBSession.user_id, user_id)

    stmt = (
        pg_insert(DBSession)
        .values(**values)
        .on_conflict_do_update(index_elements=[DBSession.id], set_=update_set)
        .returning(DBSession)
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def touch_session(db: AsyncSession, session_id: str) -> None:
    sid = _to_uuid(session_id)
    now = _now()
    await db.execute(
        DBSession.__table__.update()
        .where(DBSession.id == sid)
        .values(last_accessed_at=now, expires_at=now + SESSION_TTL)
    )


async def delete_session(db: AsyncSession, session_id: str) -> bool:
    sid = _to_uuid(session_id)
    result = await db.execute(delete(DBSession).where(DBSession.id == sid))
    return (result.rowcount or 0) > 0


async def cleanup_expired_sessions(db: AsyncSession) -> int:
    """Drop sessions whose TTL has elapsed (cascades to children)."""
    now = _now()
    result = await db.execute(
        delete(DBSession).where(
            DBSession.expires_at < now,
            DBSession.is_archived.is_(False),
        )
    )
    return result.rowcount or 0


async def get_session_history(db: AsyncSession, session_id: str) -> Optional[dict]:
    """Return a JSON-friendly snapshot mirroring the original SessionData shape."""
    sid = _to_uuid(session_id)
    sess = await db.get(DBSession, sid)
    if sess is None:
        return None

    msg_rows = (
        await db.execute(
            select(Message)
            .where(Message.session_id == sid)
            .order_by(Message.created_at.asc())
        )
    ).scalars().all()

    qry_rows = (
        await db.execute(
            select(Query.query_text)
            .where(Query.session_id == sid)
            .order_by(Query.position.asc())
        )
    ).scalars().all()

    return {
        "messages": [{"role": m.role.value, "content": m.content} for m in msg_rows],
        "queries": list(qry_rows),
        "last_accessed": sess.last_accessed_at.isoformat(),
    }


# ---------- Queries ---------------------------------------------------------
async def add_query(
    db: AsyncSession,
    session_id: str,
    query_text: str,
    custom_url: Optional[str] = None,
) -> Query:
    sid = _to_uuid(session_id)

    # Atomically compute next position. The UNIQUE(session_id, position)
    # constraint catches concurrent inserts; the caller can retry if needed.
    next_pos = (
        await db.execute(
            select(func.coalesce(func.max(Query.position), -1) + 1).where(
                Query.session_id == sid
            )
        )
    ).scalar_one()

    q = Query(
        session_id=sid,
        query_text=query_text,
        custom_url=custom_url,
        position=next_pos,
    )
    db.add(q)
    await db.flush()
    return q


async def find_or_create_query(
    db: AsyncSession, session_id: str, query_text: str
) -> Query:
    """Reuse the most-recent query in this session if its text matches.

    The frontend's flow is /search → /answer with the same query, so without
    this we'd persist two rows per user turn. Falls back to creating a fresh
    row if there is no recent match (e.g. /answer called directly).
    """
    sid = _to_uuid(session_id)
    latest = (
        await db.execute(
            select(Query)
            .where(Query.session_id == sid)
            .order_by(Query.position.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest is not None and latest.query_text == query_text:
        return latest
    return await add_query(db, session_id=session_id, query_text=query_text)


async def get_recent_queries(
    db: AsyncSession, session_id: str, limit: int = 3
) -> list[str]:
    sid = _to_uuid(session_id)
    rows = (
        await db.execute(
            select(Query.query_text)
            .where(Query.session_id == sid)
            .order_by(Query.position.desc())
            .limit(limit)
        )
    ).scalars().all()
    return list(reversed(rows))


# ---------- Messages --------------------------------------------------------
async def append_message(
    db: AsyncSession,
    session_id: str,
    role: MessageRole,
    content: str,
    *,
    query_id: Optional[uuid.UUID] = None,
    model_name: Optional[str] = None,
    tokens_input: Optional[int] = None,
    tokens_output: Optional[int] = None,
    latency_ms: Optional[int] = None,
) -> Message:
    sid = _to_uuid(session_id)
    msg = Message(
        session_id=sid,
        query_id=query_id,
        role=role,
        content=content,
        model_name=model_name,
        tokens_input=tokens_input,
        tokens_output=tokens_output,
        latency_ms=latency_ms,
    )
    db.add(msg)
    await db.flush()
    return msg


async def get_chat_history(
    db: AsyncSession, session_id: str, limit: int = MAX_HISTORY_MESSAGES
) -> list[dict[str, str]]:
    """Return [{role, content}, …] in chronological order, ready for the LLM."""
    sid = _to_uuid(session_id)
    rows = (
        await db.execute(
            select(Message.role, Message.content)
            .where(Message.session_id == sid)
            .order_by(Message.created_at.asc())
            .limit(limit)
        )
    ).all()
    return [{"role": r.value, "content": c} for r, c in rows]


# ---------- Search results --------------------------------------------------
def _infer_source(url: str) -> SearchSource:
    if "youtube.com" in url or "youtu.be" in url:
        return SearchSource.youtube
    return SearchSource.web


async def upsert_search_results(
    db: AsyncSession,
    query_id: uuid.UUID,
    results: Iterable[dict],
    *,
    source_override: Optional[SearchSource] = None,
) -> list[SearchResultRow]:
    """Insert search results, ignoring duplicates by (query_id, url).

    Accepts dicts shaped like the existing `SearchResult` Pydantic model.
    Returns the full set of rows for the query (including ones already there),
    so callers can build url→id maps without a second round-trip.
    """
    payload: list[dict] = []
    for position, r in enumerate(results):
        url = r.get("url") or ""
        if not url:
            continue
        payload.append(
            {
                "query_id": query_id,
                "position": position,
                "source": (source_override or _infer_source(url)).value,
                "title": r.get("title") or url,
                "url": url,
                "snippet": r.get("snippet"),
                "search_content": r.get("search_content"),
                "question": r.get("question"),
            }
        )

    if payload:
        stmt = (
            pg_insert(SearchResultRow.__table__)
            .values(payload)
            .on_conflict_do_nothing(index_elements=["query_id", "url"])
        )
        await db.execute(stmt)

    rows = (
        await db.execute(
            select(SearchResultRow)
            .where(SearchResultRow.query_id == query_id)
            .order_by(SearchResultRow.position.asc())
        )
    ).scalars().all()
    return list(rows)


# ---------- Citations -------------------------------------------------------
async def add_citations(
    db: AsyncSession,
    message_id: uuid.UUID,
    search_result_ids: Iterable[uuid.UUID],
) -> list[Citation]:
    rows = [
        Citation(
            message_id=message_id,
            search_result_id=sr_id,
            citation_number=i,
        )
        for i, sr_id in enumerate(search_result_ids, start=1)
    ]
    if not rows:
        return []
    db.add_all(rows)
    await db.flush()
    return rows
