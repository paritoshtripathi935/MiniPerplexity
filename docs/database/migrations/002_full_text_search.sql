-- 002_full_text_search.sql — full-text search across chat history.
-- Idempotent. Apply with: python -m scripts.apply_migration 002_full_text_search.sql

-- 1. Generated tsvector column on messages.content.
--    GENERATED ALWAYS AS (...) STORED is the modern, no-trigger approach.
ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS content_tsv tsvector
    GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

-- 2. GIN index — the canonical FTS index for tsvector columns.
CREATE INDEX IF NOT EXISTS idx_messages_content_tsv
    ON messages USING GIN (content_tsv);

-- 3. Trigram index on sessions.title for fuzzy "type-ahead" matching.
--    pg_trgm is already available on Neon; ILIKE on `title` benefits from this.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_sessions_title_trgm
    ON sessions USING GIN (title gin_trgm_ops)
    WHERE title IS NOT NULL;
