# Indexes & Performance Notes

The schema is small; the access patterns are predictable. This page lists every index in [`schema.sql`](schema.sql), the query it serves, and the trade-off taken.

## Hot query patterns

| # | Query | Where it runs | Frequency |
| --- | --- | --- | --- |
| Q1 | "Load all messages for session X in chronological order." | `GET /session/{id}/history` | Every page load. |
| Q2 | "Get the last K queries for session X." | LLM context-window prep before `cf_chat.generate_answer`. | Every `POST /answer`. |
| Q3 | "Get all search_results for query Y, ordered by rank." | Citation rendering, answer generation. | Every `POST /answer`. |
| Q4 | "Find sessions whose `expires_at < now()` and `is_archived = false`." | Cleanup job. | Every 5 minutes. |
| Q5 | "Upsert a rate-limit bucket for (identifier, endpoint, window)." | Every API call. | Hottest write path. |
| Q6 | "Look up cached content by `sha256(url)`." | Each custom-URL fetch. | Sporadic. |
| Q7 | "List a user's recent sessions." | (Future) sidebar. | Per page load when auth lands. |

## Indexes

### `sessions`

```sql
CREATE INDEX idx_sessions_user_last_accessed
    ON sessions (user_id, last_accessed_at DESC)
    WHERE user_id IS NOT NULL;
```
Serves Q7. Partial index (`WHERE user_id IS NOT NULL`) keeps anonymous sessions out of the index — they will dominate row count and the index would otherwise be mostly useless padding.

```sql
CREATE INDEX idx_sessions_expires_at
    ON sessions (expires_at)
    WHERE is_archived = false;
```
Serves Q4. Partial index narrows to the only rows the cleanup job ever scans.

### `queries`

```sql
CREATE INDEX idx_queries_session_created
    ON queries (session_id, created_at);
```
Serves Q2. Composite leading-with-`session_id` lets us range-scan a session's queries without touching unrelated rows. The `UNIQUE (session_id, position)` constraint already provides a B-tree we could reuse, but `created_at` is what the application actually orders by.

### `messages`

```sql
CREATE INDEX idx_messages_session_created
    ON messages (session_id, created_at);
```
Serves Q1. The page renders messages in the order they happened.

```sql
CREATE INDEX idx_messages_query
    ON messages (query_id) WHERE query_id IS NOT NULL;
```
Joins assistant messages back to their originating query. Partial because system messages (no `query_id`) are rare.

### `search_results`

```sql
CREATE INDEX idx_search_results_query_position
    ON search_results (query_id, position);
```
Serves Q3.

```sql
CREATE INDEX idx_search_results_url
    ON search_results (url);
```
Lets us spot-check "have we ever fetched this URL?" — useful if we later add cross-session deduplication. Cheap; URLs are not high cardinality enough to bloat.

### `citations`

```sql
CREATE INDEX idx_citations_message
    ON citations (message_id);
```
Renders `[1]`, `[2]`, … under an assistant reply.

### `rate_limits`

```sql
CREATE INDEX idx_rate_limits_lookup
    ON rate_limits (identifier, identifier_type, endpoint, window_start DESC);
```
Serves Q5. The unique constraint already covers this lookup, but we list it explicitly so the leading-column ordering and DESC direction stay obvious to anyone reading the schema.

### `api_usage_logs`

```sql
CREATE INDEX idx_api_usage_logs_created ON api_usage_logs (created_at DESC);
CREATE INDEX idx_api_usage_logs_errors  ON api_usage_logs (created_at DESC) WHERE status_code >= 400;
```
The full-table index supports retention deletes and time-range dashboards. The partial index makes "show me errors in the last hour" essentially free, which is the only real-time query a small team uses on a logs table.

### `content_cache`

The PK on `url_hash` covers Q6 directly. Plus:

```sql
CREATE INDEX idx_content_cache_expires_at ON content_cache (expires_at);
```
For TTL eviction.

## Indexes deliberately not added

- **Full-text search on `messages.content` or `search_results.search_content`.** Tempting (`tsvector`/`GIN`), but no UI surfaces it today. Adding GIN indexes on long text columns is expensive and there is no query in the app that pays for them.
- **Index on `messages.role`.** Cardinality is 3. Postgres will prefer a sequential scan; the index would never be used.
- **Index on `sessions.id`.** Already the PK.

## Connection pooling

Neon recommends running through their **PgBouncer pooler** (`...pooler.neon.tech`) for serverless environments to avoid the per-connection cold-start cost. With Render's gunicorn workers, each worker holds 5–10 PG connections; pooler endpoint multiplexes them onto a smaller set of physical connections.

- Use the **pooled** endpoint for the FastAPI app (transaction-scoped pooling).
- Use the **direct** endpoint for Alembic migrations (session-scoped operations like `CREATE EXTENSION` and advisory locks).

## Vacuum / autovacuum

Default Neon autovacuum is fine for tables of this size. Two callouts when traffic grows:

- `rate_limits` and `api_usage_logs` have high INSERT/DELETE turnover. If we see bloat, set per-table `autovacuum_vacuum_scale_factor = 0.05` (more aggressive than the 0.2 default).
- `messages.content` is a long text column — TOAST will move it out of the main heap automatically. No action required, just be aware that `SELECT *` is wasteful; always project explicit columns.

## What "good enough" looks like for v1

Given expected traffic (a few hundred sessions/day for a portfolio demo), every query above runs in **single-digit milliseconds** with these indexes. We are not optimizing for scale we don't have; we are choosing indexes that match named queries so the planner has obvious paths. If a query shows up in `pg_stat_statements` as slow later, we add an index then — not before.
