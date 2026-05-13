# PaidPilot — status & handoff

> **Read this first when you come back.** Living doc — update it as work lands.
> Last updated: 2026-05-13 (Category H closed: project → campaign → tools hierarchy live end-to-end, PRs #61 → #79 merged) · branch: `main` (everything below is merged)

## Where we are

V1 is shipped. The chat surface had a major iteration this session (right
rail, streaming reveal, LLM-driven source ranking, per-user model selector,
etc.). All work from today is on `main`. Render auto-deploys from main; the
Neon prod DB has migrations through 006 applied.

### V1 scope

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 1 | Marketing-tuned system prompt + source ranking | ✅ | Static `source_ranker.py` (~90 domains) + Cloudflare-LLM relevance reranker layered on top. Authoritative badge renders in the right rail. |
| 2 | Brand profile per Clerk user | ✅ | Migration 003. `/brand-profile` GET/PUT. 4-step onboarding wizard. Editable from Settings. |
| 3 | Plays catalog (read-only) | ✅ | 10 plays in `backend/app/plays/catalog.py`. `/api/v1/plays`. Plus a "Recently used" section on the Plays page driven by `messages.play_id`. |
| 4 | Structured outputs | ⚠️ partial | Markdown via Tailwind Typography. Schema-typed render components + PDF export still deferred to V2. |
| 5 | Calculators | ✅ | CAC payback, ROAS→margin, A/B sample size (Acklam invNormal), blended channel efficiency. |
| — | Branding | ✅ | All UI / package / OpenAPI. **GitHub repo not renamed yet** — still `MiniPerplexity`. |

### Beyond the plan

- **React Router pivot** — Home / Chat / Plays / Calc / Settings.
- **Design system** — Inter Variable, single brand accent, class-based dark mode, Button + Card primitives.
- **Inline `[N]` citation pills** that open the source URL in a new tab.
- **Slash menu** (`/`) in composer with fuzzy filter, in-session run.
- **Sessions sidebar** with Postgres FTS, rename, archive, delete, markdown export.

### Shipped this session (2026-05-09)

PRs in chronological order. Each is on `main`.

| PR | Topic |
|---|---|
| [#11](https://github.com/paritoshtripathi935/MiniPerplexity/pull/11) | Home page anchor card + brand chip + last-message previews |
| [#12](https://github.com/paritoshtripathi935/MiniPerplexity/pull/12) / [#13](https://github.com/paritoshtripathi935/MiniPerplexity/pull/13) | Chat redesign: right rail, streaming reveal, live searching panel, authoritative source badge, follow-up presets, sticky conversation header |
| [#14](https://github.com/paritoshtripathi935/MiniPerplexity/pull/14) | Plays history, right rail rebuild (videos+sources, auto-collapse with localStorage), LLM-generated next-step suggestions, streaming-reveal infinite-loop bug fix |
| [#15](https://github.com/paritoshtripathi935/MiniPerplexity/pull/15) | YouTube: 2 → 10 videos w/ Shorts filter; LLM-driven relevance ranking; `RESULTS_PER_ENGINE` 2 → 10 |
| [#16](https://github.com/paritoshtripathi935/MiniPerplexity/pull/16) | Card-style source strip with title + snippet inline |
| [#17](https://github.com/paritoshtripathi935/MiniPerplexity/pull/17) | Lifted sources/videos out of chat thread (right rail is canonical); `max_tokens` 256 → 4096 |
| [#18](https://github.com/paritoshtripathi935/MiniPerplexity/pull/18) | Per-user chat model selector + migrate off deprecated `@cf/meta/llama-3.1-70b-instruct` |

### Shipped this session (2026-05-10)

| PR | Topic |
|---|---|
| [#21](https://github.com/paritoshtripathi935/MiniPerplexity/pull/21) | **PAI-8** — answer latency metric: `/answer` times `generate_answer`, returns `latency_ms`, persists to existing `messages.latency_ms` (no migration), renders "⧗ Answered in 4.2s" hint under each assistant turn (rehydrates on history reload) |

### Shipped 2026-05-11

| PR | Topic |
|---|---|
| [#29](https://github.com/paritoshtripathi935/MiniPerplexity/pull/29) | **Real SSE streaming for `/answer`** (slices A+B). New `POST /api/v1/answer/{session_id}/stream` returning `text/event-stream`; backend uses async `httpx` against Cloudflare with `stream: true`. Frontend `streamAnswer()` parses SSE frames and appends tokens live — no more `setInterval`-based reveal on the search/play paths. Dual-schema handled (`_extract_stream_delta`). Persistence runs after the stream so a mid-flight drop never half-saves a turn. Smoke-tested against `gpt-oss-120b` + Mistral; both stream word-level chunks. Merged with a true merge commit (admin bypass of linear-history). |
| [#31](https://github.com/paritoshtripathi935/MiniPerplexity/pull/31) | **Slice C — Regenerate on streaming + cleanup.** Regenerate now uses the same `runAnswerStream` helper; first token replaces "_Regenerating…_" in place. Replaces `Message.revealedLength: number` with `Message.isStreaming: boolean` — the latter is what actually drives the Writing indicator + cursor + Copy/follow-up visibility. Caught a regression on PR #29 along the way: the new SSE path wasn't setting any reveal state, so those signals were silently lost. Deletes `useStreamingReveal.ts` and the now-unused `getAnswer` / `runPlay` / `fetchAnswer` wrappers. Backend JSON `/answer` endpoint is dead code in this repo but kept for now. |
| [#35](https://github.com/paritoshtripathi935/MiniPerplexity/pull/35) | **PAI-13 / PR A — Operator design tokens + dark-first.** Foundation for the [PAI-13 stack](./PAI_13_PLAN.md). Swaps the theme to the Material 3 purple scheme from the Stitch DESIGN.md. Legacy CSS variables (`--brand`, `--surface`, `--fg`, ...) remapped to M3 roles so existing pages render unchanged — every component inherits the new palette without code changes. Adds the operational type scale (`metric-lg`, `h1`, `h2`, `body-base`, `body-sm`, `label-caps`) and named radii (`card` 12 / `panel` 10 / `chip` 8 / `control` 6). Default theme flipped to dark unless `paidpilot-theme=light` is set; inline script in `index.html` applies `.dark` before React mounts (no FOUC). PRs B–G refit each page to the M3 names. |
| [#37](https://github.com/paritoshtripathi935/MiniPerplexity/pull/37) | **PAI-13 / PR B — "Investigation" rename + AI-buzzword strip.** Routes `/chat/*` → `/investigations/*` with `<Navigate>` redirects preserving sessionId (existing bookmarks land safely). Top-bar "Chat" → "Investigations" (Search icon); Plays icon Sparkles → PlayCircle. Brand chip + LoginPage logo: Sparkles → "P" letterform. Copy strip: "Ask anything paid-acquisition" → "Continue the investigation…", "AI co-pilot" → "operating system for growth teams", "What can I help you ship today?" → "Start by asking what changed, what to test, or what to scale.", "message" → "turn" throughout. Prop rename: `onNewChat` → `onNewInvestigation`. Sparkles icons inside Plays sub-components (SlashMenu, PlayRunModal, PresetBar, ChatRightRail active-play, ModelSelector "recommended") deferred to PRs E/F. HomePage greeting + layout deferred to PR D. |
| [#39](https://github.com/paritoshtripathi935/MiniPerplexity/pull/39) | **PAI-13 / PR C — Command palette (⌘K).** Linear-style modal quick-switcher built on [`cmdk`](https://cmdk.paco.me/) matching the Stitch `command_palette_dark` mock. Groups: Investigations (last 8 sessions + "New investigation") · Plays (catalog) · Calculators · Jump to. Selected row gets the 2px primary left bar. Hotkeys: ⌘K toggle, ⌘N new investigation, ⌘P plays, ⌘E calculators, Esc close, Linear-style G chords (G D / G I / G P / G S). Top-bar trigger: bordered search-pill with kbd hint (sm+), icon-only on mobile. Data fetched lazily on first open, cached 30s — anonymous users skip the sessions fetch. Bundle +17.6 kB gzip (cmdk). The single biggest "feels like Linear" lever per the plan. |
| [#41](https://github.com/paritoshtripathi935/MiniPerplexity/pull/41) | **PAI-13 / PR D — Operational homepage.** Replaces "Good afternoon, Paritosh" + uniform card grid with the operational hub from the Stitch `paidpilot_homepage_dark` mock. Three asymmetric zones: header (`N open investigations · M scenarios pending · last active <relative>`), operational feed (left ~60% — investigations / calculators / dim Meta+Google "Connect X" stubs / optional brand-setup), Continue investigation (right top — 3 recent sessions), Quick actions (right bottom — ⌘N/⌘E/⌘P/⌘K with kbd chips). Real data: `listSessions` + `localStorage` scenario count w/ cross-tab sync via storage event + brand profile. Stubbed rows link to /settings as V2 onramps. Removed: time-based greeting, primary-action anchor card, day-of-week rituals, BrandSnapshot card, ThisWeekStrip. |
| [#43](https://github.com/paritoshtripathi935/MiniPerplexity/pull/43) | **PAI-13 / PR D.1 — Home polish.** Side-by-side fixes after comparing #41 to the Stitch mock: drop the "Operational Hub" h1 (redundant with top-nav "Home" highlight; bullet state line becomes the lead, body-base size); fix "0 scenarios pending" → "no scenarios pending"; adopt Stitch's "→ N scenarios saved" arrow syntax for the Calculators row trailing slot; drop the right-side chevron on linkable feed rows (hover tint communicates affordance). |
| [#44](https://github.com/paritoshtripathi935/MiniPerplexity/pull/44) | **PAI-13 / PR E — Investigation workspace.** Visual refit of the chat surface. Single always-visible investigation header replaces the dual "model-selector toolbar + scroll-triggered sticky bar" pattern: title + `● Active` chip + `N turns` chip + ModelSelector. Drops IntersectionObserver / showStickyHeader / scrollToTop. Right rail header "Context" → "Evidence"; Active play panel Sparkles → PlayCircle (last AI-sparkle on this surface). Per-turn Cite/Open-source decorative buttons + ⋯ overflow menu deferred — citation pills + sessions-sidebar context already cover the function. Functional behavior unchanged. |
| [#46](https://github.com/paritoshtripathi935/MiniPerplexity/pull/46) | **PAI-13 / Logo mark.** Adopts Concept 1 from the Stitch brand-identity export — a "P with chat-tail" silhouette in M3 primary-container (#6750A4). Single-path SVG. New `Logo.tsx` renders the silhouette at `currentColor`. AppLayout brand chip + LoginPage hero swap "P" letterform → `<Logo />`. `public/favicon.svg` / `apple-touch-icon.svg` / `logo-mark.svg` rewritten with the new mark — replaces the indigo sparkle favicons from the pre-PAI-13 brand. |
| [#47](https://github.com/paritoshtripathi935/MiniPerplexity/pull/47) | **PAI-13 / PR F.1 — Calc tabs + focused workspace.** Page-level tabs replace the "all four calcs stacked in column-css" layout with a single-calc workspace per Stitch. Selection persists via `paidpilot-calc-active-tab` localStorage. Tertiary breadcrumb chip top-right. PresetBar Sparkles icon dropped (last AI-decorative sparkle on this surface). Calc internals untouched. |
| [#48](https://github.com/paritoshtripathi935/MiniPerplexity/pull/48) | **PAI-13 / PR F.2 — Scenarios as primary surface.** Lifts scenarios out of each calc's footer into a left-side primary surface per the full Stitch CAC payback mock. New `ScenariosPanel` with stacked rows (name + metric-lg headline + chip-line of inputs + delta vs. previous, semantic green/amber); new `scenarioDisplays.tsx` as single source of truth for per-calc headline + chips + compareFields; new `SaveScenarioButton` replaces the old ScenarioBar footer (collapsed pill → name input + Save). Inline Compare moves to ScenariosPanel. Each calc accepts `registerLoadHandler` so the page bridges ScenariosPanel row clicks into `loadScenario`. `useScenarios` adds same-window broadcast (custom event) so the calc's Save and ScenariosPanel's list stay in sync. Deleted `ScenarioBar.tsx`. |
| [#50](https://github.com/paritoshtripathi935/MiniPerplexity/pull/50) | **PAI-13 / PR G — Motion audit + typography token sweep.** Closes two gaps from a post-F audit. Motion: `animate-ping` on Searching dot → custom `animate-status-blink` (calm 1Hz opacity fade, no halo); `animate-pulse` on StreamingCursor → `animate-cursor-blink` (hard 1Hz blink at `on-surface-variant`, drops the brand-color theatrics CLAUDE.md forbids); video-thumb `group-hover:scale-[1.02]` → border-color shift. Typography: ~133 arbitrary `text-[Npx]` instances swept to type-scale tokens (`text-body-base/sm/md`, `text-label-caps`, `text-h1/h2`); added `body-md` (12px) token. Deleted dead `Answer.tsx` + its type. Net -249 LOC across 23 files. |
| [#52](https://github.com/paritoshtripathi935/MiniPerplexity/pull/52) | **PAI-13 / PR H — Page transitions + Plays/Settings + bundle.** Closes out the PAI-13 stack. (1) Page-enter motion: subtle 180ms fade + 2px lift per route change, keyed on top-level segment so nav within an investigation doesn't re-animate, `motion-safe:` for reduced-motion users. (2) Plays page rebuilt from 3-col card grid → stacked operational list (same row shape for Recently used + catalog); filtered-empty state with reset link. (3) Settings audit: tokens swept to M3 (`outline-variant`, `on-surface`), copy "every chat" → "every investigation". (4) React.lazy + Suspense for /investigations, /plays, /calc, /settings; HomePage stays eager. **Initial bundle 581→326 kB raw, 173→100 kB gzip (-42%).** ChatPage (60 kB gzip) only loads on /investigations. |

### Shipped 2026-05-11 (afternoon)

| PR | Topic |
|---|---|
| [#58](https://github.com/paritoshtripathi935/MiniPerplexity/pull/58) | **Marketing landing + split-layout sign-in.** Carves a dedicated marketing surface off the login screen. New `/` for signed-out users — hero, sources strip, 5-tile bento product showcase (chat with citations / brand profile / calculator sparkline / plays icon grid / source weight bars), how-it-works, deep-dive rows, beta pricing ("free for 6 months — $0"), FAQ, final CTA, footer. New split-layout `/sign-in` with pitch + product mock on the left and the Clerk widget on the right. Clerk widget themed at the provider level (`appearance` config maps PaidPilot dark tokens to Clerk element keys; `UserButton` inherits). "Secured by Clerk" + "Development mode" footer pills hidden via a structural CSS rule (`.cl-footer > :not([class*="cl-footerAction"])`) — visual hide only, Clerk Pro plan required for ToS compliance. Routing: signed-out `/` → LandingPage, `/sign-in/*` → LoginPage, `*` → redirect to `/`. Components live under `frontend/src/components/landing/`. |
| [#59](https://github.com/paritoshtripathi935/MiniPerplexity/pull/59) | **In-app design sweep — match landing.** Audit follow-up. `Button` gains `variant="gradient"` (violet→blue + violet glow) for marquee CTAs. `PageHeader` gains an optional `eyebrow` prop. Cards across HomePage, PlaysPage, SettingsPage, ScenariosPanel, ChatEmptyState, Onboarding, PlayRunModal, CommandPalette migrate from `rounded-card bg-surface-container-low` to landing's `rounded-2xl bg-surface-raised/40`. Title-Case copy lowercased throughout (proper nouns preserved). Citation pills in ChatMessage outlined (`brand/30` + `brand/5`) instead of solid `bg-brand-subtle`. Searching/writing pulse dots switch to emerald-400 to match landing's "live data" convention. SearchBar send, Onboarding Next/Finish, PlayRunModal Run, SessionsSidebar New, SettingsPage Save all swap to gradient variant. Active-session chip → emerald outlined badge. CommandPalette overlay `bg-black/40` → `bg-fg/40 backdrop-blur-sm`. 16 files, +245 / -224, no behavioural changes — token migrations are opportunistic. |

### Migrations applied to prod DB (Neon)

| # | Adds | Why |
| --- | --- | --- |
| 005 | `messages.play_id`, `messages.next_steps jsonb`, partial index on play_id | Plays history aggregation; cached next-step suggestions |
| 006 | `users.preferred_chat_model` | Per-user choice of Cloudflare model for `/answer` |

## LLM model strategy

All three call sites now run on different models per their workload. None use
the deprecated Llama 3.1 70B.

| Call site | Model | Why |
|---|---|---|
| `/answer` (long-form chat) | `@cf/openai/gpt-oss-120b` (default; user-overridable) | Quality > speed |
| `/search` reranker | `@cf/qwen/qwen3-30b-a3b-fp8` (fixed) | Fast structured output |
| `/messages/{id}/next-steps` | `@cf/meta/llama-3.2-3b-instruct` (fixed) | Tiny + fast; 3 short questions |

User-selectable models (UI dropdown at the top of chat):
`gpt-oss-120b` (recommended), `gpt-oss-20b`, `mistral-small-3.1-24b-instruct`,
`qwen3-30b-a3b-fp8`, `qwq-32b`. Whitelist enforced at `PATCH /me/preferred-model`.

## Recurring landmines worth knowing

- **`gh pr merge --squash` races against recent pushes.** Twice this session
  the merge happened against a stale branch HEAD even when the REST API showed
  the latest. Always verify before merging:
  ```bash
  HEAD_SHA=$(curl -sH "Authorization: Bearer $GITHUB_TOKEN" \
    https://api.github.com/repos/paritoshtripathi935/MiniPerplexity/branches/<branch> \
    | python -c "import json,sys; print(json.load(sys.stdin)['commit']['sha'][:8])")
  ```
  Compare against `git rev-parse HEAD | cut -c1-8`. Wait ~10s after the
  final push before invoking `gh pr merge`. Recovery: cherry-pick the missing
  commits onto a follow-up branch.
- **Cloudflare model docs lie.** Three slugs from the docs (`llama-3.3-70b`,
  `kimi-k2.6`, `deepseek-r1-distill-qwen-32b`) returned 404 on this account.
  Always smoke-test before adding to `CHAT_MODEL_CATALOG`.
- **Two response schemas in the wild.** Newer Cloudflare models (gpt-oss,
  qwen3, qwq) use the OpenAI shape (`result.choices[0].message.content`);
  legacy Llama uses `result.response`. `_extract_response_text()` handles
  both — don't bypass it.
- **`expire_on_commit=False` is forced.** Don't touch — `True` causes
  `MissingGreenlet` on commit.
- **No `pool_pre_ping=True`** on the async engine. Use `pool_recycle=180`.
- **Signed-in sessions never auto-expire** (100 yr expires_at). Don't change.

## Pick up next

Real candidates, ranked by leverage:

0. **PAI-13 — Operator design system adoption** ✅ **shipped end-to-end.**
   See [PAI_13_PLAN.md](./PAI_13_PLAN.md). PRs A → H.

00. **Category H — projects + campaigns hierarchy** ✅ **shipped end-to-end.**
    See § H below for the 17-PR list (core + post-H polish) and the
    final route topology.

1. **C1 — Clerk Pro vs custom sign-in UI.** "Secured by Clerk" pill is
   hidden via a CSS hack that violates Clerk free-plan ToS. Resolve
   before sustained prod traffic. Pro is $25/mo zero-engineering; custom
   is ~half a day with `useSignIn()`. Compliance > features. **Most
   urgent.**

2. **A1 — Notion / Slack / PDF export.** Landing FAQ + pricing card
   both promise it; currently only `.md` export of sessions exists.
   ~1 day per integration. Multi-step OAuth for Notion + Slack;
   server-side render via Pyppeteer or wkhtmltopdf for PDF.

3. **A3 — Citation drawer with quoted paragraph.** Landing deep-dive
   promises this. Backend has the snippet; need to persist the actual
   cited span and render a drawer on pill click. ~1 day.

4. **Hierarchy URL purification.** Move `/investigations`, `/plays`,
   `/calc` UNDER the campaign URL (e.g. `/projects/:id/c/:cid/
   investigations`). URL becomes fully authoritative for scope; the
   localStorage active-campaign goes away. ChatPage / PlaysPage /
   CalculatorsPage read `campaignId` from URL params instead of
   `useActiveCampaign`. ~half day.

5. **Delete the JSON `/answer` endpoint** (~5 min). No frontend caller
   after PR #31; `/answer/{session_id}/stream` is the only live path.

6. **GitHub repo rename** — 5 min. Still on
   `paritoshtripathi935/MiniPerplexity`. `gh api -X PATCH
   /repos/paritoshtripathi935/MiniPerplexity --field name=PaidPilot`,
   then update README badges. Old URLs auto-redirect.

7. **Mobile right rail fallback** — ~45 min. Right rail is `lg:` only;
   phones / tablets currently see no source list at all (sources are
   out of the chat thread).

8. **`darkMode` prop-drilling cleanup** — ~30 min. Pages all receive a
   `darkMode: boolean` prop they don't use; only `AppLayout` actually
   reads it for the theme toggle.

V2 lever (multi-day): **Meta Ad Library integration** — the
differentiator that justifies the rebrand. Schema can lean on existing
sessions / search_results / citations.

## Future roadmap

Captured from the marketing landing's implicit promises + the
landing→app design audit + Clerk ToS work. Ordered by category, not
priority. The landing-promises group is implicitly **deadline-driven**:
beta runs through 2026-11-11 and these need to land before the "free
for 6 months" framing rolls over to paid tiers.

### A. Promised on the landing page but not built

Each of these shows up as a real product feature on `/` or in the FAQ.
If a visitor signs up expecting it and we don't have it by GA, that's a
churn risk.

| # | Item | Where promised | Current state | Effort |
| --- | --- | --- | --- | --- |
| A1 | **Export to Notion / Slack / PDF** | Pricing card ("export to notion, slack, pdf"); FAQ "can I export to notion or slack?" answers yes on Team/Enterprise; hero mock shows `notion · slack · .pdf · brief.md` chips | Only markdown export of full sessions exists (`/sessions/{id}/export.md`). No Notion / Slack / PDF | Notion + Slack: each ~1 day (OAuth + API write). PDF: ~half day (server-side render via Pyppeteer or wkhtmltopdf) |
| A2 | **Source weighting UI** | Bento "re-rank the voices you trust"; deep-dive citation drawer | Backend `source_ranker.py` has static authority + LLM rerank, but no user controls. Users can't boost / mute publishers | ~2 days. New `user_source_weights` table; `/me/source-weights` GET/PUT; UI in Settings or a popover next to the source list |
| A3 | **Citation drawer / quoted-paragraph view** | Deep-dive: "expand the citation drawer to see the exact paragraph the number came from"; bento hero | Right rail shows source URL + title + snippet, but not the cited paragraph in context. Snippets come from search API, not the page itself | ~1 day. Persist the actual quoted span per citation; render in a drawer on pill click |
| A4 | **Public API (Enterprise)** | FAQ "do you have an api?" → yes on Enterprise | Backend `/api/v1/*` is the same surface the frontend uses, but no auth scheme for third-party API keys, no rate limit policy per-key, no docs | ~3 days. API-key table + middleware + per-key rate limiter; OpenAPI export; minimal docs page |
| A5 | **Meta / Google Ads connect** | HomePage has dim "Connect Meta" / "Connect Google Ads" stubs; landing mentions platforms | Stubs are dead links pointing at `/settings`. Real OAuth + data sync not built | Same as STATUS's V2 Meta Ad Library lever. Multi-day. |
| A6 | **Brand profile logo + color swatch** | Landing's `BrandProfileMock` shows a gradient logo square next to brand name | Settings has text fields only — no logo upload, no color extraction. The mock implies a richer brand record | ~half day. Add `brand_logo_url`, `brand_color_hex` columns; small upload UI; use the swatch in BrandContextMock-equivalent places (HomePage header, chat brand-context bar) |
| A7 | **`/changelog` route** | Landing nav links to `#changelog` and footer has "Changelog" link | No route. Anchor is dead | ~half day. Static markdown-rendered page reading from `CHANGELOG.md` (would need to start one); or auto-generate from merged PR titles |
| A8 | **`/docs` route** | Landing nav has Docs link | No route. Anchor is dead | ~1 day. Decide: build in-app or external (e.g. Mintlify / a GitBook). Starter content: "what PaidPilot is for", "how citations work", "running plays", "calculator inputs" |
| A9 | **Real product screenshots** | Hero, bento, deep-dive currently use CSS-built mocks | The mocks look intentional but will read as "no real product" to a closer look; AI placeholders were removed for this reason | ~half day once UI stabilises. Capture real screenshots at retina; swap into LandingHero, LandingFeatures, LandingDeepDive. Optional: short Loom-style demo for the "see it in 60 seconds" CTA (currently a no-op button) |
| A10 | **"See it in 60 seconds" video** | Hero secondary CTA | Button is wired but has no handler — no modal, no video | ~half day. Record a 60-second screen capture, host on Mux / Loom, wire up a video modal |
| A11 | **Plays catalog matches landing-listed names** | Landing deep-dive names "meta abo q4 test plan, lifecycle audit, icp refresh, channel allocation, a/b test spec, launch playbook" | `backend/app/plays/catalog.py` has 10 plays with adjacent (not identical) names | ~half day. Cross-reference; rename catalog entries OR rename landing copy. Pick whichever drives clearer marketing |

### B. Pricing / business-model gap

The beta framing ("free for 6 months") expires 2026-11. After that we
need real tiers — but more than just pricing pages: a billing system, a
seat-vs-workspace model, and a way to grandfather beta participants.

| # | Item | Current state | Effort |
| --- | --- | --- | --- |
| B1 | **Paid tier infrastructure** | No Stripe, no `subscriptions` table, no billing webhook handlers | ~3 days. Stripe Checkout + customer portal; `subscriptions` table; `current_period_ends_at` + plan tier on `users`; gate features by plan |
| B2 | **Team / workspace model** | Schema is one `brand_profile` per user; no shared library, no seat concept | ~4 days. New `workspaces` table; `workspace_members(workspace_id, user_id, role)`; migrate `brand_profiles.user_id` → `workspace_id`; shared `messages.workspace_id`; invite + RBAC |
| B3 | **Grandfathered pricing for beta users** | No mechanism | Once B1 lands: a `users.plan_locked_at` column + a "you're on the beta plan" banner in Settings |
| B4 | **Pricing page after beta ends** | Single "$0 for 6 months" card | Build the 3-tier card layout I designed earlier (Solo Free / Team $29/seat / Enterprise Custom) when B1 is ready; gate the CTA behind plan tier |

### C. Auth + Clerk compliance

| # | Item | Current state | Effort |
| --- | --- | --- | --- |
| C1 | **Clerk Pro upgrade OR custom sign-in** | "Secured by Clerk" pill hidden by CSS override — visual only, violates Clerk free-plan ToS | Upgrade Clerk Pro: ~$25/mo, zero engineering, ToS-clean. Alternative: ~half day rebuilding `<SignIn />` with `useSignIn()` hooks — owns more state but no licence dependency. Pick one before serving prod traffic |
| C2 | **Custom auth UI parity (if going custom)** | If we go custom: need email + password, Google OAuth, email verification, password reset, 2FA, OAuth-error states | ~half day end-to-end if we drop 2FA / passwordless and keep just Google + password. Add states incrementally |

### D. Design-system finish work

Drift the audit + landing-sweep didn't fully close.

| # | Item | Current state | Effort |
| --- | --- | --- | --- |
| D1 | **M3 → legacy alias token migration** | Many files still use `text-on-surface`, `bg-surface-container-low`, `border-outline-variant` etc. Resolves to same CSS vars as landing's `text-fg`, `bg-surface-raised`, `border-border`, so visually identical — but naming inconsistency hurts readability | ~half day. Wholesale find-replace + tsc. Touches ~20 files but is mechanical |
| D2 | **Mobile right rail fallback** | Right rail is `lg:` only — phones/tablets see no source list. Already on STATUS's "pick up next" (#3) | ~45 min. Slide-up sheet OR conditional inline strip below `lg` |
| D3 | **`darkMode` prop drilling cleanup** | Pages receive `darkMode: boolean` they don't use; only `AppLayout` reads it. Already on STATUS's "pick up next" (#4) | ~30 min |
| D4 | **Two `tailwind.config.js` files** | Root + `frontend/` both exist, kept in sync manually | ~10 min. Delete the root one, update any reference to it |
| D5 | **Bundle size watch** | PAI-13 PR H got initial to 100 kB gzip. Landing PR added LandingPage chunk (~15 kB). Worth a baseline + budget. | ~30 min. Add bundle-size CI check (`size-limit`) so regressions get caught at PR time |

### E. Investigation surface depth

Things the chat experience implies are first-class but are halfway built.

| # | Item | Current state | Effort |
| --- | --- | --- | --- |
| E1 | **Save-your-own plays** | Already in STATUS's "Open product questions". Schema sketched: `user_plays(user_id, title, instructions, output_format, inputs jsonb)`. Landing's plays bento implies the library grows over time | ~2 days. Table + `/me/plays` CRUD + "Save as play" action on a finished investigation |
| E2 | **Reasoning content toggle** | `qwq-32b` emits `reasoning_content` we currently discard. Already in STATUS's "Open product questions" | ~half day. Persist as `messages.reasoning`; "Show thinking" disclosure in ChatMessage |
| E3 | **Per-turn model override** | Landing's deep-dive says "swap any time". App has per-user default via `ModelSelector` but not per-turn override | ~half day. Carry a `model_override` in the composer state; pass through `/answer/{sid}/stream` |
| E4 | **Structured-output renderers** | V1 plan section 4 marked ⚠️ partial. Plays with a defined output schema (creative brief, channel plan, A/B spec) should render as styled cards, not free-form markdown. Currently all markdown | ~2 days. Per-play schema renderer; "Copy as Markdown" stays; "Export as PDF" feeds A1 |
| E5 | **PDF export for any investigation** | Sessions export as `.md` only | Falls out of A1 (PDF infra) |

### F. Open infra / housekeeping

Already partially in STATUS's "Open infra notes" — keeping here for one-stop visibility.

| # | Item | Current state | Effort |
| --- | --- | --- | --- |
| F1 | **GitHub repo rename** | Still `paritoshtripathi935/MiniPerplexity`. `gh api -X PATCH …` then README badges | ~5 min |
| F2 | **Delete JSON `/answer` endpoint** | No frontend caller after PR #31. Already on STATUS's "pick up next" (#1) | ~5 min |
| F3 | **Render Python version alignment** | `render.yaml` says 3.9, actual runtime is 3.11 | ~10 min |
| F4 | **`render.yaml` + `Procfile` + `gunicorn.conf.py` consistency** | Three slightly different uvicorn invocations | ~15 min |
| F5 | **Stale `__pycache__` / `.pyc`** | Show as modified in git despite gitignore | One-shot cleanup |

### G. Stretch — beyond V1

Net-new product surface, multi-week:

- **Meta Ad Library integration** (already STATUS's "V2 lever"). Live competitive intel rather than blogs about competitive intel.
- **Lifecycle / CRM audit play with real data** — connect to Klaviyo / Customer.io / Braze; surface broken flows + segment gaps instead of having the user describe their setup.
- **Creative iteration loop** — Bring-Your-Own-Image / Figma plugin → variants brief → run against Meta Ad Library benchmarks.
- **Multi-brand workspace switcher** — once B2 (team / workspace model) lands, a brand picker in the top nav for in-house teams running multiple SKUs / DTC brands.

### H. Projects + campaigns hierarchy ✅ SHIPPED 2026-05-13

End-to-end restructure from user-scoped to **project (= brand) →
campaign → session → tools**. Plus the post-H polish landed the
hierarchy as a routed flow (top-nav switches project; project home
lists campaigns; campaign home launches investigations / plays / calc).

**Core stack (Category H plan):**

| # | Topic |
|---|---|
| [#61](https://github.com/paritoshtripathi935/MiniPerplexity/pull/61) | Foundation — migration 007, schema.sql post-007, Category H roadmap, STITCH_PROMPTS_H.md |
| [#64](https://github.com/paritoshtripathi935/MiniPerplexity/pull/64) | Backend ORM — Project + Campaign models; BrandProfile re-keyed to project_id PK; Session anchored with NOT NULL FKs; `ensure_default_project_and_campaign` on auth-upsert |
| [#65](https://github.com/paritoshtripathi935/MiniPerplexity/pull/65) | REST API — 14 endpoints under /projects, /projects/{id}/campaigns, /projects/{id}/brand-profile |
| [#66](https://github.com/paritoshtripathi935/MiniPerplexity/pull/66) | Frontend — top-nav campaign switcher, ActiveCampaignProvider, localStorage source-of-truth |
| [#67](https://github.com/paritoshtripathi935/MiniPerplexity/pull/67) | Frontend — /settings/projects list + detail (campaigns / brand profile tabs) + CampaignDrawer |
| [#68](https://github.com/paritoshtripathi935/MiniPerplexity/pull/68) | Frontend — 3-step onboarding (project → brand → first campaign) renames the default project + General campaign in place |
| [#69](https://github.com/paritoshtripathi935/MiniPerplexity/pull/69) | Migration 008 (drop brand_profiles.user_id) + active-campaign context in system prompt |
| [#70](https://github.com/paritoshtripathi935/MiniPerplexity/pull/70) | docs: STATUS.md marks Category H shipped |

**Post-H polish + fixes (2026-05-13 afternoon):**

| # | Topic |
|---|---|
| [#71](https://github.com/paritoshtripathi935/MiniPerplexity/pull/71) | fix(chat) — separate `<think>` reasoning into a collapsible disclosure, harden citation pills against out-of-range `[N]` markers |
| [#72](https://github.com/paritoshtripathi935/MiniPerplexity/pull/72) | fix(api) — `/brand-profile` 500 after migration 008. Stale `profile.user_id` reference → frontend's `catch {}` swallowed the error → onboarding re-opened on every reload. Echo caller's user_id back |
| [#73](https://github.com/paritoshtripathi935/MiniPerplexity/pull/73) | fix(chat) — qwq-32b digit drop (Cloudflare emits digit-only tokens as JSON numbers, our `isinstance(str)` guards dropped them) + dangling `</think>` synthesis on the frontend |
| [#74](https://github.com/paritoshtripathi935/MiniPerplexity/pull/74) | feat(scope) — `?campaign_id=` filtering on `/sessions` + `/plays/history`. Home, sidebar, and Plays "recently used" re-scope when active campaign changes |
| [#75](https://github.com/paritoshtripathi935/MiniPerplexity/pull/75) | feat(projects) — dashboard variant of projects list: search + status filter + sort + AMPS/INVS metric columns + filtered empty state + switcher popover search |
| [#76](https://github.com/paritoshtripathi935/MiniPerplexity/pull/76) | feat(layout) — collapsible left sidebar (240px ↔ 64px), primary nav moves out of top bar, `[` keyboard shortcut, hover tooltips, mobile drawer below `lg` |
| [#77](https://github.com/paritoshtripathi935/MiniPerplexity/pull/77) | feat(sidebar) — "projects" row added as a top-level sidebar nav entry |
| [#78](https://github.com/paritoshtripathi935/MiniPerplexity/pull/78) | feat(settings) — split account settings from per-project brand profile. `/settings` is now account-only (display name, email, model, theme); brand context lives per project |
| [#79](https://github.com/paritoshtripathi935/MiniPerplexity/pull/79) | feat(nav) — project → campaign → tools hierarchy as routes. New CampaignHomePage at `/projects/:id/c/:cid` with quick-action tiles. Top-nav switcher is project-only |

Migrations 007 + 008 are live on Neon prod. Backfill landed cleanly:
9 projects (6× "My Brand", 2× "Parspec", 1× "Hotel Superhero"), 9
"General" campaigns, 5 brand_profiles re-keyed, 5 sessions reparented,
anonymous sessions deleted.

Frontend design prompts live in
[STITCH_PROMPTS_H.md](./STITCH_PROMPTS_H.md). First generation sits in
`~/Downloads/stitch_paidpilot_projects_campaigns/`.

#### Route topology after #79

```
top-nav pill   (active project only — color dot + name)
    │ click
    ▼
switcher popover  (search + project list, no campaigns)
    │ pick project
    ▼
/projects                              ← projects list (dashboard variant)
/projects/:projectId                   ← project home (campaigns tab + brand profile tab)
/projects/:projectId/c/:campaignId     ← campaign home (Investigations / Plays / Calculators tiles + recent sessions)
                                          │
                                          ├─ /investigations[/:sessionId]    ← still global, scoped via localStorage
                                          ├─ /plays                          ← still global, scoped via localStorage
                                          └─ /calc                           ← still global, scoped via localStorage

/settings           ← Account settings only (display name, email, model, theme)
/settings/projects  ← 302 → /projects   (bookmark redirect)
```

Sidebar (post-#76 / #77):
- 240px expanded ↔ 64px collapsed (toggle = `[` or the pill chevron)
- Primary nav: home / investigations / plays / calculators / projects / settings
- Tooltips on collapsed icons; mobile = slide-over drawer below `lg`

ActiveCampaign provider (`components/ActiveCampaign.tsx`):
- `localStorage.paidpilot-active-campaign-id` is the source of truth for
  the global `/investigations` / `/plays` / `/calc` routes
- URL-driven sync: CampaignHomePage's mount-effect calls
  `swap(projectId, campaignId)`; ProjectDetailPage's mount-effect calls
  `swap(projectId)` to update just the active project
- `_swapProject(projectId, campaignId?)` is the internal API for the
  switcher / pages to mutate active scope

**Still deferred (separate work):**

- **Hierarchy follow-up:** move `/investigations`, `/plays`, `/calc`
  under the campaign URL (e.g. `/projects/:id/c/:cid/investigations`)
  so the URL is fully authoritative for scope and the localStorage
  active-campaign disappears. Bigger refactor — ChatPage / PlaysPage /
  CalculatorsPage have to read `campaignId` from URL params instead of
  `useActiveCampaign`. ~half day.
- **Calculator scenarios stay localStorage.** Re-key to campaign when
  promoted to DB.
- **Workspace / team model (B2)** — projects own `user_id` for now;
  add `workspace_id` later without touching campaign or session FKs.

### H (original) — design + plan reference

Frontend design prompts live in
[STITCH_PROMPTS_H.md](./STITCH_PROMPTS_H.md) (surface prompts + collapsible
sidebar addendum). First generation sits in
`~/Downloads/stitch_paidpilot_projects_campaigns/`.

**Resolved design (from the grill-me interview, 2026-05-12):**

- **Hierarchy:** `user → projects → campaigns → sessions → messages/queries/…`
- **Project = Brand.** `brand_profiles` re-keys from `user_id` PK to
  `project_id` PK. A user can own multiple projects (agency-style, or
  one DTC operator running multiple SKUs). System prompt grounds in the
  active project's brand profile.
- **Campaign = real-world marketing campaign**, time + goal bounded.
  Fields: `name`, `objective text (≤500)`, `starts_on date NULL`,
  `ends_on date NULL`, `archived_at`. Status enum / budget / target
  metric deferred until usage forces the shape.
- **`campaign_id NOT NULL` on sessions.** No loose investigations. Every
  user gets a default project + default "General" campaign auto-created
  on signup; migration replays this for existing users, pulling
  `brand_profiles.company_name` as the project name (fallback "My Brand").
- **Active context = localStorage.** `paidpilot-active-campaign-id` keys
  the whole app. Top-nav switcher replaces the brand chip. Sidebar /
  Home / Plays / Calc all query `WHERE campaign_id = ?`. Switching
  campaigns swaps the entire app context.
- **Uniqueness:** project names unique per-user, campaign names unique
  per-project. Case-insensitive partial indexes (`WHERE archived_at IS NULL`)
  so archived names free up.
- **Latency:** denormalize `project_id` onto sessions (snapshot at
  create-time). System-prompt path becomes two PK lookups
  (session → brand_profile) with no join. Hot session-list path is a
  single covering index hit (`idx_sessions_campaign_last_accessed`).
- **Lifecycle:** `archived_at` soft-archive only, mirroring sessions.
  Hard delete deferred. App-layer invariant: refuse to archive the last
  live project (or last live campaign within a project) so the
  localStorage pointer can never dangle.
- **Anonymous sessions die.** With NOT NULL FKs to project/campaign,
  pre-login sessions can't exist. Migration 007 deletes them; the
  product loses the "try-before-signup" path. Acceptable: Clerk-gated
  prod traffic was already the direction.

| # | Item | Effort |
| --- | --- | --- |
| H1 | **Apply migration 007 to prod (Neon).** Idempotent. Backfills default project + campaign per existing user, reparents sessions, re-keys brand_profiles to project_id PK. | ~15 min including dry-run on a Neon branch |
| H2 | **Backend: ORM + repository updates.** `Project` + `Campaign` models in `db/models.py`; repository methods (`list_projects_for_user`, `list_campaigns_for_project`, `create_session_for_campaign`); `brand_profile` lookup re-keyed to `project_id`; system prompt composes from `project_id` derived off the session. | ~half day |
| H3 | **Backend: API surface.** `GET/POST/PATCH /projects`, `GET/POST/PATCH /projects/{id}/campaigns`, archive endpoints. `POST /api/v1/sessions` accepts `campaign_id` in body. `/me/active-campaign` (GET/PUT) for cross-device active-context sync (still localStorage-first, server is fallback). | ~half day |
| H4 | **Frontend: top-nav switcher + active-campaign store.** Replaces brand chip. `useActiveCampaign()` hook reads localStorage, falls back to user's default campaign. Switching campaigns invalidates the session list cache. | ~half day |
| H5 | **Frontend: projects + campaigns settings page.** CRUD UI for projects (name, brand fields inline), campaigns (name, objective, dates). Lives under `/settings/projects` and `/settings/projects/:id/campaigns`. | ~1 day |
| H6 | **Onboarding wizard updates.** First-time signup creates the user's first project (= where today's brand-profile wizard runs) and "General" campaign as one combined flow. Existing brand profile UI moves into per-project settings. | ~half day |
| H7 | **Drop `brand_profiles.user_id` column.** Follow-up migration `008` once H2 is live and app no longer references the column. Kept temporarily in 007 for rollback safety. | ~5 min |
| H8 | **Composed system prompt with campaign context.** Compose the active campaign's `objective` and date-window into the system prompt below the brand block. ("You're operating in campaign 'Q4 holiday push', objective: 'lift incremental ROAS by 15%', running Nov 14 – Dec 24.") | ~15 min once H2 ships |

**Out of scope for H (tracked elsewhere):**

- Calculator scenarios → DB (stay localStorage; will re-key to campaign when promoted).
- Workspace / team model (B2). Projects own `user_id` for now; add `workspace_id` later without touching the campaign or session FKs.
- Slug-based URLs. uuid identifiers everywhere; revisit only if shareable per-project pages become a feature.

## How to resume tomorrow

```bash
cd "~/iCloud Drive (Archive) - 1/Documents/MiniPerplexity"
git checkout main && git pull --ff-only

# Backend (port 8001 — 8000 is taken by QuantPulse on this machine)
cd backend && source venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload &

# Frontend
cd ../frontend
VITE_API_HOST=http://127.0.0.1:8001 npx vite --host 127.0.0.1 --port 5173 &

# Open
# http://127.0.0.1:5173             front door (login → home)
# http://127.0.0.1:8001/health/db   readiness probe
```

Kill: `lsof -ti :8001 -i :5173 | xargs kill`

To push: `./scripts/push.sh -m "feat(...): ..."` (token in `.env.git`).

## Repo map

```
backend/
  app/
    api/v1/                # FastAPI routers — query_handler, brand_profile, plays
    auth/                  # Clerk JWT verification (JWKS cache + JIT provisioning)
    core/settings.py       # Pydantic settings; TITLE = "PaidPilot API"
    db/
      config.py            # Reads DATABASE_URL{,_UNPOOLED} from .env
      engine.py            # async engine + sessionmaker
      models.py            # ORM
      repository.py        # All DB queries
    plays/catalog.py       # 10 plays
    services/
      language_model.py    # CloudflareChat — schema-tolerant extractor,
                           # CHAT_MODEL_CATALOG, generate_next_steps,
                           # score_search_results, max_tokens controls
      system_prompt.py     # Persona + brand + play composer
      source_ranker.py     # Static authority + tag_authority_in_place;
                           # rerank() accepts llm_scores override
      search_service.py    # Bing + Google CSE (10 results each) + YouTube
                           # (15 candidates → Shorts-filtered to 10)

frontend/
  src/
    components/
      ui/                  # Button, Card primitives
      AppLayout.tsx        # Sticky top nav + Outlet
      ChatMessage.tsx      # Document-style turn — citation pills (URL-direct),
                           # next-step chips, Copy/Regenerate. No more inline
                           # source/video strips — right rail owns those.
      ChatRightRail.tsx    # Active play + Videos (≤6) + Sources (cards),
                           # auto-collapse with 10s pop on new content,
                           # localStorage manual override
      ChatEmptyState.tsx   # Brand-aware starter prompts
      ModelSelector.tsx    # Chat-model dropdown (top of chat panel)
      SearchBar.tsx        # Composer — slash menu, URL paste-to-chip,
                           # active-play chip
      SlashMenu.tsx
      PlayRunModal.tsx
      SessionsSidebar.tsx
      Onboarding.tsx
      LoginPage.tsx
    hooks/
      useStreamingReveal.ts # Per-message reveal animation (ref-based progress)
    utils/
      url.ts               # getDomain, isValidUrl
      messageShape.ts      # applyAssistantAnswer, normaliseSearchResults,
                           # rehydrateMessages
    pages/                 # HomePage, ChatPage, PlaysPage, CalculatorsPage,
                           # SettingsPage
    services/api.ts        # All backend calls + types (UserProfile,
                           # ChatModelOption, PlayHistoryItem, …)

docs/
  product/
    V1_PLAN.md             # Original PM plan
    STATUS.md              # ← you are here
  database/
    schema.sql             # Canonical DDL for fresh installs
    migrations/            # 001 Clerk auth, 002 FTS, 003 brand profile,
                           # 004 keep authenticated sessions,
                           # 005 play_id + next_steps,
                           # 006 users.preferred_chat_model
```

## Open infra notes

- **Two `tailwind.config.js`** files (root + `frontend/`). Both kept in sync.
  Worth deleting the root one.
- **Render deploy** runs Python 3.11 even though `render.yaml` says
  `python3.9`. Worth aligning.
- **`render.yaml` + `Procfile` + `gunicorn.conf.py`** all start uvicorn
  slightly differently. Procfile is what Render actually uses on free tier.
- **`backend/app/__pycache__`** etc. are gitignored, but some `.pyc` files
  still appear modified. `find . -name __pycache__ -exec rm -rf {} +` for a
  clean slate.

## Open product questions

- **Save-your-own plays**: deferred to V2. Schema would be `user_plays`
  table with `(user_id, title, instructions, output_format, inputs jsonb)`.
- **Citations**: the system prompt asks for `[N]` markers; gpt-oss-120b
  follows the directive more consistently than the old Llama did.
- **Reasoning content**: qwq-32b emits a `reasoning_content` chain we
  currently discard. Could surface as a "Show thinking" toggle later.

## Branch state

`main` carries everything. Open PRs (not from this session):
[#1](https://github.com/paritoshtripathi935/MiniPerplexity/pull/1) — Tavily
search provider (pre-existing, not touched today).
