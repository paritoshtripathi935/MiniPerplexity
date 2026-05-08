# Entity-Relationship Diagram

```mermaid
erDiagram
    users ||--o{ sessions : "owns (optional)"
    sessions ||--o{ queries : "contains"
    sessions ||--o{ messages : "contains"
    queries ||--o{ messages : "produces"
    queries ||--o{ search_results : "yields"
    messages ||--o{ citations : "cites"
    search_results ||--o{ citations : "cited by"
    sessions ||--o{ api_usage_logs : "logs"

    users {
        uuid id PK
        citext email UK
        text display_name
        timestamptz created_at
        timestamptz updated_at
        timestamptz last_seen_at
    }

    sessions {
        uuid id PK
        uuid user_id FK "nullable"
        text title
        timestamptz created_at
        timestamptz last_accessed_at
        timestamptz expires_at
        boolean is_archived
        jsonb metadata
    }

    queries {
        uuid id PK
        uuid session_id FK
        text query_text
        text custom_url "nullable"
        integer position
        timestamptz created_at
    }

    messages {
        uuid id PK
        uuid session_id FK
        uuid query_id FK "nullable"
        message_role role
        text content
        text model_name
        integer tokens_input
        integer tokens_output
        integer latency_ms
        timestamptz created_at
    }

    search_results {
        uuid id PK
        uuid query_id FK
        integer position
        search_source source
        text title
        text url
        text snippet
        text search_content
        text question
        timestamptz created_at
    }

    citations {
        uuid id PK
        uuid message_id FK
        uuid search_result_id FK
        integer citation_number
        timestamptz created_at
    }

    rate_limits {
        bigserial id PK
        text identifier
        rate_limit_subject identifier_type
        text endpoint
        timestamptz window_start
        integer request_count
        timestamptz updated_at
    }

    api_usage_logs {
        bigserial id PK
        uuid session_id FK "nullable"
        text endpoint
        text method
        smallint status_code
        integer latency_ms
        text error_message
        timestamptz created_at
    }

    content_cache {
        bytea url_hash PK
        text url
        text title
        text content
        timestamptz fetched_at
        timestamptz expires_at
        text etag
        text last_modified
    }
```

## Relationship cardinality

| From | To | Cardinality | On delete |
| --- | --- | --- | --- |
| `users` | `sessions` | 1 — 0..N | SET NULL on `sessions.user_id` |
| `sessions` | `queries` | 1 — 0..N | CASCADE |
| `sessions` | `messages` | 1 — 0..N | CASCADE |
| `queries` | `messages` | 1 — 0..N | CASCADE |
| `queries` | `search_results` | 1 — 0..N | CASCADE |
| `messages` | `citations` | 1 — 0..N | CASCADE |
| `search_results` | `citations` | 1 — 0..N | CASCADE |
| `sessions` | `api_usage_logs` | 1 — 0..N | SET NULL |

`rate_limits` and `content_cache` are standalone — no FKs, intentionally.
