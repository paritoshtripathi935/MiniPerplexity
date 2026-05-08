# Database Design — MiniPerplexity on Neon

This folder contains the database design for migrating MiniPerplexity from in-memory state (`chat_sessions` dict in `query_handler.py`) to a persistent Postgres database hosted on [Neon](https://neon.tech).

## Files

| File | Purpose |
| --- | --- |
| [schema.md](schema.md) | Detailed schema design: tables, columns, relationships, justifications |
| [erd.md](erd.md) | Entity-Relationship diagram (Mermaid) |
| [schema.sql](schema.sql) | Full DDL — ready to execute on Neon |
| [migrations.md](migrations.md) | Migration strategy from in-memory to DB |
| [indexes-and-performance.md](indexes-and-performance.md) | Index design, query patterns, performance notes |

## Why Neon?

- **Serverless Postgres** — autoscale to zero, pay only for active compute.
- **Branching** — git-style DB branches for staging/preview environments.
- **Native `pgvector`** support — leaves the door open for future semantic search / embedding cache without migrating providers.
- **Generous free tier** — fits the demo nature of MiniPerplexity.
- Standard Postgres wire protocol — works with `asyncpg`, `psycopg`, SQLAlchemy, Alembic with no vendor lock-in.

## High-level data model

```
users (optional, anonymous-friendly)
  └── sessions (replaces in-memory chat_sessions)
        ├── queries (each user query in a session)
        │     └── search_results (web/YouTube/custom URL results per query)
        └── messages (chat transcript: user + assistant)
              └── citations (which search_results were cited in an answer)

rate_limits        — durable rate-limit counters (replaces in-memory limiter)
api_usage_logs     — per-request observability
content_cache      — cached custom-URL fetches to avoid re-scraping
```

See [schema.md](schema.md) for the full breakdown.

## Setup (running the DB locally)

The backend expects two URLs in `backend/.env`:

```
DATABASE_URL=postgresql://USER:PASS@ep-xxx-pooler.neon.tech/neondb?sslmode=require
DATABASE_URL_UNPOOLED=postgresql://USER:PASS@ep-xxx.neon.tech/neondb?sslmode=require
```

`DATABASE_URL` (pooled) is what the FastAPI app uses. `DATABASE_URL_UNPOOLED` (direct) is used by `scripts/init_db.py` and Alembic — pooled endpoints can choke on `CREATE EXTENSION` / `CREATE TYPE`.

Other DB-related env vars (already present in your `.env`):

| Var | Default | Purpose |
| --- | --- | --- |
| `DB_POOL_SIZE` | `5` | SQLAlchemy connection pool size |
| `DB_POOL_OVERFLOW` | `10` | Pool overflow |
| `IS_DB_ECHO_LOG` | `false` | Log all SQL when `true` |
| `IS_DB_EXPIRE_ON_COMMIT` | `false` | SQLAlchemy expire-on-commit |
| `SESSION_TTL_SECONDS` | `600` | Session inactivity TTL (matches old in-memory limit) |
| `DB_CLEANUP_INTERVAL_SECONDS` | `300` | How often the lifespan task evicts expired sessions |

### First-time bootstrap

```bash
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python -m scripts.init_db          # applies docs/database/schema.sql to Neon
uvicorn app.main:app --reload      # boots with DB-backed sessions
```

### Health checks

- `GET /health` — liveness; does not touch the DB.
- `GET /health/db` — readiness; returns `{"status":"healthy","database":"connected"}` after a `SELECT 1` round-trip.

## What changed in the app

- `chat_sessions: Dict[str, SessionData]` (in-memory) → `sessions` table on Neon.
- Query history, search results, citations, and full chat transcripts are all persisted on every `/search` and `/answer` call.
- `cleanup_expired_sessions()` runs as a background task in the FastAPI lifespan rather than inline on each request.
- Public API (`POST /api/v1/search/{id}`, `POST /api/v1/answer/{id}`, `DELETE /api/v1/session/{id}`, `GET /api/v1/session/{id}/history`) is unchanged — frontend needs no updates.

The implementation lives in [`backend/app/db/`](../../backend/app/db/) and the bootstrap script in [`backend/scripts/init_db.py`](../../backend/scripts/init_db.py).
