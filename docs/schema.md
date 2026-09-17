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
  created_at    TIMESTAMPTZ DEFAULT now(),
  confirmed_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX idx_token ON documents(token);
CREATE INDEX idx_status   ON documents(status);
CREATE INDEX idx_expires  ON documents(expires_at);
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
```

### Manual migration — presigned upload flow (session 10, 2026-09-14) ✅ applied

Run once in the Supabase SQL editor. Adds a nullable `confirmed_at` column
instead of a new `status` enum value, to avoid touching the `status` CHECK
constraint and every place in the codebase that already branches on `status`.

```sql
ALTER TABLE documents ADD COLUMN confirmed_at TIMESTAMPTZ;
```

A `'pending'` row with `confirmed_at IS NULL` means the client received a
presigned R2 upload URL but hasn't (yet, or ever) confirmed the ciphertext
landed — see `docs/security.md` section B. No index is added on
`confirmed_at`; the cron cleanup query filters on `status` (already indexed
via `idx_status`) first, so a full index isn't warranted at current scale.

> RLS is ON — all Phase 1 API access uses the `service_role` key in server-side routes only. The anon key never touches this table directly.

### Manual migration — delete_after column (session 12) — run before deploying

Fixes two bugs: (1) `ttl_after_view` was never actually enforced outside the
daily cron, so a "15 min" document stayed downloadable via `/api/file` and
showed "Viewed" forever on `/status` once its countdown hit zero; (2) the
cron's viewed-docs pass fetched the first 100 `status='viewed'` rows with no
filter and checked the deadline in JS, so once there were >100 live viewed
docs, overdue ones could be pushed off page 1 and never purged.

```sql
ALTER TABLE documents ADD COLUMN delete_after TIMESTAMPTZ;
CREATE INDEX idx_delete_after ON documents(delete_after);

-- Backfill existing 'viewed' rows so the cron's fast-path query (which
-- filters delete_after directly in SQL) picks them up too.
UPDATE documents
SET delete_after = viewed_at + (ttl_after_view || ' seconds')::interval
WHERE status = 'viewed' AND viewed_at IS NOT NULL AND delete_after IS NULL;
```

`delete_after` is set alongside `viewed_at` when a document's status flips
to `'viewed'` (`/api/doc/:token`), null for TTL=0 documents (deleted
immediately instead — see section G in `docs/security.md`), and read by
`/api/file/:token` and `/api/status/:token` to lazily delete a document the
instant its deadline passes, rather than waiting for the next cron run. See
`src/lib/document-lifecycle.ts`.

## Status Lifecycle

```
pending → viewed → deleted
                 ↘ expired  (if never opened, after 24hr TTL)
```

| Status | Meaning |
|--------|---------|
| `pending` | Uploaded, not yet opened |
| `viewed` | Opened — blob deleted after `ttl_after_view` seconds |
| `deleted` | Blob permanently purged from R2 |
| `expired` | TTL exceeded without being viewed — cron triggers deletion |

> A `printing` status (shopkeeper opened, commercial mode) was planned for
> Phase 3 but isn't in the `status` CHECK constraint yet — don't reference
> it until the migration that adds it lands.

## Key Notes

- `delete_token` — returned to uploader at upload time, stored in browser `localStorage`. Enables manual delete without login.
- `iv` — AES-GCM initialisation vector stored server-side (safe — useless without the key, which never reaches server).
- `ip_hash` — HMAC-SHA256 of viewer IP (`IP_HASH_SECRET`) for audit, not raw PII. See `docs/security.md` section E.
- `ttl_after_view` default: 1800 seconds (30 min). Options: 0 (view-once), 900 (15min), 1800 (30min), 3600 (1hr).
- `confirmed_at` — NULL until `/api/upload/confirm` verifies the presigned R2 PUT actually landed. A `'pending'` row with `confirmed_at IS NULL` is not a viewable document; `/api/doc/:token` and `/api/file/:token` 404 on it, and cron deletes it outright if it stays unconfirmed past 1 hour.
