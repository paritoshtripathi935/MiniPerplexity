-- 010_campaign_creatives.sql
-- Per-campaign creative storage (PDFs + images).
--
-- Object storage lives off-DB (R2 today; the application's storage
-- abstraction lets us swap S3/GCS/local later). This table just holds
-- the metadata pointer + ownership + audit fields. `storage_key` is the
-- key inside the bucket; `provider` records which backend wrote that
-- key so a future migration can have rows pointing at multiple
-- providers during the cutover.
--
-- Cascade-deletes when the campaign goes away. We deliberately do NOT
-- cascade-delete from users (uploaded_by → SET NULL) so a deleted-user
-- row doesn't take their team's creatives down with it.
--
-- Idempotent — safe to re-run.

CREATE TABLE IF NOT EXISTS campaign_creatives (
    id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id   uuid        NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    uploaded_by   uuid        REFERENCES users(id) ON DELETE SET NULL,
    -- The key inside the storage bucket; e.g.
    --   campaigns/<campaign_uuid>/<creative_uuid>.<ext>
    -- Stable across the lifetime of the row — never re-keyed.
    storage_key   text        NOT NULL,
    -- Original filename for display + downloads (we set
    -- Content-Disposition off this).
    filename      text        NOT NULL CHECK (length(filename) BETWEEN 1 AND 255),
    mime_type     text        NOT NULL,
    size_bytes    bigint      NOT NULL CHECK (size_bytes >= 0),
    -- Which storage backend wrote this row. App reads this when
    -- generating download URLs so a row pointing at the old provider
    -- still works during a migration window. Whitelist enforced in app.
    provider      text        NOT NULL DEFAULT 'r2',
    uploaded_at   timestamptz NOT NULL DEFAULT now(),
    archived_at   timestamptz,
    CONSTRAINT campaign_creatives_provider_check
        CHECK (provider IN ('uploadthing','r2','s3','gcs','local'))
);

CREATE INDEX IF NOT EXISTS idx_campaign_creatives_campaign_uploaded
    ON campaign_creatives (campaign_id, uploaded_at DESC)
    WHERE archived_at IS NULL;

-- Each (campaign, storage_key) is unique — guard against accidental
-- duplicates during retries on the confirm-upload endpoint.
CREATE UNIQUE INDEX IF NOT EXISTS uq_campaign_creatives_campaign_key
    ON campaign_creatives (campaign_id, storage_key);
