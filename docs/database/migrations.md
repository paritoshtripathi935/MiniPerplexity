# Migration Strategy

How we move from the current in-memory state to a Neon-backed Postgres without breaking the live demo.

## Stack choice

- **Neon** for managed Postgres (serverless, branching, free tier).
- **SQLAlchemy 2.0 (async)** + **`asyncpg`** as the driver. SQLAlchemy gives us typed Core/ORM and works cleanly with FastAPI's `Depends`.
- **Alembic** for migrations (autogenerate from SQLAlchemy models, but every migration is hand-reviewed).
- **`pgcrypto`** + **`citext`** extensions (already in [`schema.sql`](schema.sql)).

> **Why not raw SQL + `asyncpg` only?** It works fine, and is faster, but Alembic gives versioned migrations for free. We can drop down to raw `asyncpg` for hot paths (e.g. rate limiting) if profiling justifies it.

## Environment

Add to `backend/requirements.txt`:

```
sqlalchemy[asyncio]>=2.0
asyncpg>=0.29
alembic>=1.13
```

Add to settings ([`backend/app/core/settings.py`](../../backend/app/core/settings.py)):

```python
DATABASE_URL: str  # postgresql+asyncpg://user:pass@ep-xxx.neon.tech/neondb?sslmode=require
DATABASE_POOL_SIZE: int = 5
DATABASE_MAX_OVERFLOW: int = 10
```

Neon connection strings include `?sslmode=require` and a project-scoped endpoint. Store the URL in Render's secret manager — never commit it.

## Phased rollout

The backend currently has zero persistent state, so we do **not** need data migration — only code migration. Phasing keeps each PR small and reversible.

### Phase 1 — Stand up the schema (no app changes)

1. Create Neon project + dev branch.
2. Run [`schema.sql`](schema.sql) once on the dev branch to verify it applies cleanly.
3. Initialize Alembic (`alembic init backend/migrations`), point its `sqlalchemy.url` at `DATABASE_URL`.
4. Generate the first revision so future schema changes flow through Alembic. The first revision body matches `schema.sql` exactly.

**Rollback:** drop the Neon branch — nothing in the app depends on it yet.

### Phase 2 — Persist sessions and messages

Replace `chat_sessions: Dict[str, SessionData]` in [`query_handler.py`](../../backend/app/api/v1/query_handler.py) with DB-backed reads/writes.

- Add a `SessionRepository` (`get_or_create`, `touch`, `delete`).
- Add a `MessageRepository` (`append_user`, `append_assistant`, `list_for_session`).
- Keep the public API surface (`/search/{session_id}`, `/answer/{session_id}`, etc.) **identical** — frontend keeps sending the same `session_id` in the URL and we use it as the PK.
- Replace the synchronous `cleanup_expired_sessions()` with a periodic background task (FastAPI lifespan event) that calls the SQL function `cleanup_expired()` from [`schema.sql`](schema.sql).

**Tests:** add async pytest fixtures spinning up a Neon **branch per CI run** (Neon's branching is essentially free) so tests get a real Postgres without container overhead.

**Rollback:** the in-memory implementation stays behind a feature flag (`USE_DB_SESSIONS=false`) until the DB path bakes in production for a week.

### Phase 3 — Persist queries, search results, citations

These are write-once. Wire them up in `search()` and `get_answer()`:

- Each call to `perform_search` creates a `query` row + N `search_result` rows in one transaction.
- Each `cf_chat.generate_answer` response creates an `assistant` `message` + N `citation` rows.

**Backfill?** Nothing to backfill — the in-memory data never persisted.

### Phase 4 — Move rate limiting and content caching

- Replace [`rate_limter.py`](../../backend/app/utils/rate_limter.py) with the `rate_limits` table using the upsert pattern documented in `schema.md`.
- Wrap `fetch_content_from_custom_url` with a check against `content_cache` keyed on `sha256(url)`.

**Rollback:** revert the commit; the limiter falls back to in-memory.

### Phase 5 — Observability

Add a FastAPI middleware that writes one `api_usage_logs` row per request (fire-and-forget via `BackgroundTasks` so it never blocks the response).

## Alembic conventions

- One concern per migration. No "misc cleanup" revisions.
- `alembic revision -m "descriptive_name"` — descriptive_name uses `snake_case` and starts with a verb (`add_sessions_table`, `backfill_session_titles`).
- Every migration has a working `downgrade()`. If a downgrade is genuinely impossible (data loss), say so in the docstring.
- Long-running data migrations are split: schema change first (fast, reversible), then a separate data-fill migration that's resumable.

## Local development

1. `neon branches create --name dev-<your-handle>` — your private branch.
2. Export `DATABASE_URL` for that branch.
3. `alembic upgrade head`.
4. `uvicorn app.main:app --reload`.

For tests, CI creates a fresh branch per workflow and deletes it on completion.

## Production deploy checklist

- [ ] Neon project on the `prod` branch.
- [ ] `DATABASE_URL` set in Render env.
- [ ] Connection pool sized for Render plan (start with `pool_size=5, max_overflow=10`; Neon scales compute, but the pool sits in our process).
- [ ] `alembic upgrade head` runs as a pre-deploy step (add to `render.yaml` `preDeployCommand`).
- [ ] `pg_cron` extension enabled on the Neon prod branch, or a Render cron service calls `SELECT cleanup_expired();` every 5 minutes.
- [ ] Backups confirmed — Neon takes them automatically; verify the retention window matches our SLA.
