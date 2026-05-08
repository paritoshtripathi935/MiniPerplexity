# PaidPilot — status & handoff

> **Read this first when you come back.** Living doc — update it as work lands.
> Last updated: 2026-05-08 · branch: `feature/neon-database`

## Where we are

V1 is essentially shipped. Every item from [V1_PLAN.md](V1_PLAN.md) is done or
deliberately deferred. The branch has not been merged to `main` yet.

### V1 scope

| # | Item | Status | Notes |
| --- | --- | --- | --- |
| 1 | Marketing-tuned system prompt + source ranking | ✅ | `backend/app/services/system_prompt.py`, `source_ranker.py` (~90 domains scored). The frontend does **not** yet show an "authoritative" badge on sources — see "Pick up next" below. |
| 2 | Brand profile per Clerk user | ✅ | Migration 003 applied. `/brand-profile` GET/PUT. 4-step onboarding wizard fires on first sign-in. Editable from Settings. |
| 3 | Plays catalog (read-only) | ✅ | 10 plays in `backend/app/plays/catalog.py`. `/api/v1/plays`. Full-page grid + run modal. Slash menu in chat composer. |
| 4 | Structured outputs | ⚠️ partial | Each play has an `output_format` baked into the system prompt — the LLM produces marker-down sections that render via Tailwind Typography. Schema-typed render components + PDF export are deferred to V2. Markdown export already works. |
| 5 | Calculators | ✅ | CAC payback, ROAS→margin, A/B sample size (Acklam invNormal), blended channel efficiency. |
| — | Branding pass | ✅ | Name, package.json, README, login page, OpenAPI title. **GitHub repo not renamed yet** — still `MiniPerplexity`. One `gh api -X PATCH` away. |

### Beyond the plan (shipped opportunistically)

- **React Router pivot** — Home / Chat / Plays / Calc / Settings.
- **Design system overhaul** — Inter Variable, single brand accent, tokens, class-based dark mode, Button + Card primitives, focus rings.
- **Inline `[N]` citation pills** that scroll-anchor to the source strip and flash.
- **Regenerate** button on assistant turns (re-calls `/answer`, doesn't re-search).
- **Slash menu** (`/`) in composer with fuzzy filter, keyboard nav, in-session run.
- **Chat sidebar** with FTS (Postgres tsvector + websearch_to_tsquery), rename, archive, delete, markdown export.
- **Push script hardened** after a token leak (token now passed via `git -c http.extraHeader`, never embedded in URLs; both stdout & stderr scrubbed).
- **Branch protection** live on `MiniPerplexity`, `QuantPulse`, `MiniHarvery` (Option B: PR required, 0 reviewers, linear history, no force-push, no deletion, admin bypass on).

### Production fixes shipped this week

| Date | Bug | Fix |
| --- | --- | --- |
| 2026-05-08 | `MissingGreenlet` on Render | Drop `pool_pre_ping`, use `pool_recycle=180` (sqlalchemy#9509 race). |
| 2026-05-08 | `MissingGreenlet` on `/brand-profile` | Force `expire_on_commit=False` regardless of env. |
| 2026-05-08 | "Chats not visible after a few minutes" | Migration 004: `expires_at = now + 100yr` for owned sessions; cleanup query adds `user_id IS NULL`. |

## Pick up next

Three options, ranked by leverage:

1. **"Authoritative source" badge in chat** — 30 min. Backend already tags `_authoritative: true` on every search result via `source_ranker.py`. Frontend just needs to render a small "verified" mark next to the source pill in `ChatMessage.tsx::SourceStrip`. Closes the loop on V1 #1's promise.

2. **Streaming answers** — 1–2 hr. First pass: fake client-side reveal (split the answer into tokens, append at ~20 ms intervals so the UI feels alive instead of flash-completing). Real SSE later (backend change to `/answer` + `EventSource` on the frontend). Massive perceived-latency win.

3. **GitHub repo rename** — 5 min. `gh api -X PATCH /repos/paritoshtripathi935/MiniPerplexity --field name=PaidPilot` then update the README badges that still say MiniPerplexity. Old URLs auto-redirect on GitHub.

Or jump to **V2**: Meta Ad Library is the obvious starter — it's the differentiator that justifies the rebrand, and the schema can lean entirely on what's already built (sessions, search_results, citations).

## How to resume tomorrow

```bash
cd "~/iCloud Drive (Archive) - 1/Documents/MiniPerplexity"
git checkout feature/neon-database
git pull --ff-only

# Backend (port 8001 — 8000 is taken by QuantPulse on this machine)
cd backend && source venv/bin/activate
uvicorn app.main:app --host 127.0.0.1 --port 8001 --reload &

# Frontend
cd ../frontend
VITE_API_HOST=http://127.0.0.1:8001 npx vite --host 127.0.0.1 --port 5173 &

# Open
# http://127.0.0.1:5173        front door (login → home)
# http://127.0.0.1:8001/health/db   readiness probe
# http://127.0.0.1:8001/docs        OpenAPI swagger
```

To kill: `lsof -ti :8001 -i :5173 | xargs kill`

To push (token in `backend/.env.git` is `repo`-scoped):
```bash
./scripts/push.sh -m "feat(...): ..."
```

## Repo map

```
backend/
  app/
    api/v1/                # FastAPI routers — query_handler, brand_profile, plays
    auth/                  # Clerk JWT verification (JWKS cache + JIT user provisioning)
    core/settings.py       # Pydantic settings; TITLE = "PaidPilot API"
    db/
      config.py            # Reads DATABASE_URL{,_UNPOOLED} from .env, strips libpq params
      engine.py            # async engine + sessionmaker (expire_on_commit=False, pool_recycle=180)
      models.py            # ORM mirroring docs/database/schema.sql
      repository.py        # All DB queries — sessions, queries, messages, search_results,
                           # citations, brand profiles, FTS
    plays/catalog.py       # 10 hand-written plays
    services/
      language_model.py    # CloudflareChat (LLM call) — accepts system_override
      system_prompt.py     # Persona + brand block + play block composer
      source_ranker.py     # Domain-authority re-ranking
      search_service.py    # Bing + Google CSE + custom URL fetch
  scripts/
    init_db.py             # Apply schema.sql to a fresh Neon db
    apply_migration.py     # Run a single migration file from docs/database/migrations/

frontend/
  src/
    components/
      ui/                  # Button, Card primitives
      AppLayout.tsx        # Sticky top nav + Outlet
      ChatMessage.tsx      # Document-style turn renderer + citation pills + Copy/Regenerate
      SearchBar.tsx        # Composer (auto-grow textarea, ⌘↵, slash menu)
      SlashMenu.tsx        # Plays popover for slash commands
      PlayRunModal.tsx     # Shared input modal (Plays page + slash menu)
      SessionsSidebar.tsx  # Chats + FTS + rename/archive/delete/export
      Onboarding.tsx       # 4-step brand profile wizard
      LoginPage.tsx        # Marketing surface
    pages/
      HomePage.tsx
      ChatPage.tsx         # URL-driven sessionId; pending-play handoff; in-session slash plays
      PlaysPage.tsx
      CalculatorsPage.tsx
      SettingsPage.tsx     # Brand profile editor
    services/api.ts        # All backend calls + types

docs/
  product/
    V1_PLAN.md             # Original PM plan (proposal status)
    STATUS.md              # ← you are here
  database/
    README.md
    schema.md              # Design rationale per table
    schema.sql             # Canonical DDL for fresh installs
    erd.md                 # Mermaid ER diagram
    migrations.md          # Migration strategy
    indexes-and-performance.md
    migrations/            # Numbered SQL: 001 Clerk auth, 002 FTS, 003 brand profile,
                           # 004 keep authenticated sessions
```

## Open infra notes

- **Two `tailwind.config.js`** files — one at repo root (legacy), one in `frontend/` (the one PostCSS uses). Both are kept in sync currently. Worth deleting the root one in a follow-up.
- **Render deploy** is on Python 3.11 even though `render.yaml` says `python3.9`. Worth bumping the file to match reality.
- **`render.yaml`** + **`Procfile`** + **`gunicorn_config.py`** all start uvicorn slightly differently. Pick one. (Procfile is what Render actually uses for free tier.)
- **`backend/app/__pycache__`** etc. are now gitignored, but a few stale `.pyc` files may still exist locally. `find . -name __pycache__ -exec rm -rf {} +` if you want a clean slate.

## Open product questions

- **Save-your-own plays**: deferred to V2 per the plan. Schema would be a `user_plays` table with `(user_id, title, instructions, output_format, inputs jsonb)`.
- **Citations on the LLM output**: the system prompt asks for `[N]` markers but the model occasionally forgets. Tightening the persona's instruction (or moving to Claude Sonnet, which respects the directive much more consistently than the current Cloudflare LLaMA 3.1 70B) is a small lift.
- **Streaming**: `/answer` is currently single-shot. SSE would require a backend change. See "Pick up next" #2.

## Branch state

- `main` — last seen pre-pivot ("Mini Perplexity" branding).
- `feature/neon-database` — everything in this doc. Not merged. PR template is `https://github.com/paritoshtripathi935/MiniPerplexity/pull/new/feature/neon-database`.

When you do open the PR: branch protection on `main` requires PR (0 reviewers OK), conversation resolution, linear history, no force-push, no deletion. You can self-approve since you're admin.
