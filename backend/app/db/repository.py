"""Repository functions — thin wrappers around SQLAlchemy queries.

Kept as plain async functions (not classes) because they're straightforward,
each one is self-contained, and FastAPI's DI passes the session in cleanly.
"""
from __future__ import annotations

import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Iterable, Optional

from sqlalchemy import delete, func, select, text
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
_TITLE_MAX_LEN = 80


def _make_title(query_text: str) -> str:
    """Derive a short, user-readable session title from the first query."""
    title = " ".join(query_text.split())
    if len(title) > _TITLE_MAX_LEN:
        title = title[: _TITLE_MAX_LEN - 1].rstrip() + "…"
    return title


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

    # First query in this session → use it to title the session.
    if next_pos == 0:
        await db.execute(
            DBSession.__table__.update()
            .where(DBSession.id == sid, DBSession.title.is_(None))
            .values(title=_make_title(query_text))
        )

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


# ---------- Session listing / management -----------------------------------
async def list_sessions_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    include_archived: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> list[dict]:
    """Sidebar feed: user's sessions with title, message count, and last activity."""
    msg_count = (
        select(Message.session_id, func.count().label("n"))
        .group_by(Message.session_id)
        .subquery()
    )
    stmt = (
        select(
            DBSession.id,
            DBSession.title,
            DBSession.created_at,
            DBSession.last_accessed_at,
            DBSession.is_archived,
            func.coalesce(msg_count.c.n, 0).label("message_count"),
        )
        .outerjoin(msg_count, msg_count.c.session_id == DBSession.id)
        .where(DBSession.user_id == user_id)
        .order_by(DBSession.last_accessed_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if not include_archived:
        stmt = stmt.where(DBSession.is_archived.is_(False))

    rows = (await db.execute(stmt)).all()
    return [
        {
            "id": str(r.id),
            "title": r.title,
            "created_at": r.created_at.isoformat(),
            "last_accessed_at": r.last_accessed_at.isoformat(),
            "is_archived": r.is_archived,
            "message_count": int(r.message_count),
        }
        for r in rows
    ]


async def update_session(
    db: AsyncSession,
    session_id: str,
    *,
    user_id: Optional[uuid.UUID] = None,
    title: Optional[str] = None,
    is_archived: Optional[bool] = None,
) -> Optional[DBSession]:
    """Rename or archive a session.

    If `user_id` is supplied, only updates rows owned by that user — silently
    no-ops on someone else's session (caller turns this into 404).
    """
    sid = _to_uuid(session_id)
    values: dict = {}
    if title is not None:
        values["title"] = _make_title(title) if title else None
    if is_archived is not None:
        values["is_archived"] = is_archived
    if not values:
        return await db.get(DBSession, sid)

    stmt = DBSession.__table__.update().where(DBSession.id == sid)
    if user_id is not None:
        stmt = stmt.where(DBSession.user_id == user_id)
    stmt = stmt.values(**values).returning(DBSession.__table__.c.id)

    updated_id = (await db.execute(stmt)).scalar_one_or_none()
    if updated_id is None:
        return None
    return await db.get(DBSession, updated_id)


async def export_session_markdown(db: AsyncSession, session_id: str) -> Optional[str]:
    """Render a session's chat transcript as Markdown."""
    sid = _to_uuid(session_id)
    sess = await db.get(DBSession, sid)
    if sess is None:
        return None

    msg_rows = (
        await db.execute(
            select(Message.role, Message.content, Message.created_at, Message.model_name)
            .where(Message.session_id == sid)
            .order_by(Message.created_at.asc())
        )
    ).all()

    lines: list[str] = []
    title = sess.title or "Untitled session"
    lines.append(f"# {title}")
    lines.append("")
    lines.append(f"_Session `{sid}` · created {sess.created_at.isoformat()} · {len(msg_rows)} messages_")
    lines.append("")

    for role, content, created_at, model in msg_rows:
        if role == MessageRole.user:
            heading = f"## You · {created_at.isoformat()}"
        elif role == MessageRole.assistant:
            model_suffix = f" ({model})" if model else ""
            heading = f"## Assistant{model_suffix} · {created_at.isoformat()}"
        else:
            heading = f"## {role.value.title()} · {created_at.isoformat()}"
        lines.append(heading)
        lines.append("")
        lines.append(content)
        lines.append("")

    return "\n".join(lines).rstrip() + "\n"


# ---------- Full-text search -----------------------------------------------
async def search_user_messages(
    db: AsyncSession,
    user_id: uuid.UUID,
    query: str,
    *,
    limit: int = 20,
) -> list[dict]:
    """Search across the authenticated user's chat history using Postgres FTS.

    Returns one row per matching session, with a `ts_headline`-rendered snippet
    of the strongest-matching message. `websearch_to_tsquery` accepts natural
    syntax (`"exact phrase"`, `OR`, `-not`).
    """
    if not query.strip():
        return []

    sql = text(
        """
        WITH ranked AS (
            SELECT
                m.id           AS message_id,
                m.session_id   AS session_id,
                m.role         AS role,
                m.content      AS content,
                m.created_at   AS created_at,
                ts_rank_cd(m.content_tsv, websearch_to_tsquery('english', :q)) AS rank
            FROM messages m
            JOIN sessions s ON s.id = m.session_id
            WHERE s.user_id = :user_id
              AND m.content_tsv @@ websearch_to_tsquery('english', :q)
        ),
        top_per_session AS (
            SELECT DISTINCT ON (session_id)
                session_id, message_id, role, content, created_at, rank
            FROM ranked
            ORDER BY session_id, rank DESC, created_at DESC
        )
        SELECT
            t.session_id,
            t.message_id,
            t.role,
            t.created_at,
            t.rank,
            s.title,
            s.last_accessed_at,
            ts_headline(
                'english',
                t.content,
                websearch_to_tsquery('english', :q),
                'StartSel=<mark>,StopSel=</mark>,MaxWords=24,MinWords=10,ShortWord=3,MaxFragments=2'
            ) AS snippet
        FROM top_per_session t
        JOIN sessions s ON s.id = t.session_id
        ORDER BY t.rank DESC, s.last_accessed_at DESC
        LIMIT :lim
        """
    )

    rows = (
        await db.execute(sql, {"q": query, "user_id": user_id, "lim": limit})
    ).all()
    return [
        {
            "session_id": str(r.session_id),
            "message_id": str(r.message_id),
            "role": r.role,
            "title": r.title,
            "snippet": r.snippet,
            "rank": float(r.rank),
            "matched_at": r.created_at.isoformat(),
            "last_accessed_at": r.last_accessed_at.isoformat(),
        }
        for r in rows
    ]


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
