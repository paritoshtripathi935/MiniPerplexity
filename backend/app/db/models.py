"""SQLAlchemy ORM models — mirror docs/database/schema.sql exactly.

Naming, columns, constraints, and indexes are kept aligned with the SQL DDL so
that a future Alembic autogenerate produces an empty diff.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Computed,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, TSVECTOR, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


# ---------- Enums (match the Postgres enum types in schema.sql) -------------
class MessageRole(str, enum.Enum):
    user = "user"
    assistant = "assistant"
    system = "system"


class SearchSource(str, enum.Enum):
    web = "web"
    youtube = "youtube"
    custom_url = "custom_url"


class RateLimitSubject(str, enum.Enum):
    ip = "ip"
    user = "user"


# ---------- Base ------------------------------------------------------------
class Base(DeclarativeBase):
    pass


# ---------- users -----------------------------------------------------------
class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    clerk_user_id: Mapped[Optional[str]] = mapped_column(Text, unique=True)
    # citext on the SQL side; SQLAlchemy treats it as plain Text — that's fine,
    # the uniqueness is enforced by the column type at the DB level.
    email: Mapped[Optional[str]] = mapped_column(Text, unique=True)
    display_name: Mapped[Optional[str]] = mapped_column(Text)
    image_url: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_seen_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))


# ---------- brand_profiles -------------------------------------------------
class BrandProfile(Base):
    """One row per user. Composed into the system prompt for every chat."""
    __tablename__ = "brand_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        primary_key=True,
    )
    company_name: Mapped[Optional[str]] = mapped_column(Text)
    website: Mapped[Optional[str]] = mapped_column(Text)
    icp_description: Mapped[Optional[str]] = mapped_column(Text)
    primary_channels: Mapped[list[str]] = mapped_column(
        ARRAY(Text), nullable=False, server_default=text("'{}'::text[]")
    )
    target_cac: Mapped[Optional[float]] = mapped_column(Numeric(12, 2))
    target_roas: Mapped[Optional[float]] = mapped_column(Numeric(8, 2))
    voice_guidelines: Mapped[Optional[str]] = mapped_column(Text)
    current_campaigns_summary: Mapped[Optional[str]] = mapped_column(Text)
    onboarding_completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


# ---------- sessions --------------------------------------------------------
class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    user_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="SET NULL"),
    )
    title: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    last_accessed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("(now() + INTERVAL '10 minutes')"),
    )
    is_archived: Mapped[bool] = mapped_column(
        Boolean, nullable=False, server_default=text("false")
    )
    metadata_: Mapped[dict] = mapped_column(
        "metadata", JSONB, nullable=False, server_default=text("'{}'::jsonb")
    )

    queries: Mapped[list["Query"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    messages: Mapped[list["Message"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index(
            "idx_sessions_user_last_accessed",
            "user_id",
            "last_accessed_at",
            postgresql_where=text("user_id IS NOT NULL"),
        ),
        Index(
            "idx_sessions_expires_at",
            "expires_at",
            postgresql_where=text("is_archived = false"),
        ),
    )


# ---------- queries ---------------------------------------------------------
class Query(Base):
    __tablename__ = "queries"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    query_text: Mapped[str] = mapped_column(Text, nullable=False)
    custom_url: Mapped[Optional[str]] = mapped_column(Text)
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    session: Mapped[Session] = relationship(back_populates="queries")
    search_results: Mapped[list["SearchResultRow"]] = relationship(
        back_populates="query", cascade="all, delete-orphan"
    )
    messages: Mapped[list["Message"]] = relationship(back_populates="query")

    __table_args__ = (
        UniqueConstraint("session_id", "position", name="queries_session_id_position_key"),
        CheckConstraint(
            "length(query_text) BETWEEN 1 AND 4000",
            name="queries_query_text_check",
        ),
        CheckConstraint(
            "custom_url IS NULL OR custom_url ~* '^https?://'",
            name="queries_custom_url_check",
        ),
        Index("idx_queries_session_created", "session_id", "created_at"),
    )


# ---------- messages --------------------------------------------------------
class Message(Base):
    __tablename__ = "messages"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    session_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sessions.id", ondelete="CASCADE"),
        nullable=False,
    )
    query_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("queries.id", ondelete="CASCADE")
    )
    role: Mapped[MessageRole] = mapped_column(
        SAEnum(MessageRole, name="message_role", create_type=False),
        nullable=False,
    )
    content: Mapped[str] = mapped_column(Text, nullable=False)
    model_name: Mapped[Optional[str]] = mapped_column(Text)
    tokens_input: Mapped[Optional[int]] = mapped_column(Integer)
    tokens_output: Mapped[Optional[int]] = mapped_column(Integer)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer)
    # Slug of the play that produced this turn (e.g. "weekly_review"), or
    # NULL for free-form chat. Stored as text — no FK to the in-process Plays
    # catalog so the catalog can evolve without DDL.
    play_id: Mapped[Optional[str]] = mapped_column(Text)
    # Cached LLM-generated follow-up suggestions, shape: {"items": [str, str, str]}.
    # Lazily populated by the next-steps endpoint on first request.
    next_steps: Mapped[Optional[dict]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    # Generated column — Postgres maintains this from `content`. We never write it.
    content_tsv: Mapped[Optional[str]] = mapped_column(
        TSVECTOR,
        Computed("to_tsvector('english', coalesce(content, ''))", persisted=True),
        nullable=True,
    )

    session: Mapped[Session] = relationship(back_populates="messages")
    query: Mapped[Optional[Query]] = relationship(back_populates="messages")
    citations: Mapped[list["Citation"]] = relationship(
        back_populates="message", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index("idx_messages_session_created", "session_id", "created_at"),
        Index(
            "idx_messages_query",
            "query_id",
            postgresql_where=text("query_id IS NOT NULL"),
        ),
        Index(
            "idx_messages_content_tsv",
            "content_tsv",
            postgresql_using="gin",
        ),
        Index(
            "idx_messages_play_id_created_at",
            "play_id",
            "created_at",
            postgresql_where=text("play_id IS NOT NULL"),
        ),
    )


# ---------- search_results --------------------------------------------------
class SearchResultRow(Base):
    """ORM model for the `search_results` table.

    Renamed in Python from `SearchResult` to avoid clashing with the existing
    Pydantic model in app.models.search_model.
    """
    __tablename__ = "search_results"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    query_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("queries.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    source: Mapped[SearchSource] = mapped_column(
        SAEnum(SearchSource, name="search_source", create_type=False),
        nullable=False,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    snippet: Mapped[Optional[str]] = mapped_column(Text)
    search_content: Mapped[Optional[str]] = mapped_column(Text)
    question: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    query: Mapped[Query] = relationship(back_populates="search_results")
    citations: Mapped[list["Citation"]] = relationship(
        back_populates="search_result", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("query_id", "url", name="search_results_query_id_url_key"),
        CheckConstraint("url ~* '^https?://'", name="search_results_url_check"),
        Index("idx_search_results_query_position", "query_id", "position"),
        Index("idx_search_results_url", "url"),
    )


# ---------- citations -------------------------------------------------------
class Citation(Base):
    __tablename__ = "citations"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, server_default=text("gen_random_uuid()")
    )
    message_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("messages.id", ondelete="CASCADE"),
        nullable=False,
    )
    search_result_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("search_results.id", ondelete="CASCADE"),
        nullable=False,
    )
    citation_number: Mapped[int] = mapped_column(Integer, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    message: Mapped[Message] = relationship(back_populates="citations")
    search_result: Mapped[SearchResultRow] = relationship(back_populates="citations")

    __table_args__ = (
        UniqueConstraint(
            "message_id", "citation_number", name="citations_message_id_citation_number_key"
        ),
        UniqueConstraint(
            "message_id", "search_result_id", name="citations_message_id_search_result_id_key"
        ),
        CheckConstraint("citation_number > 0", name="citations_citation_number_check"),
        Index("idx_citations_message", "message_id"),
    )


# ---------- rate_limits -----------------------------------------------------
class RateLimit(Base):
    __tablename__ = "rate_limits"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    identifier: Mapped[str] = mapped_column(Text, nullable=False)
    identifier_type: Mapped[RateLimitSubject] = mapped_column(
        SAEnum(RateLimitSubject, name="rate_limit_subject", create_type=False),
        nullable=False,
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    window_start: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    request_count: Mapped[int] = mapped_column(Integer, nullable=False, server_default=text("0"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )

    __table_args__ = (
        UniqueConstraint(
            "identifier",
            "identifier_type",
            "endpoint",
            "window_start",
            name="rate_limits_unique_bucket_key",
        ),
        Index(
            "idx_rate_limits_lookup",
            "identifier",
            "identifier_type",
            "endpoint",
            "window_start",
        ),
    )


# ---------- api_usage_logs --------------------------------------------------
class ApiUsageLog(Base):
    __tablename__ = "api_usage_logs"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    session_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("sessions.id", ondelete="SET NULL")
    )
    endpoint: Mapped[str] = mapped_column(Text, nullable=False)
    method: Mapped[str] = mapped_column(Text, nullable=False)
    status_code: Mapped[int] = mapped_column(SmallInteger, nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    error_message: Mapped[Optional[str]] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )


# ---------- content_cache ---------------------------------------------------
class ContentCache(Base):
    __tablename__ = "content_cache"

    url_hash: Mapped[bytes] = mapped_column(LargeBinary, primary_key=True)
    url: Mapped[str] = mapped_column(Text, nullable=False)
    title: Mapped[Optional[str]] = mapped_column(Text)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    fetched_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, server_default=func.now()
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=text("(now() + INTERVAL '24 hours')"),
    )
    etag: Mapped[Optional[str]] = mapped_column(Text)
    last_modified: Mapped[Optional[str]] = mapped_column(Text)
