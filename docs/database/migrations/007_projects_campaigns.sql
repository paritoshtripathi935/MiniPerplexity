-- 007_projects_campaigns.sql
-- Introduce the project → campaign hierarchy.
--
-- Before: every session and brand_profile is owned directly by a user.
-- After:  user → projects → campaigns → sessions. brand_profile is keyed
--         by project (one brand per project, multiple projects per user).
--
-- Design goals (per roadmap Category H):
--   - Latency: snapshot project_id onto sessions so the hot system-prompt
--     path is two PK lookups (session → brand_profile), no joins.
--   - Extensible: archived_at lifecycle on projects and campaigns mirrors
--     the existing sessions pattern; workspace_id can be added later
--     without touching FK shape.
--   - Clear and simple: brand_profile stays its own table (1:1 with
--     project), uniqueness enforced with case-insensitive partial indexes
--     scoped to live rows only.
--
-- Idempotent — safe to re-run on a partially-migrated database.

-- ---------- projects --------------------------------------------------------
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

-- Project names are unique per user, case-insensitive, among live (non-archived) rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_projects_user_name_live
    ON projects (user_id, lower(name))
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_projects_user_created
    ON projects (user_id, created_at DESC)
    WHERE archived_at IS NULL;

-- ---------- campaigns -------------------------------------------------------
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

-- Campaign names are unique per project, case-insensitive, among live rows.
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaigns_project_name_live
    ON campaigns (project_id, lower(name))
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_campaigns_project_created
    ON campaigns (project_id, created_at DESC)
    WHERE archived_at IS NULL;

-- "Active campaigns" = ongoing within the date window. Partial index covers the
-- common filtered list; planner can still use it for the open-ended cases.
CREATE INDEX IF NOT EXISTS idx_campaigns_active_window
    ON campaigns (project_id, starts_on, ends_on)
    WHERE archived_at IS NULL;

-- ---------- sessions: add project_id + campaign_id --------------------------
-- Nullable for now so we can backfill safely. NOT NULL is enforced at the end.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS project_id  uuid REFERENCES projects(id)  ON DELETE CASCADE;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS campaign_id uuid REFERENCES campaigns(id) ON DELETE CASCADE;

-- ---------- brand_profiles: re-key from user_id to project_id ---------------
-- The existing brand_profiles table has user_id as PK. We add project_id,
-- backfill it, then drop the user_id PK and adopt project_id as PK. Doing
-- it in this order keeps the table queryable throughout.
ALTER TABLE brand_profiles ADD COLUMN IF NOT EXISTS project_id uuid REFERENCES projects(id) ON DELETE CASCADE;

-- ---------- Backfill: one project + one campaign per existing user ----------
-- For every user with no project yet, create their default project named
-- after brand_profiles.company_name (fallback "My Brand") + a "General"
-- campaign, then attach all of that user's sessions to it.
DO $$
DECLARE
    u           record;
    new_project uuid;
    new_camp    uuid;
    proj_name   text;
BEGIN
    FOR u IN
        SELECT id AS user_id FROM users
        WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.user_id = users.id)
    LOOP
        SELECT NULLIF(trim(bp.company_name), '')
          INTO proj_name
          FROM brand_profiles bp
         WHERE bp.user_id = u.user_id;

        proj_name := COALESCE(proj_name, 'My Brand');

        INSERT INTO projects (user_id, name)
        VALUES (u.user_id, proj_name)
        RETURNING id INTO new_project;

        INSERT INTO campaigns (project_id, name, objective)
        VALUES (new_project, 'General', NULL)
        RETURNING id INTO new_camp;

        UPDATE sessions
           SET project_id  = new_project,
               campaign_id = new_camp
         WHERE user_id = u.user_id
           AND campaign_id IS NULL;

        UPDATE brand_profiles
           SET project_id = new_project
         WHERE user_id = u.user_id
           AND project_id IS NULL;
    END LOOP;
END $$;

-- Anonymous sessions (user_id IS NULL) get auto-expired by cleanup_expired;
-- they have no owner and therefore no project. They remain campaign-less
-- until cleanup sweeps them. Tighten this by deleting them now so the
-- NOT NULL constraint below holds.
DELETE FROM sessions WHERE user_id IS NULL AND campaign_id IS NULL;

-- ---------- Enforce NOT NULL now that backfill is complete ------------------
ALTER TABLE sessions ALTER COLUMN project_id  SET NOT NULL;
ALTER TABLE sessions ALTER COLUMN campaign_id SET NOT NULL;

-- Hot path: list sessions for the active campaign, newest first.
CREATE INDEX IF NOT EXISTS idx_sessions_campaign_last_accessed
    ON sessions (campaign_id, last_accessed_at DESC)
    WHERE is_archived = false;

-- Secondary: list everything in a project (cross-campaign reporting).
CREATE INDEX IF NOT EXISTS idx_sessions_project_last_accessed
    ON sessions (project_id, last_accessed_at DESC)
    WHERE is_archived = false;

-- ---------- brand_profiles: finalize PK swap --------------------------------
-- After backfill, every brand_profiles row has a project_id. Make it the PK.
ALTER TABLE brand_profiles ALTER COLUMN project_id SET NOT NULL;

-- Drop the old user_id PK + FK. user_id column is kept temporarily for
-- rollback safety; a follow-up migration drops it once the app stops
-- referencing it.
ALTER TABLE brand_profiles DROP CONSTRAINT IF EXISTS brand_profiles_pkey;
ALTER TABLE brand_profiles ADD CONSTRAINT brand_profiles_pkey PRIMARY KEY (project_id);

-- The pre-existing partial index on (user_id) WHERE onboarding_completed_at
-- IS NULL is replaced by a project_id-keyed version.
DROP INDEX IF EXISTS idx_brand_profiles_pending_onboarding;
CREATE INDEX IF NOT EXISTS idx_brand_profiles_pending_onboarding
    ON brand_profiles (project_id)
    WHERE onboarding_completed_at IS NULL;
