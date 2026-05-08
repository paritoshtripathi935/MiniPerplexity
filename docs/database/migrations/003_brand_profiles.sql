-- 003_brand_profiles.sql — per-user marketing context.
-- Idempotent. Apply with: python -m scripts.apply_migration 003_brand_profiles.sql
--
-- The brand profile is composed into the system prompt for every chat the
-- user runs. One row per user. We also persist the answers from the
-- onboarding wizard here verbatim.

CREATE TABLE IF NOT EXISTS brand_profiles (
    user_id                    uuid        PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    company_name               text,
    website                    text,
    icp_description            text,                 -- "who do you sell to"
    primary_channels           text[]      NOT NULL DEFAULT '{}',  -- meta, google, tiktok, ...
    target_cac                 numeric(12,2),
    target_roas                numeric(8,2),
    voice_guidelines           text,
    current_campaigns_summary  text,
    onboarding_completed_at    timestamptz,
    created_at                 timestamptz NOT NULL DEFAULT now(),
    updated_at                 timestamptz NOT NULL DEFAULT now()
);

-- Standard updated_at trigger (the function already exists from schema.sql).
DROP TRIGGER IF EXISTS trg_brand_profiles_updated_at ON brand_profiles;
CREATE TRIGGER trg_brand_profiles_updated_at
    BEFORE UPDATE ON brand_profiles
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- The onboarding-completed flag is the most useful filter (showing onboarding
-- modal vs. not), so partial-index it.
CREATE INDEX IF NOT EXISTS idx_brand_profiles_pending_onboarding
    ON brand_profiles (user_id)
    WHERE onboarding_completed_at IS NULL;
