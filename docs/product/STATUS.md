# PaidPilot — status & handoff

> **Read this first when you come back.** Living doc — update it as work lands.
> Last updated: 2026-05-11 (PAI-13 PR E) · branch: `main` (everything below is merged)

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

0. **PAI-13 — Operator design system adoption** (in progress).
   Stacked-PR plan, 7 slices. Full plan in
   [PAI_13_PLAN.md](./PAI_13_PLAN.md). **PR A (#35), PR B (#37),
   PR C (#39), PR D (#41), PR D.1 (#43), PR E (#44) shipped.**
   Next up: **PR F — Calculators as scenario workspaces.** Rebuild
   the CAC Payback calculator per the Stitch
   `cac_payback_calculator_dark` mock — scenarios stacked on the left
   (one dominant active row, others recede), Active Model Variables
   form on the right with drift indicators per input, empty-state
   per the Stitch mock. Apply the same shape to ROAS→Margin, A/B
   Sample Size, and Blended Channel Efficiency (split per-calc if
   the diff gets unwieldy). Medium blast radius — calculator components
   are isolated, but four of them exist.

1. **Delete the JSON `/answer` endpoint** (~5 min). No frontend caller
   after PR #31. Drop the `@router.post("/answer/{session_id}")` block in
   `backend/app/api/v1/query_handler.py` and its model imports if no
   other route uses them. `/answer/{session_id}/stream` remains the only
   answer path. Keep `CloudflareChat.generate_answer` for now — it's
   still the non-streaming sibling and may be useful for batch jobs.

2. **GitHub repo rename** — 5 min. Still on `paritoshtripathi935/MiniPerplexity`.
   `gh api -X PATCH /repos/paritoshtripathi935/MiniPerplexity --field name=PaidPilot`
   then update README badges. Old URLs auto-redirect.

3. **Mobile right rail fallback** — ~45 min. The right rail is `lg:` only,
   so phones/tablets currently see no source list at all (sources are out
   of the chat thread). Either show a slide-up sheet on mobile or
   conditionally render an inline strip below `lg`.

4. **`darkMode` prop-drilling cleanup** — ~30 min. Pages all receive a
   `darkMode: boolean` prop they don't use; only `AppLayout` actually reads
   it for the theme toggle. Frontend agent flagged it as a design-system
   violation.

5. **Bundle size pass** — JS bundle grew 209 → 460 kB (gzip 64 → 137 kB)
   over the session. `React.lazy`-splitting the chat route would help the
   home/plays initial load.

V2 lever (multi-day): **Meta Ad Library integration** — the differentiator
that justifies the rebrand. Schema can lean on existing sessions /
search_results / citations.

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
