# V1 plan — pivoting to a paid-marketer co-pilot

> **Status: proposal, not yet decided.** Open questions at the bottom must be resolved before any of this ships. Drafted 2026-05-08.

## TL;DR

Reposition this project from a generic Perplexity clone into an AI co-pilot for performance marketers. Rename to **PaidPilot**. V1 is five focused features that sit on top of the persistence + auth foundation already shipped on `feature/neon-database` — roughly 8–10 working days of focused work. Nothing already built gets thrown away.

## Why pivot

Generic AI search (ChatGPT, Perplexity) is good enough for casual research but breaks down for a senior performance marketer because:

| Gap | Impact |
| --- | --- |
| Generic web ranking surfaces random blogs, not authoritative marketing sources | Senior marketers don't trust the answers. |
| No persistent context about *their* brand / ICP / KPIs | Every chat starts at zero. |
| No structured outputs (briefs, channel plans, A/B specs) | Output needs reformatting before it's usable. |
| No prebuilt prompt library | Cold-start problem; users don't know what to ask. |
| No domain calculators (CAC, LTV, ROAS, sample size) | They flip to Excel for the math. |

Closing those gaps is a real wedge — performance marketers spend 20–30% of their week on recurring "is this normal?" / "draft me a brief" / "do the math" tasks.

## Target user

In-house performance marketer, 3–8 years of experience, owns paid acquisition for one or a few brands, KPI-pressured (CAC, ROAS, payback period), running mostly on Meta + Google.

V1 is **not** for: agency operators (multi-brand), CMOs (strategy not execution), founders dabbling in ads.

## Jobs-to-be-done (ranked by frequency)

1. **"Is this number normal?"** — benchmarks by industry/channel, with citations.
2. **"Brief me on X"** — quick research from marketing-credible sources (eMarketer, platform docs, Adweek, Search Engine Land), not random Medium posts.
3. **"Generate creative options"** — hooks, headlines, ad copy variants tied to my brand voice + ICP.
4. **"Plan or audit a campaign"** — structured channel plan, A/B test design, or critique of an existing setup.
5. **"Do the math for me"** — CAC, LTV, ROAS, blended efficiency, sample size, payback.

Each of these is currently a 5–30 minute task done daily. Compressing each to <60 seconds with citations is the wedge.

## Rename

**Recommendation: PaidPilot** (`paidpilot.ai` / `paidpilot.dev`).

| Candidate | Why | Why not |
| --- | --- | --- |
| **PaidPilot** ✅ | Positioning is unambiguous in 9 letters. "Pilot" frames the assistant as a co-pilot, not a black-box agent — right for senior marketers who want leverage, not replacement. | A bit on-the-nose for jaded buyers. |
| AdLift | Punchier, implies the outcome (lift). | Narrower — sounds like it's only about creative, not research/planning. |
| Margin | Sophisticated, speaks to business outcome. | Too generic; collides with finance brands. |

**Rename mechanics** (when approved):
- Rename GitHub repo: `MiniPerplexity` → `PaidPilot`
- Update `BackendBaseSettings.TITLE` and `frontend/index.html` `<title>`
- Swap favicon + brand colour in `tailwind.config.js`
- Update Clerk app name + display URL
- README.md rewrite
- Branch protection rules and existing PRs need no manual fixup — GitHub redirects old URLs

## V1 scope — five things

Anything that doesn't slot into one of these gets cut.

### 1. Marketing-tuned system prompt + source weighting

- New system prompt that asks clarifying questions ("What channel? Industry? CAC target?") before answering.
- Allow-list / boost-list of trusted domains (Meta business help, Google Ads docs, TikTok for Business, eMarketer, Statista, Adweek, Search Engine Land, Wordstream, AdEspresso). Re-rank Bing/Google results to push these to top-3.
- "Authoritative source" badge in citations UI.

**Files**: `backend/app/services/system_prompt.py` (new), `backend/app/services/source_ranker.py` (new), `frontend/src/components/ChatMessage.tsx` (badge tweak).

### 2. Brand profile (per Clerk user)

- New table: `brand_profiles (user_id, company_name, website, icp_description, primary_channels, target_cac, target_roas, voice_guidelines, current_campaigns_summary)`.
- Onboarding: 6-question wizard on first sign-in.
- Profile injected into every system prompt. Cached in app memory keyed by `user_id` to avoid the per-request DB hit.

**Files**: `docs/database/migrations/003_brand_profiles.sql` (new), `backend/app/db/models.py` (new model), `backend/app/api/v1/brand_profile.py` (new), `frontend/src/components/Onboarding.tsx` (new).

### 3. Plays — prompt/template library

12–15 curated prompts:

- Hook ideation (5 hooks by emotion)
- Creative brief generator
- Audience research (psychographic + behavioural)
- Channel mix plan (budget split, KPIs, creative count)
- A/B test designer
- Landing-page critique
- Competitor teardown
- Weekly performance review
- iOS / privacy update brief
- Budget reallocation diagnosis
- Saturation diagnosis
- New-channel feasibility

Each Play is structured: required inputs, optional inputs, output schema. Stored as YAML in `backend/app/plays/` and surfaced via `GET /api/v1/plays` plus a sidebar grid above sessions.

### 4. Structured outputs (not just prose)

For Plays with a defined output schema (creative brief, channel plan, A/B spec), render as a styled card with sections + "Copy as Markdown" / "Export as PDF" actions.

Reuse the markdown export plumbing already shipped in `backend/app/db/repository.py::export_session_markdown`.

### 5. Calculators

Four small client-only calculators in a sidebar tab:

- **CAC payback period** (CAC, gross margin, ARPU → months to payback)
- **ROAS-to-margin** (ROAS, COGS%, fixed costs → contribution margin)
- **A/B sample size** (baseline rate, MDE, alpha/power → required N)
- **Blended channel efficiency** (per-channel spend + conversions → blended CAC)

Pure frontend, no backend calls.

## Out of V1 (deliberate)

- Meta Ad Library scraping
- Google Ads / Meta Marketing API integration
- Anomaly detection on real campaign data
- Multi-tenant teams / agency mode
- Billing / paid tiers
- Save-your-own-Plays (V1 is read-only catalog)

## Engineering work breakdown

| Area | Work | Reuses what's already built |
| --- | --- | --- |
| `003_brand_profiles.sql` migration | new table, FK to `users` | migration runner |
| `app/services/system_prompt.py` | composes system prompt from user + brand profile + Play config | existing `CloudflareChat` |
| `app/services/source_ranker.py` | re-rank search results by domain authority list | existing `perform_search` |
| `GET /api/v1/plays` | returns curated Play catalog | none |
| `GET/PUT /api/v1/brand-profile` | per-user CRUD | auth deps already done |
| Frontend `/onboarding` route | 6-question wizard | Clerk `<SignedIn>` |
| `<PlayPicker>` | grid of Plays in sidebar | sidebar layout |
| `<StructuredOutputCard>` | renders schema-typed responses | message renderer |
| `<Calculators>` | 4 small forms, pure client | none |
| Branding pass | rename, favicon, copy | trivial |

**Estimated effort**: 8–10 working days for one person already in this codebase.

## V2 (4–6 weeks after V1)

- Meta Ad Library API: search competitor ads, summarise patterns
- TikTok Top Ads scraper
- Google Ads Transparency Center integration
- Upload-a-campaign-config audit (paste JSON or screenshot → critique)
- Paste-your-CSV anomaly detection ("what changed in the last 30 days?")
- Weekly digest — Sunday-night auto-generated brief on saved Plays

## V3 (quarter+)

- Read-only Meta Marketing + Google Ads API connections
- Real-time anomaly alerts via Slack webhook
- Multi-brand support (agency tier)
- Team workspaces, billing
- Custom Plays + sharing

## Open questions (need owner decision)

1. **Name**: PaidPilot, AdLift, Margin, or something else?
2. **Self-serve vs agency positioning**: leaning **in-house** for V1.
3. **Free tier**: unlimited free with the existing rate-limit table for telemetry, or a soft 50-msgs/mo cap?
4. **Plays format in V1**: hand-curated read-only catalog, save-your-own deferred to V2?
5. **Old URL strategy**: hard-cut the demo, GitHub redirect handles the repo URL?

---

## Why this is cheap to do now

Everything we've already built does real work in this pivot:

- **Neon Postgres + repository layer** → brand profiles, Plays, structured outputs all just reuse it.
- **Clerk auth + JIT user provisioning** → per-user brand profile is one `user_id` FK away.
- **Sessions sidebar with rename / archive / delete / export / FTS** → already the right UX shape; the rebrand is mostly copy.
- **Citations in `messages` + `search_results` schema** → "Authoritative source" badge is one column or one app-side classifier.
- **Migration runner + push.sh + branch protection** → safe, repeatable shipping cadence.

Without the foundation we just shipped, V1 would be 4–5 weeks instead of 2.
