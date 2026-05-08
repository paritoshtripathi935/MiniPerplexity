-- 001_clerk_auth.sql — extend `users` for Clerk-based auth.
-- Idempotent. Apply with: python -m scripts.apply_migration 001_clerk_auth.sql

-- 1. Add Clerk's user_id (the `sub` claim) and image_url.
ALTER TABLE users ADD COLUMN IF NOT EXISTS clerk_user_id text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS image_url     text;

-- 2. Email is no longer required — Clerk JWTs may not carry it.
ALTER TABLE users ALTER COLUMN email DROP NOT NULL;

-- 3. clerk_user_id must be unique when present.
DO $$ BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_clerk_user_id_key'
    ) THEN
        ALTER TABLE users ADD CONSTRAINT users_clerk_user_id_key UNIQUE (clerk_user_id);
    END IF;
END $$;

-- 4. Quick lookup index (clerk_user_id is the hot lookup path).
CREATE INDEX IF NOT EXISTS idx_users_clerk_user_id ON users (clerk_user_id) WHERE clerk_user_id IS NOT NULL;
