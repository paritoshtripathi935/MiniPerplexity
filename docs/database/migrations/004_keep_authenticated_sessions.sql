-- 004_keep_authenticated_sessions.sql
-- Authenticated chats should not auto-expire.
--
-- Bug fix: until now, every session got expires_at = now() + 10 min on
-- every touch. The cleanup loop reaped any session past its TTL —
-- including signed-in users' chats — so users came back after a break
-- and saw an empty sidebar.
--
-- This migration:
--   1. Bumps existing owned (user_id IS NOT NULL) sessions' expires_at
--      far into the future so the next cleanup tick doesn't kill them.
--   2. Replaces the cleanup_expired() function to skip owned sessions.
--   3. Replaces the partial expires_at index to match the new query
--      shape so the planner stays efficient.
--
-- Idempotent — safe to re-run.

-- 1. Push owned rows out to "never". 100 years > any reasonable session lifetime.
UPDATE sessions
   SET expires_at = now() + INTERVAL '100 years'
 WHERE user_id IS NOT NULL
   AND expires_at < now() + INTERVAL '99 years';

-- 2. Re-create the cleanup function with the user-aware filter.
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

-- 3. Replace the partial index so it matches the new cleanup-query shape.
DROP INDEX IF EXISTS idx_sessions_expires_at;
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at
    ON sessions (expires_at)
    WHERE is_archived = false AND user_id IS NULL;
