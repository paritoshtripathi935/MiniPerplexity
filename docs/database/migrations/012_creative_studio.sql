-- 012_creative_studio.sql
-- Tag AI-generated rows in campaign_creatives.
--
-- The studio surface (`/projects/:p/c/:c/studio`) generates ad creatives
-- via Cloudflare Workers AI (Flux) and writes them to the same
-- `campaign_creatives` table that the upload flow writes to — so the
-- existing library UI surfaces both uploaded and generated assets side
-- by side without a UI fork.
--
-- Distinguishing them post-write needs metadata. Two new optional
-- columns:
--
--   prompt   — text of the user's generation prompt (NULL on uploads)
--   ai_model — model id used to render (e.g. '@cf/black-forest-labs/flux-1-schnell')
--
-- Both nullable. A non-null `prompt` is the marker for "this row came
-- from studio" — the library can filter, badge, or sort by it.
--
-- Idempotent — safe to re-run.

ALTER TABLE campaign_creatives
    ADD COLUMN IF NOT EXISTS prompt text;

ALTER TABLE campaign_creatives
    ADD COLUMN IF NOT EXISTS ai_model text;

COMMENT ON COLUMN campaign_creatives.prompt IS
  'Generation prompt for AI-generated rows. NULL when the row was '
  'uploaded by the user from /creatives instead of generated in /studio.';

COMMENT ON COLUMN campaign_creatives.ai_model IS
  'Model identifier used to render this asset (e.g. '
  '"@cf/black-forest-labs/flux-1-schnell"). NULL for uploads.';
