-- 006_user_preferred_chat_model.sql
-- Per-user choice of which chat model to use for /answer. NULL → use the
-- backend's DEFAULT_CHAT_MODEL. Validated against the curated catalog
-- before being written; arbitrary slugs are rejected at the API layer.
--
-- Idempotent — safe to re-run.

ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_chat_model text;
