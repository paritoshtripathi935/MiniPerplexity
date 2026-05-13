-- 008_drop_brand_profiles_user_id.sql
-- Final step of the project/campaign hierarchy migration (Category H).
--
-- Migration 007 added `project_id` as the primary key of `brand_profiles`
-- and kept the old `user_id` column for rollback safety. Now that the
-- backend (PRs #64/#65/#67) has been running entirely off `project_id`
-- in production for at least one deploy cycle, drop the legacy column.
--
-- Idempotent. Safe to re-run.

ALTER TABLE brand_profiles DROP COLUMN IF EXISTS user_id;
