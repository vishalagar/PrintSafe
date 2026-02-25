# Database Schema

Run once in Supabase SQL Editor before writing any API code.

```sql
CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token         VARCHAR(64) UNIQUE NOT NULL,
  delete_token  VARCHAR(64) UNIQUE NOT NULL,
  storage_key   VARCHAR(255) NOT NULL,
  file_name     VARCHAR(255) NOT NULL,
  file_size     INTEGER NOT NULL,
  mime_type     VARCHAR(50) NOT NULL,
  status        TEXT DEFAULT 'pending'
                CHECK (status IN ('pending','viewed','deleted','expired')),
  iv            TEXT NOT NULL,
  viewed_at     TIMESTAMPTZ,
  expires_at    TIMESTAMPTZ NOT NULL,
  ttl_after_view INTEGER DEFAULT 1800,
  ip_hash       VARCHAR(64),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX idx_token ON documents(token);
CREATE INDEX idx_status   ON documents(status);
CREATE INDEX idx_expires  ON documents(expires_at);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
```

> RLS is ON — all Phase 1 API access uses the `service_role` key in server-side routes only. The anon key never touches this table directly.

## Status Lifecycle

```
pending → viewed → deleted
                 ↘ expired  (if never opened, after 24hr TTL)
```

| Status | Meaning |
|--------|---------|
| `pending` | Uploaded, not yet opened |
| `viewed` | Opened — blob deleted after `ttl_after_view` seconds |
| `printing` | Shopkeeper opened in commercial mode (Phase 3) |
| `deleted` | Blob permanently purged from R2 |
| `expired` | TTL exceeded without being viewed — cron triggers deletion |

## Key Notes

- `delete_token` — returned to uploader at upload time, stored in browser `localStorage`. Enables manual delete without login.
- `iv` — AES-GCM initialisation vector stored server-side (safe — useless without the key, which never reaches server).
- `ip_hash` — hashed viewer IP for audit, not raw PII.
- `ttl_after_view` default: 1800 seconds (30 min). Options: 0 (view-once), 900 (15min), 1800 (30min), 3600 (1hr).
