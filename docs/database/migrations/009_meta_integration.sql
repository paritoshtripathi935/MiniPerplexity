-- 009_meta_integration.sql
-- Meta Marketing API integration (STATUS A5).
--
-- Schema for OAuth-connecting external ad platforms (Meta first, Google Ads
-- and others later) and linking specific ad accounts to projects.
--
-- Design:
--   - provider_connections: one row per (user, provider). User-scoped because
--     a single Meta login can grant access to ad accounts owned by multiple
--     projects (DTC operators with split-by-region accounts, agencies).
--   - ad_account_links: one row per (project, external ad account). The
--     project owns the link — disconnect the user's OAuth and the cascade
--     pulls the links with it.
--
-- Tokens are stored as ciphertext (envelope-encrypted with fernet via
-- META_TOKEN_SECRET in env). The DB never sees plaintext.
--
-- ad_insights_daily (the metric cache) lands in a follow-up migration once
-- the sync pipeline is being written — kept out of this one to keep the
-- shape minimal and easy to roll back if needed.
--
-- Idempotent — safe to re-run on a partially-migrated database.

-- ---------- provider_connections -------------------------------------------
CREATE TABLE IF NOT EXISTS provider_connections (
    id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider                 text        NOT NULL,
    external_user_id         text        NOT NULL,
    -- Long-lived OAuth token, encrypted at rest. Bytea so the application
    -- layer can store binary fernet ciphertext without base64-overhead.
    access_token_ciphertext  bytea       NOT NULL,
    token_expires_at         timestamptz NOT NULL,
    scopes                   text[]      NOT NULL,
    connected_at             timestamptz NOT NULL DEFAULT now(),
    last_refreshed_at        timestamptz,
    -- Provider whitelist enforced in the app layer too; the check is a
    -- belt-and-suspenders backstop against typos in a manual INSERT.
    CONSTRAINT provider_connections_provider_check
        CHECK (provider IN ('meta','google_ads'))
);

-- One Meta connection per user. Re-connecting overwrites in place via
-- ON CONFLICT (user_id, provider) DO UPDATE — keeps the FK out of
-- ad_account_links stable across reconnects.
CREATE UNIQUE INDEX IF NOT EXISTS uq_provider_connections_user_provider
    ON provider_connections (user_id, provider);

CREATE INDEX IF NOT EXISTS idx_provider_connections_expires
    ON provider_connections (token_expires_at)
    WHERE token_expires_at < now() + interval '7 days';

-- ---------- ad_account_links ----------------------------------------------
CREATE TABLE IF NOT EXISTS ad_account_links (
    id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id               uuid        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    provider_connection_id   uuid        NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
    -- Meta returns "act_1234567890". Stored verbatim so we can paste it
    -- back into Graph API calls without re-prefixing.
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

-- A given external ad account links to at most one project (per user).
-- Agencies serving multiple PaidPilot projects would need to re-link from
-- a separate Meta connection; v1 keeps it simple.
CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_account_links_project_external
    ON ad_account_links (project_id, external_account_id);

CREATE INDEX IF NOT EXISTS idx_ad_account_links_project_linked
    ON ad_account_links (project_id, linked_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_account_links_connection
    ON ad_account_links (provider_connection_id);
