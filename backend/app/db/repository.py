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
    AdAccountLink,
    BrandProfile,
    Campaign,
    CampaignCreative,
    Citation,
    Message,
    MessageRole,
    Project,
    ProviderConnection,
    Query,
    SearchResultRow,
    SearchSource,
    Session as DBSession,
)
from app.services.source_ranker import tag_authority_in_place


# TTL for *anonymous* sessions only. Owned (signed-in) sessions never
# expire automatically — chat history is part of the product, not a
# scratchpad. Override via SESSION_TTL_SECONDS for the anonymous path only.
SESSION_TTL = timedelta(seconds=int(os.getenv("SESSION_TTL_SECONDS", "600")))
# Effectively-never. We push owned sessions' expires_at to a date far in
# the future so any external `WHERE expires_at < now()` cleanup also
# leaves them alone.
NEVER_EXPIRES = timedelta(days=365 * 100)
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
async def update_user_preferred_model(
    db: AsyncSession, user_id: uuid.UUID, model_id: Optional[str]
) -> None:
    """Persist the user's chosen chat model. Pass None to clear the
    preference (falls back to the backend default on next /answer)."""
    from app.db.models import User
    await db.execute(
        User.__table__.update()
        .where(User.id == user_id)
        .values(preferred_chat_model=model_id, updated_at=_now())
    )


async def get_or_create_session(
    db: AsyncSession,
    session_id: str,
    *,
    user_id: uuid.UUID,
    campaign_id: Optional[uuid.UUID] = None,
) -> DBSession:
    """Upsert a session row, anchored to a (project, campaign).

    `user_id` is required — anonymous sessions were removed by migration 007
    when `sessions.project_id` / `sessions.campaign_id` became NOT NULL.

    If `campaign_id` is omitted, falls back to the user's default campaign
    (oldest live campaign of the oldest live project). The session's
    `project_id` is snapshotted from the chosen campaign so the system-prompt
    composition is a single PK lookup off the session row.

    On a touch (existing session), the campaign / project anchors are *not*
    re-snapshotted — they're fixed at create-time. Pass an existing session's
    id with a different campaign_id and the campaign_id is ignored.
    """
    sid = _to_uuid(session_id)
    now = _now()
    # Owned sessions never expire automatically; the long expires_at keeps any
    # `WHERE expires_at < now()` cleanup from touching them.
    expires = now + NEVER_EXPIRES

    # Fast path: session already exists → just touch it.
    existing = await db.get(DBSession, sid)
    if existing is not None:
        await db.execute(
            DBSession.__table__.update()
            .where(DBSession.id == sid)
            .values(
                last_accessed_at=now,
                expires_at=expires,
                # Claim a session that was somehow orphaned. Never re-owner.
                user_id=func.coalesce(DBSession.user_id, user_id),
            )
        )
        await db.refresh(existing)
        return existing

    # New session: resolve the campaign (explicit or default) and snapshot
    # its project_id.
    if campaign_id is None:
        campaign_id = await _get_default_campaign_id(db, user_id)
    project_id = (
        await db.execute(select(Campaign.project_id).where(Campaign.id == campaign_id))
    ).scalar_one_or_none()
    if project_id is None:
        raise ValueError(f"campaign {campaign_id} not found")

    stmt = (
        pg_insert(DBSession)
        .values(
            id=sid,
            user_id=user_id,
            project_id=project_id,
            campaign_id=campaign_id,
            last_accessed_at=now,
            expires_at=expires,
        )
        # Concurrent inserts for the same id collapse to a touch.
        .on_conflict_do_update(
            index_elements=[DBSession.id],
            set_={
                "last_accessed_at": now,
                "expires_at": expires,
                "user_id": func.coalesce(DBSession.user_id, user_id),
            },
        )
        .returning(DBSession)
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def _get_default_campaign_id(
    db: AsyncSession, user_id: uuid.UUID
) -> uuid.UUID:
    """Return the user's default campaign id (oldest live campaign of the
    oldest live project). Auto-provisions one if missing — keeps the API
    layer from having to special-case first-request edge conditions."""
    row = (
        await db.execute(
            select(Campaign.id)
            .join(Project, Project.id == Campaign.project_id)
            .where(
                Project.user_id == user_id,
                Project.archived_at.is_(None),
                Campaign.archived_at.is_(None),
            )
            .order_by(Project.created_at.asc(), Campaign.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if row is not None:
        return row
    _, campaign_id = await ensure_default_project_and_campaign(db, user_id)
    return campaign_id


async def touch_session(db: AsyncSession, session_id: str) -> None:
    """Bump last_accessed_at on a session.

    `expires_at` is also pushed forward to NEVER_EXPIRES — matches
    `get_or_create_session`'s intent. Previously this used the anonymous
    SESSION_TTL (10 min), which silently re-armed signed-in sessions for
    cleanup; combined with the periodic sweep, that hard-deleted (cascade)
    the entire conversation 10 min after each touch.
    """
    sid = _to_uuid(session_id)
    now = _now()
    await db.execute(
        DBSession.__table__.update()
        .where(DBSession.id == sid)
        .values(last_accessed_at=now, expires_at=now + NEVER_EXPIRES)
    )


async def delete_session(db: AsyncSession, session_id: str) -> bool:
    sid = _to_uuid(session_id)
    result = await db.execute(delete(DBSession).where(DBSession.id == sid))
    return (result.rowcount or 0) > 0


async def get_session_campaign(
    db: AsyncSession, session_id: str
) -> Optional[Campaign]:
    """Fetch the Campaign anchored to this session. Single PK join — the
    session row carries campaign_id snapshotted at create-time, and Campaign
    is keyed by id. Used to compose campaign context into the system prompt."""
    sid = _to_uuid(session_id)
    return (
        await db.execute(
            select(Campaign)
            .join(DBSession, DBSession.campaign_id == Campaign.id)
            .where(DBSession.id == sid)
        )
    ).scalar_one_or_none()


async def cleanup_expired_sessions(db: AsyncSession) -> int:
    """Sweep expired anonymous sessions.

    Effectively a no-op after migration 007: anonymous sessions no longer
    exist (every session must have NOT NULL campaign_id, and we only ever
    insert NEVER_EXPIRES for owned rows). Kept as a guarded background hook
    so the lifecycle worker has something idempotent to call.

    Owned sessions (`user_id IS NOT NULL`) are off-limits here regardless
    of `expires_at`. Chat history is product data, not scratchpad — any
    short-TTL stamping is a bug to fix at the source, not to silently
    cascade-delete via this sweep. A regression like the pre-fix
    `touch_session` (which stamped a 10-min expires_at and then let this
    sweep cascade-delete every message + query) must never recur.
    """
    now = _now()
    result = await db.execute(
        delete(DBSession).where(
            DBSession.expires_at < now,
            DBSession.is_archived.is_(False),
            DBSession.user_id.is_(None),
        )
    )
    return result.rowcount or 0


async def get_session_history(db: AsyncSession, session_id: str) -> Optional[dict]:
    """Return a JSON-friendly snapshot mirroring the original SessionData shape.

    For assistant messages, also returns the search_results that grounded the
    answer (joined via the message's query_id), with authority tags re-applied
    so the UI can show the same "authoritative" badge it does on the live flow.
    Without this, videos and source pills disappear when a user reopens a chat.
    Each assistant message also carries `id`, `play_id`, and any cached
    `next_steps` so the chat surface can rehydrate fully.
    """
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

    # Bulk-load every search_result for every query referenced by this session's
    # messages in one round-trip. Group by query_id for O(1) lookup below.
    query_ids = {m.query_id for m in msg_rows if m.query_id is not None}
    sr_by_query: dict[uuid.UUID, list[dict]] = {}
    if query_ids:
        sr_rows = (
            await db.execute(
                select(SearchResultRow)
                .where(SearchResultRow.query_id.in_(query_ids))
                .order_by(SearchResultRow.query_id, SearchResultRow.position.asc())
            )
        ).scalars().all()
        for r in sr_rows:
            sr_by_query.setdefault(r.query_id, []).append(
                {
                    "title": r.title,
                    "url": r.url,
                    "snippet": r.snippet,
                    "source": r.source.value,
                }
            )
    for results in sr_by_query.values():
        tag_authority_in_place(results)

    messages_out: list[dict] = []
    for m in msg_rows:
        item: dict = {
            "id": str(m.id),
            "role": m.role.value,
            "content": m.content,
        }
        if m.role == MessageRole.assistant:
            if m.play_id:
                item["play_id"] = m.play_id
            if m.next_steps:
                item["next_steps"] = m.next_steps
            if m.latency_ms is not None:
                item["latency_ms"] = m.latency_ms
            if m.query_id is not None:
                results = sr_by_query.get(m.query_id, [])
                if results:
                    item["search_results"] = results
        messages_out.append(item)

    return {
        "messages": messages_out,
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
async def list_recent_plays_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    limit: int = 20,
    *,
    campaign_id: Optional[uuid.UUID] = None,
) -> list[dict]:
    """Aggregate the assistant messages with non-null play_id for this user
    into a "recently used plays" feed: one row per play_id with the most
    recent run timestamp and a run count. When `campaign_id` is supplied,
    narrows to plays run within that campaign — matches the active-campaign
    scoping of the rest of the operator surfaces.
    """
    stmt = (
        select(
            Message.play_id,
            func.max(Message.created_at).label("last_run_at"),
            func.count().label("run_count"),
        )
        .join(DBSession, Message.session_id == DBSession.id)
        .where(
            Message.role == MessageRole.assistant,
            Message.play_id.is_not(None),
            DBSession.user_id == user_id,
        )
        .group_by(Message.play_id)
        .order_by(func.max(Message.created_at).desc())
        .limit(limit)
    )
    if campaign_id is not None:
        stmt = stmt.where(DBSession.campaign_id == campaign_id)
    rows = (await db.execute(stmt)).all()
    return [
        {
            "play_id": r.play_id,
            "last_run_at": r.last_run_at.isoformat(),
            "run_count": int(r.run_count),
        }
        for r in rows
    ]


async def get_message(db: AsyncSession, message_id: str) -> Optional[Message]:
    """Load a single message by id; returns None for invalid ids or unknown rows."""
    try:
        mid = _to_uuid(message_id)
    except ValueError:
        return None
    return await db.get(Message, mid)


async def set_message_next_steps(
    db: AsyncSession, message_id: uuid.UUID, items: list[str]
) -> None:
    """Persist generated follow-up suggestions on the assistant message."""
    await db.execute(
        Message.__table__.update()
        .where(Message.id == message_id)
        .values(next_steps={"items": items})
    )


async def get_query_text(db: AsyncSession, query_id: uuid.UUID) -> Optional[str]:
    """Fetch the user-facing text of a query row, or None if missing."""
    return (
        await db.execute(select(Query.query_text).where(Query.id == query_id))
    ).scalar_one_or_none()


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
    play_id: Optional[str] = None,
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
        play_id=play_id,
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


# ---------- Projects --------------------------------------------------------
DEFAULT_PROJECT_NAME = "My Brand"
DEFAULT_CAMPAIGN_NAME = "General"


async def ensure_default_project_and_campaign(
    db: AsyncSession, user_id: uuid.UUID
) -> tuple[uuid.UUID, uuid.UUID]:
    """Idempotent. Ensures the user owns at least one live project + one live
    campaign within it. Returns (project_id, campaign_id) of the defaults.

    Called once on first JIT-provisioning of a user (auth dependency) so by
    the time any product surface runs, the (project, campaign) pair the
    NOT NULL session FKs need is guaranteed to exist.
    """
    # Existing live project?
    project_id = (
        await db.execute(
            select(Project.id)
            .where(Project.user_id == user_id, Project.archived_at.is_(None))
            .order_by(Project.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if project_id is None:
        project = Project(user_id=user_id, name=DEFAULT_PROJECT_NAME)
        db.add(project)
        await db.flush()
        project_id = project.id

    # Existing live campaign in that project?
    campaign_id = (
        await db.execute(
            select(Campaign.id)
            .where(Campaign.project_id == project_id, Campaign.archived_at.is_(None))
            .order_by(Campaign.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if campaign_id is None:
        campaign = Campaign(project_id=project_id, name=DEFAULT_CAMPAIGN_NAME)
        db.add(campaign)
        await db.flush()
        campaign_id = campaign.id

    return project_id, campaign_id


async def get_default_project_id(
    db: AsyncSession, user_id: uuid.UUID
) -> uuid.UUID:
    """User's default (oldest live) project, auto-provisioning if missing."""
    project_id = (
        await db.execute(
            select(Project.id)
            .where(Project.user_id == user_id, Project.archived_at.is_(None))
            .order_by(Project.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if project_id is not None:
        return project_id
    project_id, _ = await ensure_default_project_and_campaign(db, user_id)
    return project_id


async def list_projects_for_user(
    db: AsyncSession, user_id: uuid.UUID, *, include_archived: bool = False
) -> list[Project]:
    stmt = select(Project).where(Project.user_id == user_id)
    if not include_archived:
        stmt = stmt.where(Project.archived_at.is_(None))
    stmt = stmt.order_by(Project.created_at.asc())
    return list((await db.execute(stmt)).scalars().all())


async def list_projects_with_counts(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    include_archived: bool = False,
) -> list[dict]:
    """Project list enriched with live-campaign count + live-session count.

    Used by the Settings projects page so the operational-metrics columns
    (AMPS / INVS in the Stitch design) render with real data without an
    N+1 fan-out from the client. Both subqueries scope to live (non-
    archived) rows; sessions only count owned, non-archived sessions.
    """
    campaign_count = (
        select(Campaign.project_id, func.count().label("n"))
        .where(Campaign.archived_at.is_(None))
        .group_by(Campaign.project_id)
        .subquery()
    )
    session_count = (
        select(DBSession.project_id, func.count().label("n"))
        .where(DBSession.is_archived.is_(False))
        .group_by(DBSession.project_id)
        .subquery()
    )
    last_session_at = (
        select(DBSession.project_id, func.max(DBSession.last_accessed_at).label("ts"))
        .group_by(DBSession.project_id)
        .subquery()
    )

    stmt = (
        select(
            Project,
            func.coalesce(campaign_count.c.n, 0).label("campaign_count"),
            func.coalesce(session_count.c.n, 0).label("session_count"),
            last_session_at.c.ts.label("last_session_at"),
        )
        .outerjoin(campaign_count, campaign_count.c.project_id == Project.id)
        .outerjoin(session_count, session_count.c.project_id == Project.id)
        .outerjoin(last_session_at, last_session_at.c.project_id == Project.id)
        .where(Project.user_id == user_id)
    )
    if not include_archived:
        stmt = stmt.where(Project.archived_at.is_(None))
    stmt = stmt.order_by(Project.created_at.asc())

    rows = (await db.execute(stmt)).all()
    return [
        {
            "project": row.Project,
            "campaign_count": int(row.campaign_count),
            "session_count": int(row.session_count),
            "last_session_at": row.last_session_at.isoformat() if row.last_session_at else None,
        }
        for row in rows
    ]


async def get_project_for_user(
    db: AsyncSession, project_id: uuid.UUID, user_id: uuid.UUID
) -> Optional[Project]:
    """Owner-scoped fetch; returns None if the project isn't owned by user_id."""
    return (
        await db.execute(
            select(Project).where(Project.id == project_id, Project.user_id == user_id)
        )
    ).scalar_one_or_none()


# ---------- Campaigns ------------------------------------------------------
async def list_campaigns_for_project(
    db: AsyncSession, project_id: uuid.UUID, *, include_archived: bool = False
) -> list[Campaign]:
    stmt = select(Campaign).where(Campaign.project_id == project_id)
    if not include_archived:
        stmt = stmt.where(Campaign.archived_at.is_(None))
    stmt = stmt.order_by(Campaign.created_at.asc())
    return list((await db.execute(stmt)).scalars().all())


async def get_campaign_for_user(
    db: AsyncSession, campaign_id: uuid.UUID, user_id: uuid.UUID
) -> Optional[Campaign]:
    """Owner-scoped fetch; verifies the campaign's project belongs to the user."""
    return (
        await db.execute(
            select(Campaign)
            .join(Project, Project.id == Campaign.project_id)
            .where(Campaign.id == campaign_id, Project.user_id == user_id)
        )
    ).scalar_one_or_none()


# ---------- Mutations: projects + campaigns --------------------------------
class ConflictError(Exception):
    """Name collides with an existing live project / campaign."""


class InvariantError(Exception):
    """App-layer invariant violated (e.g. would leave user with zero live
    projects, or project with zero live campaigns). Caller turns into 409."""


def _is_unique_violation(exc: BaseException) -> bool:
    """Detect Postgres unique-constraint failures inside async wrappers.

    SQLAlchemy wraps the asyncpg error; we look for the SQLSTATE on the
    innermost cause. Used by the project / campaign mutators so the API
    can map cleanly to 409 Conflict.
    """
    inner = getattr(exc, "orig", exc)
    pgcode = getattr(inner, "sqlstate", None) or getattr(inner, "pgcode", None)
    return pgcode == "23505"  # unique_violation


async def create_project(
    db: AsyncSession, user_id: uuid.UUID, name: str
) -> Project:
    """Insert a new project for this user. Raises ConflictError on duplicate
    case-insensitive name among the user's live projects."""
    project = Project(user_id=user_id, name=name.strip())
    db.add(project)
    try:
        await db.flush()
    except Exception as exc:
        if _is_unique_violation(exc):
            await db.rollback()
            raise ConflictError(f"project name '{name}' already in use") from exc
        raise
    return project


async def rename_project(
    db: AsyncSession, project_id: uuid.UUID, name: str
) -> Project:
    project = await db.get(Project, project_id)
    if project is None:
        raise LookupError("project not found")
    project.name = name.strip()
    project.updated_at = _now()
    try:
        await db.flush()
    except Exception as exc:
        if _is_unique_violation(exc):
            await db.rollback()
            raise ConflictError(f"project name '{name}' already in use") from exc
        raise
    return project


async def _count_live_projects(db: AsyncSession, user_id: uuid.UUID) -> int:
    return int(
        (
            await db.execute(
                select(func.count(Project.id)).where(
                    Project.user_id == user_id,
                    Project.archived_at.is_(None),
                )
            )
        ).scalar_one()
    )


async def archive_project(
    db: AsyncSession, project: Project
) -> Project:
    """Soft-archive a project. Refuses if it would leave the owner with zero
    live projects (keeps the active-campaign localStorage pointer valid)."""
    if project.archived_at is not None:
        return project
    live = await _count_live_projects(db, project.user_id)
    if live <= 1:
        raise InvariantError("can't archive your only live project")
    project.archived_at = _now()
    project.updated_at = _now()
    await db.flush()
    return project


async def unarchive_project(db: AsyncSession, project: Project) -> Project:
    if project.archived_at is None:
        return project
    project.archived_at = None
    project.updated_at = _now()
    try:
        await db.flush()
    except Exception as exc:
        if _is_unique_violation(exc):
            await db.rollback()
            raise ConflictError(
                f"project name '{project.name}' already taken by a live project"
            ) from exc
        raise
    return project


async def create_campaign(
    db: AsyncSession,
    project_id: uuid.UUID,
    name: str,
    *,
    objective: Optional[str] = None,
    starts_on=None,
    ends_on=None,
) -> Campaign:
    campaign = Campaign(
        project_id=project_id,
        name=name.strip(),
        objective=objective,
        starts_on=starts_on,
        ends_on=ends_on,
    )
    db.add(campaign)
    try:
        await db.flush()
    except Exception as exc:
        if _is_unique_violation(exc):
            await db.rollback()
            raise ConflictError(f"campaign name '{name}' already in use") from exc
        raise
    return campaign


async def update_campaign(
    db: AsyncSession,
    campaign: Campaign,
    *,
    name: Optional[str] = None,
    objective: Optional[str] = None,
    starts_on=None,
    ends_on=None,
    clear_starts_on: bool = False,
    clear_ends_on: bool = False,
) -> Campaign:
    """Field-by-field update. `objective` / `starts_on` / `ends_on` use
    `None` to mean "leave alone"; pass `clear_*=True` to explicitly null
    a date (PATCH-with-null semantics)."""
    if name is not None:
        campaign.name = name.strip()
    if objective is not None:
        campaign.objective = objective
    if starts_on is not None:
        campaign.starts_on = starts_on
    elif clear_starts_on:
        campaign.starts_on = None
    if ends_on is not None:
        campaign.ends_on = ends_on
    elif clear_ends_on:
        campaign.ends_on = None
    campaign.updated_at = _now()
    try:
        await db.flush()
    except Exception as exc:
        if _is_unique_violation(exc):
            await db.rollback()
            raise ConflictError(f"campaign name '{name}' already in use") from exc
        raise
    return campaign


async def _count_live_campaigns(db: AsyncSession, project_id: uuid.UUID) -> int:
    return int(
        (
            await db.execute(
                select(func.count(Campaign.id)).where(
                    Campaign.project_id == project_id,
                    Campaign.archived_at.is_(None),
                )
            )
        ).scalar_one()
    )


async def archive_campaign(db: AsyncSession, campaign: Campaign) -> Campaign:
    """Soft-archive a campaign. Refuses if it would leave the project with
    zero live campaigns (every project must have at least one for new
    sessions to anchor to)."""
    if campaign.archived_at is not None:
        return campaign
    live = await _count_live_campaigns(db, campaign.project_id)
    if live <= 1:
        raise InvariantError("can't archive the only live campaign in this project")
    campaign.archived_at = _now()
    campaign.updated_at = _now()
    await db.flush()
    return campaign


async def unarchive_campaign(db: AsyncSession, campaign: Campaign) -> Campaign:
    if campaign.archived_at is None:
        return campaign
    campaign.archived_at = None
    campaign.updated_at = _now()
    try:
        await db.flush()
    except Exception as exc:
        if _is_unique_violation(exc):
            await db.rollback()
            raise ConflictError(
                f"campaign name '{campaign.name}' already taken by a live campaign"
            ) from exc
        raise
    return campaign


# ---------- Brand profile (project-keyed after migration 007) --------------
async def get_brand_profile(
    db: AsyncSession, project_id: uuid.UUID
) -> Optional[BrandProfile]:
    """Brand profile for one project (the unit of grounding for system prompt)."""
    return await db.get(BrandProfile, project_id)


async def get_brand_profile_for_user(
    db: AsyncSession, user_id: uuid.UUID
) -> Optional[BrandProfile]:
    """Convenience: brand profile of the user's default project.

    Drops to None only if the user somehow has no project at all — callers
    that hit this from a normal authed path can rely on ensure-default
    having run during auth-upsert.
    """
    project_id = (
        await db.execute(
            select(Project.id)
            .where(Project.user_id == user_id, Project.archived_at.is_(None))
            .order_by(Project.created_at.asc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if project_id is None:
        return None
    return await db.get(BrandProfile, project_id)


async def upsert_brand_profile(
    db: AsyncSession,
    project_id: uuid.UUID,
    *,
    company_name: Optional[str] = None,
    website: Optional[str] = None,
    icp_description: Optional[str] = None,
    primary_channels: Optional[list[str]] = None,
    target_cac: Optional[float] = None,
    target_roas: Optional[float] = None,
    voice_guidelines: Optional[str] = None,
    current_campaigns_summary: Optional[str] = None,
    mark_completed: bool = False,
) -> BrandProfile:
    """Insert-or-update the project's brand profile.

    Only fields explicitly passed (non-None) are written, so the wizard can
    submit partial updates without clobbering previously-saved fields.
    `primary_channels` is treated specially: an empty list is a deliberate
    clear; None means "leave alone".
    """
    values: dict = {"project_id": project_id}
    update_set: dict = {}

    field_map = {
        "company_name": company_name,
        "website": website,
        "icp_description": icp_description,
        "target_cac": target_cac,
        "target_roas": target_roas,
        "voice_guidelines": voice_guidelines,
        "current_campaigns_summary": current_campaigns_summary,
    }
    for k, v in field_map.items():
        if v is not None:
            values[k] = v
            update_set[k] = v

    if primary_channels is not None:
        values["primary_channels"] = primary_channels
        update_set["primary_channels"] = primary_channels

    if mark_completed:
        now = _now()
        values["onboarding_completed_at"] = now
        update_set["onboarding_completed_at"] = now

    update_set["updated_at"] = _now()

    stmt = (
        pg_insert(BrandProfile)
        .values(**values)
        .on_conflict_do_update(
            index_elements=[BrandProfile.project_id],
            set_=update_set,
        )
        .returning(BrandProfile.project_id)
    )
    await db.execute(stmt)
    await db.flush()
    profile = await db.get(BrandProfile, project_id)
    assert profile is not None  # just upserted
    return profile


# ---------- Session listing / management -----------------------------------
async def list_sessions_for_user(
    db: AsyncSession,
    user_id: uuid.UUID,
    *,
    include_archived: bool = False,
    limit: int = 50,
    offset: int = 0,
    campaign_id: Optional[uuid.UUID] = None,
    project_id: Optional[uuid.UUID] = None,
) -> list[dict]:
    """Sidebar feed: user's sessions with title, message count, last activity,
    and a short excerpt of the most recent message (for richer recent-chats UI).

    `campaign_id` (set by the frontend's active-campaign store) narrows to
    the campaign's investigations only — single covering-index hit on
    idx_sessions_campaign_last_accessed. `project_id` is the broader fallback
    when callers want all of a project's work across campaigns.
    """
    msg_count = (
        select(Message.session_id, func.count().label("n"))
        .group_by(Message.session_id)
        .subquery()
    )
    # Correlated scalar subquery: most recent message content per session.
    latest_content = (
        select(Message.content)
        .where(Message.session_id == DBSession.id)
        .order_by(Message.created_at.desc())
        .limit(1)
        .correlate(DBSession)
        .scalar_subquery()
    )
    stmt = (
        select(
            DBSession.id,
            DBSession.title,
            DBSession.created_at,
            DBSession.last_accessed_at,
            DBSession.is_archived,
            DBSession.campaign_id,
            DBSession.project_id,
            func.coalesce(msg_count.c.n, 0).label("message_count"),
            latest_content.label("last_message_content"),
        )
        .outerjoin(msg_count, msg_count.c.session_id == DBSession.id)
        .where(DBSession.user_id == user_id)
        .order_by(DBSession.last_accessed_at.desc())
        .limit(limit)
        .offset(offset)
    )
    if campaign_id is not None:
        stmt = stmt.where(DBSession.campaign_id == campaign_id)
    elif project_id is not None:
        stmt = stmt.where(DBSession.project_id == project_id)
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
            "last_message_excerpt": _excerpt(r.last_message_content),
            "campaign_id": str(r.campaign_id) if r.campaign_id else None,
            "project_id": str(r.project_id) if r.project_id else None,
        }
        for r in rows
    ]


def _excerpt(content: Optional[str], max_len: int = 140) -> Optional[str]:
    """Trim a message body for list-view previews: collapse whitespace, strip
    markdown noise, cap at `max_len` chars with an ellipsis."""
    if not content:
        return None
    # Drop leading markdown headings / bullets so the preview reads as prose.
    text = content.strip()
    for prefix in ("## ", "# ", "### ", "- ", "* ", "> "):
        if text.startswith(prefix):
            text = text[len(prefix):]
            break
    text = " ".join(text.split())
    if len(text) <= max_len:
        return text
    return text[: max_len - 1].rstrip() + "…"


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


# ---------- Integrations: Meta / Google Ads ---------------------------------

async def upsert_provider_connection(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    provider: str,
    external_user_id: str,
    access_token_ciphertext: bytes,
    token_expires_at: datetime,
    scopes: list[str],
) -> ProviderConnection:
    """Insert or update the (user, provider) connection row in place.

    Re-OAuthing overwrites the token + expiry + scopes but keeps the row
    id stable, so any ad_account_links FKs to this connection survive
    the reconnect (the user doesn't have to re-link their accounts).
    """
    stmt = (
        pg_insert(ProviderConnection)
        .values(
            user_id=user_id,
            provider=provider,
            external_user_id=external_user_id,
            access_token_ciphertext=access_token_ciphertext,
            token_expires_at=token_expires_at,
            scopes=scopes,
        )
        .on_conflict_do_update(
            index_elements=[ProviderConnection.user_id, ProviderConnection.provider],
            set_={
                "external_user_id": external_user_id,
                "access_token_ciphertext": access_token_ciphertext,
                "token_expires_at": token_expires_at,
                "scopes": scopes,
                "last_refreshed_at": _now(),
            },
        )
        .returning(ProviderConnection)
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def get_provider_connection(
    db: AsyncSession, *, user_id: uuid.UUID, provider: str
) -> Optional[ProviderConnection]:
    row = (
        await db.execute(
            select(ProviderConnection).where(
                ProviderConnection.user_id == user_id,
                ProviderConnection.provider == provider,
            )
        )
    ).scalar_one_or_none()
    return row


async def delete_provider_connection(
    db: AsyncSession, *, user_id: uuid.UUID, provider: str
) -> bool:
    """Drop the connection. Cascades through ad_account_links."""
    result = await db.execute(
        ProviderConnection.__table__.delete().where(
            ProviderConnection.user_id == user_id,
            ProviderConnection.provider == provider,
        )
    )
    return (result.rowcount or 0) > 0


async def upsert_ad_account_link(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    provider_connection_id: uuid.UUID,
    external_account_id: str,
    account_name: str,
    account_currency: str,
    account_timezone: str,
) -> AdAccountLink:
    """Link an ad account to a project, or refresh the metadata in place
    if it's already linked. Idempotent — re-linking the same account is
    a no-op on the row id and resets sync_status to 'pending' so the
    next sync run picks it up."""
    stmt = (
        pg_insert(AdAccountLink)
        .values(
            project_id=project_id,
            provider_connection_id=provider_connection_id,
            external_account_id=external_account_id,
            account_name=account_name,
            account_currency=account_currency,
            account_timezone=account_timezone,
            sync_status="pending",
        )
        .on_conflict_do_update(
            index_elements=[
                AdAccountLink.project_id,
                AdAccountLink.external_account_id,
            ],
            set_={
                "provider_connection_id": provider_connection_id,
                "account_name": account_name,
                "account_currency": account_currency,
                "account_timezone": account_timezone,
                "sync_status": "pending",
                "sync_error": None,
            },
        )
        .returning(AdAccountLink)
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def list_ad_account_links_for_project(
    db: AsyncSession, project_id: uuid.UUID
) -> list[AdAccountLink]:
    rows = await db.execute(
        select(AdAccountLink)
        .where(AdAccountLink.project_id == project_id)
        .order_by(AdAccountLink.linked_at.desc())
    )
    return list(rows.scalars())


async def delete_ad_account_link(
    db: AsyncSession,
    *,
    project_id: uuid.UUID,
    link_id: uuid.UUID,
) -> bool:
    """Project-scoped delete — we re-check project_id to make sure the
    caller owns the link they're trying to drop."""
    result = await db.execute(
        AdAccountLink.__table__.delete().where(
            AdAccountLink.id == link_id,
            AdAccountLink.project_id == project_id,
        )
    )
    return (result.rowcount or 0) > 0


# ---------- Campaign creatives ----------------------------------------------

async def insert_campaign_creative(
    db: AsyncSession,
    *,
    campaign_id: uuid.UUID,
    uploaded_by: Optional[uuid.UUID],
    storage_key: str,
    filename: str,
    mime_type: str,
    size_bytes: int,
    provider: str,
) -> CampaignCreative:
    """Persist a creative's metadata after the browser-side upload
    completes. ON CONFLICT on (campaign_id, storage_key) keeps confirm-
    upload idempotent if the client retries."""
    stmt = (
        pg_insert(CampaignCreative)
        .values(
            campaign_id=campaign_id,
            uploaded_by=uploaded_by,
            storage_key=storage_key,
            filename=filename,
            mime_type=mime_type,
            size_bytes=size_bytes,
            provider=provider,
        )
        .on_conflict_do_update(
            index_elements=[
                CampaignCreative.campaign_id,
                CampaignCreative.storage_key,
            ],
            set_={
                # Re-confirm path: refresh display metadata if the
                # client re-uploaded under the same key.
                "filename": filename,
                "mime_type": mime_type,
                "size_bytes": size_bytes,
                "uploaded_by": uploaded_by,
                "archived_at": None,
            },
        )
        .returning(CampaignCreative)
    )
    result = await db.execute(stmt)
    return result.scalar_one()


async def list_campaign_creatives(
    db: AsyncSession, campaign_id: uuid.UUID
) -> list[CampaignCreative]:
    """Live (non-archived) creatives for a campaign, newest first."""
    rows = await db.execute(
        select(CampaignCreative)
        .where(
            CampaignCreative.campaign_id == campaign_id,
            CampaignCreative.archived_at.is_(None),
        )
        .order_by(CampaignCreative.uploaded_at.desc())
    )
    return list(rows.scalars())


async def get_campaign_creative(
    db: AsyncSession, *, campaign_id: uuid.UUID, creative_id: uuid.UUID
) -> Optional[CampaignCreative]:
    """Campaign-scoped fetch — re-checks campaign_id so a creative id
    from a different campaign 404s rather than leaking."""
    return (
        await db.execute(
            select(CampaignCreative).where(
                CampaignCreative.id == creative_id,
                CampaignCreative.campaign_id == campaign_id,
            )
        )
    ).scalar_one_or_none()


async def delete_campaign_creative(
    db: AsyncSession, *, campaign_id: uuid.UUID, creative_id: uuid.UUID
) -> Optional[CampaignCreative]:
    """Hard-delete the row. Returns the deleted row so the caller can
    issue the matching storage delete (key + provider). Campaign-scoped
    to prevent cross-campaign deletes via id-guessing."""
    row = await get_campaign_creative(
        db, campaign_id=campaign_id, creative_id=creative_id
    )
    if row is None:
        return None
    await db.execute(
        CampaignCreative.__table__.delete().where(
            CampaignCreative.id == creative_id,
            CampaignCreative.campaign_id == campaign_id,
        )
    )
    return row
