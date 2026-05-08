# Schema Design

This document defines the persistent data model for MiniPerplexity. The starting point is the in-memory state in [`backend/app/api/v1/query_handler.py`](../../backend/app/api/v1/query_handler.py) (`chat_sessions: Dict[str, SessionData]`) plus the request/response shapes in [`backend/app/models`](../../backend/app/models). Everything that currently lives in process memory needs to be modelled durably so that:

- Sessions survive backend restarts and horizontal scaling.
- Chat history can be loaded by URL (e.g. `/c/<session_id>`) instead of requiring the original tab.
- Search results, citations, and answers are auditable.
- Rate limiting works correctly across multiple gunicorn workers / Render instances.

---

## Design principles

1. **UUIDs everywhere.** All primary keys are `uuid` (generated client-side or via `gen_random_uuid()` from `pgcrypto`). They are URL-safe, non-enumerable, and avoid leaking row counts.
2. **Anonymous-first.** A session does not require a user — `sessions.user_id` is nullable. We can adopt sign-in later without a schema break.
3. **Append-only history.** `messages`, `queries`, and `search_results` are write-once. Edits are modelled as new rows, never `UPDATE`s. This makes auditing and replays trivial.
4. **Soft-deletes via TTL, not hard deletes in the hot path.** A nightly job (or `pg_cron`) removes rows past `expires_at`. The 10-minute `SESSION_TTL` from the current code becomes a sliding `last_accessed_at + interval '10 minutes'`.
5. **Foreign keys with `ON DELETE CASCADE`** on session-scoped children so dropping a session cleans up everything underneath atomically.
6. **No premature denormalization.** Counts (e.g. `messages_count` on `sessions`) are computed via views/queries; we add cached columns only if a real query proves slow.
7. **Postgres-native types.** `text` over `varchar(n)` (no perf cost in PG, easier evolution), `jsonb` for opaque payloads, `timestamptz` everywhere (never naive timestamps), `citext` for case-insensitive emails.

---

## Tables

### 1. `users` (optional, anonymous-friendly)

Holds anyone who has signed in. The current MVP does not have auth, but the column on `sessions` is reserved so adding email-based auth later is a no-op migration.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `email` | `citext` | UNIQUE, NOT NULL | Case-insensitive lookup. |
| `display_name` | `text` | NULL | Optional friendly name. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | Maintained by trigger. |
| `last_seen_at` | `timestamptz` | NULL | Updated on each authenticated request. |

**Why `citext`?** Email is case-insensitive by RFC, but `varchar` would let `Foo@x.com` and `foo@x.com` both insert. `citext` enforces uniqueness correctly without `LOWER()` everywhere.

---

### 2. `sessions` (replaces in-memory `chat_sessions`)

One row per chat thread. Equivalent to today's `SessionData`, but durable.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | Same value the frontend passes as `session_id` in the URL today. |
| `user_id` | `uuid` | FK → `users(id)` ON DELETE SET NULL, NULL allowed | `NULL` for anonymous sessions. |
| `title` | `text` | NULL | Auto-generated from first query (truncated, ~80 chars). |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `last_accessed_at` | `timestamptz` | NOT NULL, default `now()` | Bumped on every read/write — drives TTL. |
| `expires_at` | `timestamptz` | NOT NULL | `last_accessed_at + INTERVAL '10 minutes'` (mirrors current `SESSION_TTL`). Kept as a real column so the cleanup index is cheap. |
| `is_archived` | `boolean` | NOT NULL, default `false` | Allows a user to keep a session past TTL once auth lands. |
| `metadata` | `jsonb` | NOT NULL, default `'{}'` | Free-form (UA, locale, model preference). |

**Why store `expires_at` as a column instead of computing it?** Indexing a column is straightforward; indexing a derived expression works but couples cleanup-job query plans to that exact expression. Cheap denormalization, big payoff for the eviction job.

---

### 3. `queries`

One row per user-issued query in a session. Kept as a first-class entity (rather than rolling into `messages`) so search results have a clear parent.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | |
| `session_id` | `uuid` | FK → `sessions(id)` ON DELETE CASCADE, NOT NULL | |
| `query_text` | `text` | NOT NULL | The raw user query. |
| `custom_url` | `text` | NULL | When the user provided a custom URL instead of a search. |
| `position` | `integer` | NOT NULL | 0-based ordinal within session, monotonically increasing. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraints**

- `UNIQUE (session_id, position)` — guarantees stable ordering even with concurrent writes (use `SELECT … FOR UPDATE` or compute `position` via `INSERT … RETURNING` with a CTE).
- `CHECK (length(query_text) BETWEEN 1 AND 4000)` — defensive; rejects pathological inputs.

---

### 4. `messages`

The full chat transcript: user prompts and assistant replies. Mirrors what `cf_chat.generate_answer` consumes in `chat_history`.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | |
| `session_id` | `uuid` | FK → `sessions(id)` ON DELETE CASCADE, NOT NULL | |
| `query_id` | `uuid` | FK → `queries(id)` ON DELETE CASCADE, NULL | NULL for system messages. |
| `role` | `message_role` (enum) | NOT NULL | `user` / `assistant` / `system`. |
| `content` | `text` | NOT NULL | |
| `model_name` | `text` | NULL | For `assistant` rows: e.g. `@cf/meta/llama-3-8b-instruct`. |
| `tokens_input` | `integer` | NULL | Optional accounting. |
| `tokens_output` | `integer` | NULL | |
| `latency_ms` | `integer` | NULL | LLM call time, for assistant rows. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Why a dedicated `role` enum?** Catches typos at insert time and makes query plans self-documenting. Postgres enums are cheaper than `varchar` + `CHECK`.

```sql
CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system');
```

---

### 5. `search_results`

Each row is one ranked result returned for a `query`. Unifies web, YouTube, and custom-URL fetches via the `source` enum.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | |
| `query_id` | `uuid` | FK → `queries(id)` ON DELETE CASCADE, NOT NULL | |
| `position` | `integer` | NOT NULL | Rank within the result set. |
| `source` | `search_source` (enum) | NOT NULL | `web` / `youtube` / `custom_url`. |
| `title` | `text` | NOT NULL | |
| `url` | `text` | NOT NULL | |
| `snippet` | `text` | NULL | The short summary. |
| `search_content` | `text` | NULL | The longer scraped text used for grounding. |
| `question` | `text` | NULL | Mirrors `SearchResult.question` from [`search_model.py`](../../backend/app/models/search_model.py). |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraints**

- `UNIQUE (query_id, url)` — one row per (query, URL); deduplicates accidental repeats.
- `CHECK (url ~* '^https?://')` — sanity check.

```sql
CREATE TYPE search_source AS ENUM ('web', 'youtube', 'custom_url');
```

---

### 6. `citations`

Join table from an assistant `message` to the `search_results` it cited. Today citations are tracked in [`citation_tracker.py`](../../backend/app/utils/citation_tracker.py) and returned in `QueryResponse.citations`. Persisting them lets us render `[1]`-style anchors without re-running the tracker.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | PK | |
| `message_id` | `uuid` | FK → `messages(id)` ON DELETE CASCADE, NOT NULL | The assistant message doing the citing. |
| `search_result_id` | `uuid` | FK → `search_results(id)` ON DELETE CASCADE, NOT NULL | |
| `citation_number` | `integer` | NOT NULL | 1-based, the `[N]` shown to the user. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraints**

- `UNIQUE (message_id, citation_number)` — `[1]`, `[2]`, … are unambiguous within a message.
- `UNIQUE (message_id, search_result_id)` — never cite the same source twice in one answer.

---

### 7. `rate_limits`

Replaces the in-memory rate limiter in [`rate_limter.py`](../../backend/app/utils/rate_limter.py) (typo intentional — that's the actual filename). With multiple gunicorn workers, an in-memory limiter is per-process; durable counters fix that.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `bigserial` | PK | High insert volume — UUID overhead unjustified here. |
| `identifier` | `text` | NOT NULL | IP address or `user_id::text`. |
| `identifier_type` | `rate_limit_subject` (enum) | NOT NULL | `ip` / `user`. |
| `endpoint` | `text` | NOT NULL | e.g. `POST /api/v1/search`. |
| `window_start` | `timestamptz` | NOT NULL | Start of the bucket. |
| `request_count` | `integer` | NOT NULL, default `0` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Constraints**

- `UNIQUE (identifier, identifier_type, endpoint, window_start)` — one row per bucket; `INSERT … ON CONFLICT … DO UPDATE SET request_count = request_count + 1` is the entire fast path.

```sql
CREATE TYPE rate_limit_subject AS ENUM ('ip', 'user');
```

> **Alternative considered:** Redis. Faster, but adds a dependency and Neon already gives us durable Postgres. If write volume becomes a problem we move *only this table* to Redis without touching the rest.

---

### 8. `api_usage_logs`

Lightweight observability so we can debug latency / errors without external APM.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `id` | `bigserial` | PK | |
| `session_id` | `uuid` | FK → `sessions(id)` ON DELETE SET NULL, NULL | |
| `endpoint` | `text` | NOT NULL | |
| `method` | `text` | NOT NULL | `GET` / `POST` / … |
| `status_code` | `smallint` | NOT NULL | |
| `latency_ms` | `integer` | NOT NULL | |
| `error_message` | `text` | NULL | Captured exception summary, if any. |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

This table is high-volume and low-value-per-row — consider partitioning by month (`PARTITION BY RANGE (created_at)`) once it exceeds a few million rows. Out of scope for v1.

---

### 9. `content_cache`

Custom-URL fetches in `fetch_content_from_custom_url` are expensive (network + parsing). Caching by URL hash trades a tiny amount of disk for big latency wins on repeated lookups.

| Column | Type | Constraints | Notes |
| --- | --- | --- | --- |
| `url_hash` | `bytea` | PK | `sha256(url)` — fixed-size, fast equality. |
| `url` | `text` | NOT NULL | Original URL for debugging. |
| `title` | `text` | NULL | |
| `content` | `text` | NOT NULL | Scraped body. |
| `fetched_at` | `timestamptz` | NOT NULL, default `now()` | |
| `expires_at` | `timestamptz` | NOT NULL | `fetched_at + INTERVAL '24 hours'` by default. |
| `etag` | `text` | NULL | For conditional refresh. |
| `last_modified` | `text` | NULL | |

**Why hash as PK and not the URL itself?** URLs can be long (>2 KB). A `bytea(32)` PK keeps the index dense and equality lookups O(1)-ish.

---

## Enums summary

```sql
CREATE TYPE message_role        AS ENUM ('user', 'assistant', 'system');
CREATE TYPE search_source       AS ENUM ('web', 'youtube', 'custom_url');
CREATE TYPE rate_limit_subject  AS ENUM ('ip', 'user');
```

---

## Cross-cutting concerns

### `updated_at` triggers

Every table with `updated_at` gets a `BEFORE UPDATE` trigger that sets it to `now()`. One shared function, applied per-table — keeps app code from forgetting.

### Soft TTL eviction

A scheduled job (Neon `pg_cron`, or a worker calling a `cleanup_expired_sessions()` SQL function on a timer) deletes:

- `sessions WHERE expires_at < now() AND is_archived = false` — cascades to `queries`, `messages`, `search_results`, `citations`.
- `content_cache WHERE expires_at < now()`.
- `rate_limits WHERE window_start < now() - INTERVAL '1 hour'`.
- `api_usage_logs WHERE created_at < now() - INTERVAL '30 days'`.

### Concurrency

- `queries.position` increments need to be transactional. Pattern:
  ```sql
  INSERT INTO queries (id, session_id, query_text, position)
  SELECT $1, $2, $3, COALESCE(MAX(position) + 1, 0)
  FROM queries WHERE session_id = $2
  RETURNING *;
  ```
  Combined with the `UNIQUE (session_id, position)` constraint, a duplicate insert from a racing request fails cleanly and the app retries.

### Privacy

`api_usage_logs` and `rate_limits` store IPs. We treat them as PII: 30-day retention, no joining to `users` for analytics dashboards.

---

## What we deliberately did **not** model

- **Embeddings / pgvector**. The current app has no vector search. Adding `pgvector` later is a one-line extension install plus an `embedding vector(384)` column on `search_results`. Keeping it out of v1 avoids the 200 MB+ extension footprint and a model-choice decision we don't need to make yet.
- **A `tags` table for sessions.** No product need.
- **Per-session feature flags.** Use `sessions.metadata` (`jsonb`) until a real query pattern emerges.

See [erd.md](erd.md) for the diagram and [schema.sql](schema.sql) for the executable DDL.
