-- 011_slack_integration.sql
-- Slack incoming-webhook integration.
--
-- Design choices for the spike (per the plan we agreed on):
--   - WEBHOOK-only flow, no OAuth. The user pastes an incoming-webhook URL
--     from their Slack workspace; we encrypt it at rest and POST messages
--     to it on demand. Zero token rotation, zero app review.
--   - Reuse `provider_connections` rather than introducing a dedicated
--     `webhook_endpoints` table. Field re-purposing for the webhook case:
--         provider                = 'slack'
--         external_user_id        = the workspace identifier we receive
--                                   from Slack's response on the test POST
--                                   (or 'webhook' as a placeholder when
--                                   none is available — the column is
--                                   NOT NULL by 009's schema).
--         access_token_ciphertext = fernet-encrypted webhook URL.
--         token_expires_at        = far-future (webhooks don't expire).
--         scopes                  = []. Webhook flow has no scopes concept.
--     If Slack grows beyond webhook-only we'll split this out then.
--
-- This migration:
--   - Widens the provider whitelist on `provider_connections` so 'slack'
--     can land alongside 'meta' / 'google_ads'.
--
-- Idempotent — safe to re-run.

ALTER TABLE provider_connections
    DROP CONSTRAINT IF EXISTS provider_connections_provider_check;

ALTER TABLE provider_connections
    ADD CONSTRAINT provider_connections_provider_check
    CHECK (provider IN ('meta', 'google_ads', 'slack'));

COMMENT ON COLUMN provider_connections.access_token_ciphertext IS
  'Fernet-encrypted ciphertext. Stores the OAuth long-lived token for '
  'meta/google_ads, and the raw incoming-webhook URL for slack.';
