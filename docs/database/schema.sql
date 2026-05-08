-- =============================================================================
-- MiniPerplexity — Neon Postgres schema
-- See docs/database/schema.md for design rationale.
-- Idempotent: safe to run on a fresh Neon database.
-- =============================================================================

-- ---------- Extensions -------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram fuzzy match on titles

-- ---------- Enums ------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE search_source AS ENUM ('web', 'youtube', 'custom_url');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE rate_limit_subject AS ENUM ('ip', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Shared updated_at trigger ----------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- users
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    clerk_user_id   text        UNIQUE,                 -- Clerk's `user_xxx` (sub claim).
    email           citext      UNIQUE,                 -- Nullable: Clerk JWTs don't always carry email.
    display_name    text,
    image_url       text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    updated_at      timestamptz NOT NULL DEFAULT now(),
    last_seen_at    timestamptz
);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- sessions  (replaces in-memory chat_sessions dict)
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id                uuid        PRIMARY KEY,
    user_id           uuid        REFERENCES users(id) ON DELETE SET NULL,
    title             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    last_accessed_at  timestamptz NOT NULL DEFAULT now(),
    expires_at        timestamptz NOT NULL DEFAULT (now() + INTERVAL '10 minutes'),
    is_archived       boolean     NOT NULL DEFAULT false,
    metadata          jsonb       NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_last_accessed
    ON sessions (user_id, last_accessed_at DESC)
    WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions (expires_at)
    WHERE is_archived = false;

CREATE INDEX IF NOT EXISTS idx_sessions_title_trgm
    ON sessions USING GIN (title gin_trgm_ops)
    WHERE title IS NOT NULL;

-- =============================================================================
-- queries
-- =============================================================================
CREATE TABLE IF NOT EXISTS queries (
    id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id  uuid        NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    query_text  text        NOT NULL CHECK (length(query_text) BETWEEN 1 AND 4000),
    custom_url  text        CHECK (custom_url IS NULL OR custom_url ~* '^https?://'),
    position    integer     NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now(),
    UNIQUE (session_id, position)
);

CREATE INDEX IF NOT EXISTS idx_queries_session_created
    ON queries (session_id, created_at);

-- =============================================================================
-- messages  (chat transcript)
-- =============================================================================
CREATE TABLE IF NOT EXISTS messages (
    id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id    uuid          NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    query_id      uuid          REFERENCES queries(id) ON DELETE CASCADE,
    role          message_role  NOT NULL,
    content       text          NOT NULL,
    model_name    text,
    tokens_input  integer,
    tokens_output integer,
    latency_ms    integer,
    created_at    timestamptz   NOT NULL DEFAULT now(),
    content_tsv   tsvector      GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created
    ON messages (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_messages_query
    ON messages (query_id)
    WHERE query_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_content_tsv
    ON messages USING GIN (content_tsv);

-- =============================================================================
-- search_results
-- =============================================================================
CREATE TABLE IF NOT EXISTS search_results (
    id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
    query_id        uuid          NOT NULL REFERENCES queries(id) ON DELETE CASCADE,
    position        integer       NOT NULL,
    source          search_source NOT NULL,
    title           text          NOT NULL,
    url             text          NOT NULL CHECK (url ~* '^https?://'),
    snippet         text,
    search_content  text,
    question        text,
    created_at      timestamptz   NOT NULL DEFAULT now(),
    UNIQUE (query_id, url)
);

CREATE INDEX IF NOT EXISTS idx_search_results_query_position
    ON search_results (query_id, position);

CREATE INDEX IF NOT EXISTS idx_search_results_url
    ON search_results (url);

-- =============================================================================
-- citations
-- =============================================================================
CREATE TABLE IF NOT EXISTS citations (
    id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id        uuid        NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    search_result_id  uuid        NOT NULL REFERENCES search_results(id) ON DELETE CASCADE,
    citation_number   integer     NOT NULL CHECK (citation_number > 0),
    created_at        timestamptz NOT NULL DEFAULT now(),
    UNIQUE (message_id, citation_number),
    UNIQUE (message_id, search_result_id)
);

CREATE INDEX IF NOT EXISTS idx_citations_message
    ON citations (message_id);

-- =============================================================================
-- rate_limits  (durable replacement for in-process limiter)
-- =============================================================================
CREATE TABLE IF NOT EXISTS rate_limits (
    id               bigserial          PRIMARY KEY,
    identifier       text               NOT NULL,
    identifier_type  rate_limit_subject NOT NULL,
    endpoint         text               NOT NULL,
    window_start     timestamptz        NOT NULL,
    request_count    integer            NOT NULL DEFAULT 0,
    updated_at       timestamptz        NOT NULL DEFAULT now(),
    UNIQUE (identifier, identifier_type, endpoint, window_start)
);

CREATE INDEX IF NOT EXISTS idx_rate_limits_lookup
    ON rate_limits (identifier, identifier_type, endpoint, window_start DESC);

DROP TRIGGER IF EXISTS trg_rate_limits_updated_at ON rate_limits;
CREATE TRIGGER trg_rate_limits_updated_at
    BEFORE UPDATE ON rate_limits
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- =============================================================================
-- api_usage_logs
-- =============================================================================
CREATE TABLE IF NOT EXISTS api_usage_logs (
    id             bigserial   PRIMARY KEY,
    session_id     uuid        REFERENCES sessions(id) ON DELETE SET NULL,
    endpoint       text        NOT NULL,
    method         text        NOT NULL,
    status_code    smallint    NOT NULL,
    latency_ms     integer     NOT NULL,
    error_message  text,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_created
    ON api_usage_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_api_usage_logs_errors
    ON api_usage_logs (created_at DESC)
    WHERE status_code >= 400;

-- =============================================================================
-- content_cache  (custom URL fetches)
-- =============================================================================
CREATE TABLE IF NOT EXISTS content_cache (
    url_hash       bytea       PRIMARY KEY,
    url            text        NOT NULL,
    title          text,
    content        text        NOT NULL,
    fetched_at     timestamptz NOT NULL DEFAULT now(),
    expires_at     timestamptz NOT NULL DEFAULT (now() + INTERVAL '24 hours'),
    etag           text,
    last_modified  text
);

CREATE INDEX IF NOT EXISTS idx_content_cache_expires_at
    ON content_cache (expires_at);

-- =============================================================================
-- Convenience: cleanup function callable from pg_cron or app worker
-- =============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired()
RETURNS TABLE (table_name text, deleted_rows bigint) AS $$
DECLARE
    n bigint;
BEGIN
    DELETE FROM sessions      WHERE expires_at < now() AND is_archived = false;
    GET DIAGNOSTICS n = ROW_COUNT; table_name := 'sessions';      deleted_rows := n; RETURN NEXT;

    DELETE FROM content_cache WHERE expires_at < now();
    GET DIAGNOSTICS n = ROW_COUNT; table_name := 'content_cache'; deleted_rows := n; RETURN NEXT;

    DELETE FROM rate_limits   WHERE window_start < now() - INTERVAL '1 hour';
    GET DIAGNOSTICS n = ROW_COUNT; table_name := 'rate_limits';   deleted_rows := n; RETURN NEXT;

    DELETE FROM api_usage_logs WHERE created_at < now() - INTERVAL '30 days';
    GET DIAGNOSTICS n = ROW_COUNT; table_name := 'api_usage_logs'; deleted_rows := n; RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
