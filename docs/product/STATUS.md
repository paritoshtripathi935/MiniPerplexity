# PaidPilot — status & handoff

> **Read this first when you come back.** Living doc — update it as work lands.
> Last updated: 2026-05-11 · branch: `main` (everything below is merged)

## Where we are

V1 is shipped. The 2026-05-09 session reshaped the chat surface (right
rail, streaming reveal, LLM-driven source ranking, per-user model
selector). 2026-05-10 patched a few small chat regressions (PAI-5, PAI-8,
PAI-12). 2026-05-11 turned the Calculators page into the **Growth
Decision Engine** (PAI-9, four PRs) and shipped a one-line prod fix for
the gunicorn timeout that was a no-op since #20.

All work is on `main`. Render auto-deploys from main; the Neon prod DB
has migrations through 006 applied (no new migrations from PAI-9 — it's
client-only and uses localStorage for scenarios).

### V1 scope

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 1 | Marketing-tuned system prompt + source ranking | ✅ | Static `source_ranker.py` (~90 domains) + Cloudflare-LLM relevance reranker layered on top. Authoritative badge renders in the right rail. |
| 2 | Brand profile per Clerk user | ✅ | Migration 003. `/brand-profile` GET/PUT. 4-step onboarding wizard. Editable from Settings. |
| 3 | Plays catalog (read-only) | ✅ | 10 plays in `backend/app/plays/catalog.py`. `/api/v1/plays`. Plus a "Recently used" section on the Plays page driven by `messages.play_id`. |
| 4 | Structured outputs | ⚠️ partial | Markdown via Tailwind Typography. Schema-typed render components + PDF export still deferred to V2. |
| 5 | Calculators | ✅ | Now a **Growth Decision Engine** (PAI-9): CAC payback, ROAS→margin, A/B sample size, blended channel efficiency, each with Insight verdicts, reverse-mode targeting, scenario save/compare with deltas, recommendations engine, sliders, and SaaS/D2C/Marketplace presets. |
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
| [#22](https://github.com/paritoshtripathi935/MiniPerplexity/pull/22) | **PAI-5** — render markdown tables via `remark-gfm` |
| [#23](https://github.com/paritoshtripathi935/MiniPerplexity/pull/23) | **PAI-12** — load chat history when arriving at `/chat/:id` from Home |

### Shipped this session (2026-05-11)

| PR | Topic |
|---|---|
| [#24](https://github.com/paritoshtripathi935/MiniPerplexity/pull/24) | Rename `gunicorn_config.py` → `gunicorn.conf.py` so auto-discovery actually loads `timeout=120` (the #20 fix was a no-op because Render's start command doesn't pass `-c`) |
| [#25](https://github.com/paritoshtripathi935/MiniPerplexity/pull/25) | **PAI-9 §1** — split monolithic `Calculators.tsx` into per-file modules under `components/calculators/`, add `benchmarks.ts` thresholds + `<Insight>` banner (good / warn / bad) on every calc |
| [#26](https://github.com/paritoshtripathi935/MiniPerplexity/pull/26) | **PAI-9 §2** — forward / reverse toggle on every calc; each calc supports entering a target outcome and computes the required input (bisection for sample size) |
| [#27](https://github.com/paritoshtripathi935/MiniPerplexity/pull/27) | **PAI-9 §3** — scenario save / load / duplicate / delete + inline compare table with arrow + percent delta highlighting; localStorage-backed, cross-tab synced |
| [#28](https://github.com/paritoshtripathi935/MiniPerplexity/pull/28) | **PAI-9 §4–§6** — recommendations engine (ranked next-step actions per calc), sensitivity sliders on the main lever per calc, industry presets (SaaS / D2C / Marketplace) broadcast via React context |

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
- **Worktree branch-creation can land in the wrong worktree.** Chained
  `cd .. && git checkout -b ...` from the elastic worktree once landed
  the new branch on the *main* worktree (which then blocked subsequent
  pushes with "branch already used by worktree"). Recovery: stash WIP,
  `git -C <main-worktree-path> checkout main && git branch -D <stray>`,
  recreate the branch in the elastic worktree, `git stash pop`. Prefer
  unchained `git -C` for cross-worktree ops.
- **`gunicorn.conf.py`, not `gunicorn_config.py`.** Gunicorn's config
  auto-discovery only matches the dotted name. Render's start command
  doesn't pass `-c`, so the file name is the only thing keeping
  `timeout=120` alive. Fixed in #24 — don't rename it back.
- **macOS filesystem case-collisions silently break vite.** `tsc` is
  case-insensitive on darwin; rollup is case-strict. Don't ship two
  files in the same dir whose names differ only in case
  (e.g. `recommendations.ts` + `Recommendations.tsx`) — `vite build`
  fails even though `tsc --noEmit` passes. Fixed by renaming the
  component (now `RecommendationsList.tsx`).
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

1. **Real SSE streaming** — 1–2 hr backend + ~30 min frontend. The
   client-side reveal hook in `frontend/src/hooks/useStreamingReveal.ts` is
   already shaped to swap `setInterval` → `EventSource`. Backend would change
   `/answer` to stream Cloudflare tokens. Kills the "post-fetch reveal"
   illusion in favour of real first-token latency.

2. **GitHub repo rename** — 5 min. Still on `paritoshtripathi935/MiniPerplexity`.
   `gh api -X PATCH /repos/paritoshtripathi935/MiniPerplexity --field name=PaidPilot`
   then update README badges. Old URLs auto-redirect.

3. **PAI-9 follow-ups** — three deferred items from the Growth Decision
   Engine epic:
   - **Benchmark stages** (Seed / Growth / Enterprise) overlaid on the
     existing thresholds in `frontend/src/components/calculators/benchmarks.ts`.
     ~1 hr; same shape as PR #25.
   - **Calculators UX restructure** (progressive disclosure / primary
     calc focus / secondary minimised). Its own design pass — not a
     code-only PR.
   - **Mobile preset bar + slider polish** for the calculators page.

4. **Mobile right rail fallback** — ~45 min. The chat right rail is `lg:` only,
   so phones/tablets currently see no source list at all (sources are out
   of the chat thread). Either show a slide-up sheet on mobile or
   conditionally render an inline strip below `lg`.

5. **`darkMode` prop-drilling cleanup** — ~30 min. Pages all receive a
   `darkMode: boolean` prop they don't use; only `AppLayout` actually reads
   it for the theme toggle. Frontend agent flagged it as a design-system
   violation.

6. **Bundle size pass** — `React.lazy`-splitting the chat route would
   trim the home/plays initial load. Current bundle holds at 210 kB /
   65 kB gzip after PAI-9 (no growth over four PRs).

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
      calculators/         # Growth Decision Engine (PAI-9)
        index.tsx          # <Calculators> + PresetProvider/PresetBar exports
        CalcCard.tsx       # Card chrome + Field, Result, inputCls
        Insight.tsx        # good/warn/bad banner under each calc's results
        ModeToggle.tsx     # Forward / Reverse segmented control
        ScenarioBar.tsx    # Save / load / duplicate / delete chips + Compare
        ScenarioCompare.tsx# Inline delta table (baseline = first column)
        useScenarios.ts    # localStorage-backed hook keyed by calcId
        Slider.tsx         # Range input on the brand-accent track
        RecommendationsList.tsx # Numbered next-step list under Insight
        PresetBar.tsx      # SaaS / D2C / Marketplace chip selector
        PresetContext.tsx  # apply()-tick broadcast (no clobber on mount)
        benchmarks.ts      # Healthy/warn/bad thresholds + classifiers
        recommendations.ts # Per-calc ranked next-step generators
        presets.ts         # Industry default values
        formatters.ts      # fmtMoney / fmtMonths / fmtPct
        stats.ts           # invNormal (Acklam)
        CACPaybackCalc.tsx
        ROASToMarginCalc.tsx
        SampleSizeCalc.tsx
        BlendedEfficiencyCalc.tsx
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
