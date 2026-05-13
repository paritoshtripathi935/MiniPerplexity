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
-- projects  (Project = Brand. One user → many projects.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS projects (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    archived_at  timestamptz
);

DROP TRIGGER IF EXISTS trg_projects_updated_at ON projects;
CREATE TRIGGER trg_projects_updated_at
    BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Case-insensitive unique project name per user, live rows only.
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_user_name_live
    ON projects (user_id, lower(name))
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_user_created
    ON projects (user_id, created_at DESC)
    WHERE archived_at IS NULL;

-- =============================================================================
-- campaigns  (real-world marketing campaigns: time + goal bounded.
--             Active campaign drives the app's global scope.)
-- =============================================================================
CREATE TABLE IF NOT EXISTS campaigns (
    id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id   uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name         text        NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    objective    text        CHECK (objective IS NULL OR length(objective) <= 500),
    starts_on    date,
    ends_on      date,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now(),
    archived_at  timestamptz,
    CHECK (starts_on IS NULL OR ends_on IS NULL OR starts_on <= ends_on)
);

DROP TRIGGER IF EXISTS trg_campaigns_updated_at ON campaigns;
CREATE TRIGGER trg_campaigns_updated_at
    BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE UNIQUE INDEX IF NOT EXISTS uq_campaigns_project_name_live
    ON campaigns (project_id, lower(name))
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_project_created
    ON campaigns (project_id, created_at DESC)
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_active_window
    ON campaigns (project_id, starts_on, ends_on)
    WHERE archived_at IS NULL;

-- =============================================================================
-- sessions  (replaces in-memory chat_sessions dict)
-- Every authenticated session is anchored to exactly one (project, campaign).
-- project_id is snapshotted alongside campaign_id so the system-prompt
-- composition path is two PK lookups with no join.
-- =============================================================================
CREATE TABLE IF NOT EXISTS sessions (
    id                uuid        PRIMARY KEY,
    user_id           uuid        REFERENCES users(id) ON DELETE SET NULL,
    project_id        uuid        NOT NULL REFERENCES projects(id)  ON DELETE CASCADE,
    campaign_id       uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
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

-- Hot path: list sessions in the active campaign, newest first.
CREATE INDEX IF NOT EXISTS idx_sessions_campaign_last_accessed
    ON sessions (campaign_id, last_accessed_at DESC)
    WHERE is_archived = false;

-- Secondary: cross-campaign list within a project.
CREATE INDEX IF NOT EXISTS idx_sessions_project_last_accessed
    ON sessions (project_id, last_accessed_at DESC)
    WHERE is_archived = false;

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
-- provider_connections + ad_account_links  (Meta / Google Ads integrations)
-- =============================================================================
CREATE TABLE IF NOT EXISTS provider_connections (
    id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider                 text        NOT NULL,
    external_user_id         text        NOT NULL,
    access_token_ciphertext  bytea       NOT NULL,
    token_expires_at         timestamptz NOT NULL,
    scopes                   text[]      NOT NULL,
    connected_at             timestamptz NOT NULL DEFAULT now(),
    last_refreshed_at        timestamptz,
    CONSTRAINT provider_connections_provider_check
        CHECK (provider IN ('meta','google_ads'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_connections_user_provider
    ON provider_connections (user_id, provider);

CREATE INDEX IF NOT EXISTS idx_provider_connections_expires
    ON provider_connections (token_expires_at)
    WHERE token_expires_at < now() + interval '7 days';

CREATE TABLE IF NOT EXISTS ad_account_links (
    id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id               uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider_connection_id   uuid        NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
    external_account_id      text        NOT NULL,
    account_name             text        NOT NULL,
    account_currency         text        NOT NULL,
    account_timezone         text        NOT NULL,
    linked_at                timestamptz NOT NULL DEFAULT now(),
    last_synced_at           timestamptz,
    sync_status              text        NOT NULL DEFAULT 'pending',
    sync_error               text,
    CONSTRAINT ad_account_links_sync_status_check
        CHECK (sync_status IN ('pending','syncing','ok','error'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_account_links_project_external
    ON ad_account_links (project_id, external_account_id);

CREATE INDEX IF NOT EXISTS idx_ad_account_links_project_linked
    ON ad_account_links (project_id, linked_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_account_links_connection
    ON ad_account_links (provider_connection_id);

-- =============================================================================
-- Convenience: cleanup function callable from pg_cron or app worker
-- =============================================================================
CREATE OR REPLACE FUNCTION cleanup_expired()
RETURNS TABLE (table_name text, deleted_rows bigint) AS $$
DECLARE
    n bigint;
BEGIN
    -- Anonymous sessions only: signed-in users' chat history is durable.
    DELETE FROM sessions      WHERE expires_at < now() AND is_archived = false AND user_id IS NULL;
    GET DIAGNOSTICS n = ROW_COUNT; table_name := 'sessions';      deleted_rows := n; RETURN NEXT;

    DELETE FROM content_cache WHERE expires_at < now();
    GET DIAGNOSTICS n = ROW_COUNT; table_name := 'content_cache'; deleted_rows := n; RETURN NEXT;

    DELETE FROM rate_limits   WHERE window_start < now() - INTERVAL '1 hour';
    GET DIAGNOSTICS n = ROW_COUNT; table_name := 'rate_limits';   deleted_rows := n; RETURN NEXT;

    DELETE FROM api_usage_logs WHERE created_at < now() - INTERVAL '30 days';
    GET DIAGNOSTICS n = ROW_COUNT; table_name := 'api_usage_logs'; deleted_rows := n; RETURN NEXT;
END;
$$ LANGUAGE plpgsql;
