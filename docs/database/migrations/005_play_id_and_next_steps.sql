-- 005_play_id_and_next_steps.sql
-- Track which play (if any) produced each assistant turn, and cache
-- LLM-generated "next-step" follow-up suggestions per turn so we don't
-- re-roll them on every render.
--
-- Idempotent — safe to re-run.

-- play_id: the slug of the play (e.g. "weekly_review") that grounded this
-- turn, or NULL for free-form chat. Stored as text so we don't need an FK
-- to the in-process Plays catalog.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS play_id text;

-- next_steps: cached suggestions, e.g. {"items": ["...", "...", "..."]}.
-- Lazily populated by the next-steps endpoint on first request, then served
-- from cache on subsequent loads of the same conversation.
ALTER TABLE messages ADD COLUMN IF NOT EXISTS next_steps jsonb;

-- Plays history queries select recent assistant messages by play_id; index
-- only the populated rows since most messages have play_id = NULL.
CREATE INDEX IF NOT EXISTS idx_messages_play_id_created_at
    ON messages (play_id, created_at DESC)
    WHERE play_id IS NOT NULL;
