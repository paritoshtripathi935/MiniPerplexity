# Meta Marketing API integration — scoping doc

> Status: **direction resolved 2026-05-13**. Written against `main` post-#82.
>
> **Resolution (from chat):**
> - There are no real beta users yet — the "9 users" in the DB are dev/test rows.
>   This drops App Review urgency: it only matters when a real prospective
>   customer needs to connect without being added as a tester.
> - **Strategy A** (full OAuth, full pipeline, grounded LLM) is the build target —
>   not because we need GA traffic, but because it's the differentiator that
>   earns the rebrand and is demo-able via screen share.
> - **App Review is deferred** until a real customer queue exists. Engineering
>   owns the whole timeline; no external blocker.
> - Multi-currency: store + display in account currency for v1.
> - Phase ordering as written below.
>
> Implementation kicks off after the doc lands.

PaidPilot's landing page promises "connect Meta" and the HomePage already shows two dim placeholder rows (`connect Meta`, `connect Google Ads`) that link to `/settings`. STATUS A5 calls this a deadline-driven landing-page commitment: beta runs to **2026-11-11**, and the "free for 6 months" framing turns into churn risk if a visitor signs up expecting Meta connection and we don't have it.

This doc scopes what shipping it actually entails so we agree on shape and depth before writing code.

---

## 1. What "Connect Meta" buys the product

| Surface | Today | With Meta connected |
|---|---|---|
| HomePage feed row "meta CAC trend" | static "connect Meta" stub | live CAC chart (last 14d) per active campaign, ↑/↓ vs. previous period |
| Investigation grounding | system prompt only knows what the user typed | system prompt can append "your last-7d ROAS on Meta is 1.8x; CPP on this campaign is $42 (target $35)" — answers reference *your* numbers, not generic best-practice |
| Plays | static catalogue, generic guidance | plays can read campaign-level metrics + suggest specific actions ("your CPM is up 38% week-over-week; here are 4 creative refresh prompts") |
| Calculators | inputs typed by hand | inputs pre-fill from current Meta spend, CAC, conversion rate |
| Settings / project | brand profile only | per-project "ad accounts linked" panel + sync status |

The thing that earns the rebrand is **#2 — investigation grounding with your own numbers**. The HomePage tile is just the visible proof. Without the grounding step, this is a chart and a checkbox; with it, it's a different product.

---

## 2. Strategy choice — pick one before any code lands

The blocker on real OAuth is **App Review for `ads_read`**: Meta requires Business Verification + use-case documentation + (for some scopes) a working demo video. Typical timeline is **1–4 weeks** of back-and-forth. Until approved, the OAuth flow only works for accounts listed as "developers" or "testers" on the Meta App.

Beta ends 2026-11-11. That's ~6 months out, which is enough runway for App Review *if we start now*. But it's worth being explicit about the bet.

### Strategy A — Full OAuth, all-the-way real

- Real Facebook Login OAuth on `/settings/integrations`
- Long-lived tokens encrypted at rest (KMS envelope or `cryptography.fernet`)
- Background sync job pulls insights → cache in our DB
- Real CAC tile on HomePage, real grounding on `/answer`
- **Submit App Review immediately** so it can finish in parallel with engineering

Pros: matches the landing promise exactly. Best demo. Defensible "operator OS for growth teams" claim.
Cons: ~5–8 days of engineering. App Review timeline is mostly outside our control. Token security needs care.
Time-to-value: 1–2 weeks if we kick off App Review on day 1.

### Strategy B — OAuth in dev-mode, ship to a waitlist

- Same code path as A, but only Meta-app-registered "testers" can connect
- Existing alpha users add themselves as testers (one-off)
- Skip App Review until traction proves the feature worth the chase
- Engineering effort is the same as A minus the App Review prep

Pros: ships to your existing 9 users without external blockers. Lets us learn from real usage before paying the App Review tax.
Cons: every prospective customer must be manually added as a tester. "Connect Meta" CTA on the landing page can't go live for cold traffic.
Time-to-value: 1 week of engineering. Zero external dependency.

### Strategy C — CSV upload bridge, OAuth later

- User exports Meta Ads Manager → CSV (campaign-level last 30d)
- PaidPilot has a `/settings/integrations` panel with a drag-drop zone
- Parse + persist to the same ad_insights table the OAuth flow would use
- HomePage tile + grounding reads from that table — UI / LLM hooks ship now
- Real OAuth follows when App Review clears

Pros: ships in ~2 days. Zero third-party dependency. We learn what fields the LLM actually uses before paying OAuth engineering cost.
Cons: user has to remember to re-upload weekly. Less "operator-OS" — more "spreadsheet helper". Doesn't deliver the landing promise as written.
Time-to-value: 2 days.

### Recommended path

**Strategy B, with two pre-conditions**:

1. Decide today whether we want App Review at all and start it in parallel if yes. Free decision; doesn't block code.
2. Soft-launch the connect flow to existing users; mark it "early access" on the landing page so cold-traffic prospects know they'll be queued.

This gets us the grounding loop (the real product differentiator) into production hands in 1 week without betting the schedule on Meta's review queue. We can swap to "everyone" the day Review clears.

If you want C instead (ship something fast and lightweight), I can have it up in 2 days — but it limits the demo story.

---

## 3. Meta Marketing API surface — the parts we'll touch

### Auth
- Facebook Login for Business OAuth (server-side flow)
- Scope: **`ads_read`** for v1. Skip `ads_management` until we have a real reason to write back to Meta.
- Token flow: short-lived user token (1h) → exchange for long-lived (60d) → optional System User token via Business Manager for indefinite access if the user is a BM admin.
- Refresh strategy: store the long-lived token + expiry timestamp; refresh ~3 days before expiry on a cron.

### Endpoints (Graph API base: `https://graph.facebook.com/v<N>/`)
- `GET /me/adaccounts?fields=id,name,account_status,currency,timezone_name` — list ad accounts the OAuth'd user can access
- `GET /act_<account_id>/campaigns?fields=id,name,status,objective,daily_budget,start_time,stop_time` — campaign metadata
- `GET /act_<account_id>/insights` — the hot path for metrics. Fields we'll request:
  - `spend, impressions, clicks, ctr, cpm, cpc, reach, frequency`
  - `actions, action_values` (conversions + values, requires picking the right `action_type`)
  - `cost_per_action_type` (CPP / CAC)
  - Breakdowns: `date_start, date_stop` (with `time_increment=1`), `campaign_id`, optionally `age, gender, placement`
- `POST /<account_id>/customaudiences` — out of scope for v1

### Rate limits — sync planning notes
- Meta enforces both **app-level** (per-hour) and **ad-account-level** (per-business-per-hour) limits.
- Insights calls are particularly metered. Practical pattern: nightly full-resync of last 30d, hourly incremental for yesterday + today.
- Backoff: exponential, respect `X-Business-Use-Case-Usage` header which Meta returns with usage % per account.

### Multi-currency
- Each ad account has a `currency` field. We'll **persist amounts in account currency + cents** and convert for display (open question: do we store FX rates, or just show the user a "USD equiv" computed via a free FX API at render time?). Picking the lazy path for v1: show in account currency, label with the currency code; revisit when a customer asks.

### Time zone
- Each ad account has a `timezone_name`. Insights are aggregated in account TZ.
- Rolling-up across accounts (e.g. "all of project Allbirds' campaigns' spend yesterday") requires normalising to a single TZ. For v1, **normalise to the project's brand_profile.region** if set, else UTC.

---

## 4. Schema sketch

Three new tables. All FK-anchored to existing surfaces.

### `provider_connections`
One row per (user, provider). Holds the OAuth state. User-level, not project-level, because one user might have one Meta login that grants access to ad accounts owned by multiple projects.

```sql
CREATE TABLE provider_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider        text NOT NULL CHECK (provider IN ('meta','google_ads')),
  external_user_id text NOT NULL,           -- Meta user id
  access_token_ciphertext bytea NOT NULL,    -- envelope-encrypted
  token_expires_at timestamptz NOT NULL,
  scopes          text[] NOT NULL,
  connected_at    timestamptz NOT NULL DEFAULT now(),
  last_refreshed_at timestamptz,
  UNIQUE (user_id, provider)                 -- one Meta login per user for now
);
```

### `ad_account_links`
One row per (project, external ad account). A project can link multiple ad accounts (DTC operators with split-by-region accounts). An ad account can in principle be linked to multiple projects (agencies), but we'll enforce one-project-per-account-per-user for v1.

```sql
CREATE TABLE ad_account_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  provider_connection_id uuid NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
  external_account_id text NOT NULL,          -- "act_1234567890"
  account_name    text NOT NULL,
  account_currency text NOT NULL,
  account_timezone text NOT NULL,
  linked_at       timestamptz NOT NULL DEFAULT now(),
  last_synced_at  timestamptz,
  sync_status     text NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending','syncing','ok','error')),
  sync_error      text,
  UNIQUE (project_id, external_account_id)
);
```

### `ad_insights_daily`
The cache. One row per (ad_account, campaign, date). Daily granularity is enough for grounding; we can add hourly later if needed.

```sql
CREATE TABLE ad_insights_daily (
  id              bigserial PRIMARY KEY,
  ad_account_link_id uuid NOT NULL REFERENCES ad_account_links(id) ON DELETE CASCADE,
  external_campaign_id text NOT NULL,
  campaign_name   text NOT NULL,
  date            date NOT NULL,
  spend_cents     bigint NOT NULL,
  impressions     bigint NOT NULL,
  clicks          bigint NOT NULL,
  conversions     bigint,                     -- depends on the pixel; nullable
  conversion_value_cents bigint,
  cpm_cents       bigint,
  cpc_cents       bigint,
  cpp_cents       bigint,                     -- cost per purchase (CAC proxy)
  raw             jsonb NOT NULL,             -- full insights row, future-proof
  fetched_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ad_account_link_id, external_campaign_id, date)
);
CREATE INDEX idx_ad_insights_daily_lookup
  ON ad_insights_daily (ad_account_link_id, date DESC);
```

Open questions on schema:
- **Encryption key management**: simplest is `cryptography.fernet` with a key from env (`META_TOKEN_SECRET`). KMS envelope is the right answer but adds infra. Lean fernet for v1; document the upgrade path.
- **Soft-delete or hard-delete on disconnect?** Default: hard-delete `provider_connections` cascades through everything. Add an "archive" mode only if we hear users want to re-link without re-syncing.
- **Conversion event picking**: the "conversion" number is meaningless without picking which Meta pixel event counts (purchase? subscribe? lead?). v1: capture all `action_type` rows in `raw`, pick "purchase" by default but let the project's `brand_profile` override.

---

## 5. Backend endpoint sketch

### Auth flow
- `GET /api/v1/integrations/meta/connect` — returns the Meta OAuth authorize URL with our app id, state token (CSRF), and redirect URI
- `GET /api/v1/integrations/meta/callback` — handles `?code=...&state=...`; exchanges short-lived token → long-lived → stores in `provider_connections`; redirects back to `/settings/integrations`
- `DELETE /api/v1/integrations/meta` — disconnects (cascades)
- `POST /api/v1/integrations/meta/refresh` — manual token refresh (cron also does this)

### Account linking
- `GET /api/v1/integrations/meta/ad-accounts` — proxies `/me/adaccounts` for the connected user; UI uses this in the AdAccountPicker
- `POST /api/v1/projects/:projectId/ad-accounts` — link an account to a project. Body: `{ external_account_id }`. Triggers initial sync inline.
- `DELETE /api/v1/projects/:projectId/ad-accounts/:linkId` — unlink

### Insights / sync
- `POST /api/v1/projects/:projectId/ad-accounts/:linkId/sync` — manual resync trigger (button in Settings)
- `GET /api/v1/projects/:projectId/insights?from=2026-04-01&to=2026-05-13&campaign_id=...` — rolled-up data for UI tiles
- (Internal) cron: every hour pulls yesterday+today incrementals; nightly pulls last 30d full

### LLM grounding hook
- `app/services/system_prompt.py` gets a new `compose_meta_context()` block: pulls last-7d roll-up via `get_recent_insights_for_campaign(campaign_id)` and appends a short numeric brief to the system prompt below the brand block. Keep it terse — 3–4 numbers, not a table dump.

---

## 6. UI surface sketch

### New: `/settings/integrations`
- Page-level: list of providers (Meta, Google Ads stub, Notion stub for A1).
- Per-provider card: status pill (connected/not-connected/error), connected-as line, last-sync timestamp, "manage accounts" link.
- "Manage accounts" expands inline: list of ad accounts the user can access (proxied from Meta), checkbox per account, "link to project" picker.

### `/projects/:projectId` (existing)
- New tab: "ad accounts" alongside "campaigns" + "brand profile". Shows the per-project linked accounts + sync status. Lets the user unlink, re-sync, or view raw daily roll-up.

### `/projects/:projectId/c/:campaignId` (CampaignHomePage, existing)
- New tile or chip row above the existing tiles: live numbers (spend last 7d / CPP / ROAS) when the campaign has been mapped to a Meta campaign. Mapping is fuzzy — needs a per-project ("which Meta campaign IDs belong to which of our campaigns?") config. **Default: show ad-account-rollup until the user maps Meta campaigns to PaidPilot campaigns.**

### HomePage
- The dim "connect Meta" row stays as the connect onramp until the user has a Meta connection; once they do, it becomes the real CAC trend row (sparkline + ↑/↓ vs prior period).

### Investigation system prompt
- When the active campaign has Meta data, the system prompt appends:
  ```
  Your account context (last 7 days, USD):
  - Spend: $X,XXX across N campaigns
  - Cost per purchase: $XX (target $YY per brand profile)
  - ROAS: X.Xx
  - Largest mover week-over-week: <campaign name>, CPP +/-XX%
  Cite numbers when they're decision-relevant; flag when they conflict with the user's claim.
  ```

---

## 7. Risks + open questions

| # | Risk | Mitigation |
|---|---|---|
| 1 | **App Review timeline blocks GA**. 1–4 weeks of unknown. | Start App Review in parallel with code (Strategy A or B). Capture privacy policy, terms, demo video, business verification *this week*. |
| 2 | **Token storage**: leaking encrypted tokens is a P0 incident. | Encrypt at rest. Never log tokens. Rotate `META_TOKEN_SECRET` requires re-OAuth. Plan a KMS migration path doc. |
| 3 | **Rate limits**: bad sync logic gets us throttled per-business. | Respect `X-Business-Use-Case-Usage`. Exponential backoff. Nightly full + hourly incremental as the cap-friendly pattern. |
| 4 | **Campaign mapping**: PaidPilot campaign ≠ Meta campaign 1:1. | Ship account-level rollup first. Per-campaign mapping is a follow-up — same `ad_account_links` table grows a `campaign_mappings` join. |
| 5 | **Multi-currency** breaks aggregation | v1: show in account currency. Aggregation views label "USD ≈" via a free FX API. Defer real currency layer. |
| 6 | **Conversion event picking** is brand-specific. | Default to `purchase`; let `brand_profiles` override. Surface picker in /settings/integrations. |
| 7 | **Pixel attribution** varies by setup (7-day click vs. 1-day view vs. iOS-14 windowed). | Pull the default attribution window per account; show it in the UI. Don't promise causation; surface raw numbers. |
| 8 | **Disconnect semantics**: what happens to grounded answers that referenced now-removed data? | Historical messages stay. The /answer system-prompt composer just skips the Meta block if no link exists. Disconnect doesn't rewrite history. |
| 9 | **Webhooks** (Meta can push ad-account-deauth events) | Not v1. Daily token-validity probe is enough; webhook is a nice-to-have. |

### TBDs to confirm before coding

- [ ] Current Graph API version to pin. (Knowledge cutoff: v20 was stable; v21–22 likely current — check `developers.facebook.com/docs/graph-api/changelog` before locking the env var.)
- [ ] Meta App Review queue right now: 1 week? 4? (Affects whether Strategy A vs. B is the right bet.)
- [ ] Will we have an existing Meta App, or do I create one under your developer account? Affects bizverification ownership.
- [ ] FX rate source — accept storing in account currency only for v1?
- [ ] `META_TOKEN_SECRET` env var owner — Render dashboard or a 1Password handoff?

---

## 8. Phased ship plan (assuming Strategy B)

### Phase 1 — Plumbing + connect flow · 2 days
- Migration 009 (`provider_connections`, `ad_account_links`, `ad_insights_daily`)
- Backend: OAuth handshake, callback, token storage, `/me/adaccounts` proxy
- Frontend: `/settings/integrations` page (Stitch-style: card per provider, status pill, "connect" CTA)
- HomePage row stays static (still says "connect Meta" — but it now links to the real flow)
- Demo-able to existing users (they each add themselves as Meta App testers)

### Phase 2 — Sync + insights table · 2 days
- Insights fetcher (nightly + hourly cron — APScheduler or a Render cron job)
- `POST /sync` manual trigger
- Insights query API (rollups, breakdowns)
- Tests against a fixture-replay (don't hit Meta in CI)

### Phase 3 — Grounding the LLM · 1 day
- `compose_meta_context()` in `system_prompt.py`
- Per-project "default attribution window" + "purchase event" override in brand profile
- A/B the system prompt change against existing investigations to make sure we don't regress

### Phase 4 — Real UI tiles · 1 day
- HomePage CAC trend row (real sparkline from `ad_insights_daily`)
- CampaignHomePage rollup chip strip
- `/projects/:id` ad-accounts tab

### Phase 5 — Polish + App Review (parallel) · 1–2 days + external wait
- Privacy policy URL, terms URL, app use case doc, demo video
- Submit App Review
- Iterate on reviewer feedback
- When approved: flip the connect CTA on the marketing landing from "early access" → "connect Meta" with no caveat

**Total engineering: ~6–8 days across 1.5 weeks. App Review starts day 1 and clears whenever it clears.**

---

## 9. Open item — Meta App credentials

The only remaining external dependency is the Meta App itself. Phase 1's
backend OAuth helper reads `META_APP_ID` and `META_APP_SECRET` from env;
without them, the connect endpoint returns 503 "Meta integration not
configured" so the build still ships clean. Steps to unblock the OAuth
handshake when ready:

1. Create a Meta App at developers.facebook.com (type: Business)
2. Add the "Facebook Login for Business" + "Marketing API" products
3. Configure OAuth redirect URI:
   `https://paidpilot.app/api/v1/integrations/meta/callback` (prod) +
   `http://127.0.0.1:8001/api/v1/integrations/meta/callback` (local)
4. Drop `META_APP_ID` + `META_APP_SECRET` into `.env` (local) and the
   Render dashboard (prod)
5. Sign in via /settings/integrations — confirm it persists tokens +
   lists ad accounts

This can happen any time after Phase 1 lands.
