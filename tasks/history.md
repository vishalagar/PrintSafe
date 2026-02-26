# Session History — Archive

> Older session logs moved here from `state.md` when it exceeds 100-150 lines.
> Append-only. Never delete entries.

---

## Session: 2026-02-25 (committed as "Initial commit — PrintSafe Phase 1 MVP" era)

### Changes (already committed)
- `api/upload/route.ts` — refactored from FormData to binary body + custom headers
- `page.tsx` — matched upload change, added MIME extension detection
- `status/[token]/page.tsx` — added "Back to share" / "Upload another" nav buttons
- `next.config.ts` — added `serverActions.bodySizeLimit: '26mb'` (note: applies to Server Actions only, not API routes — API routes have no framework-level body limit)

---

## Session: 2026-02-26 (session 1)

### 1. Critical: `bytes.buffer` pool corruption — `/api/file/[token]/route.ts`
**Root cause:** `transformToByteArray()` in the AWS SDK uses `Buffer.concat()` internally. For small files (< ~4 KB ciphertext), Node.js allocates from an 8192-byte pool buffer. The returned `Buffer` has `byteOffset > 0` pointing into the middle of the pool. Sending `bytes.buffer` (the full 8192-byte pool) meant the browser received pool garbage bytes — NOT the ciphertext — causing AES-GCM decryption to fail.

**Fix:** `bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer` creates a fresh ArrayBuffer containing only the actual ciphertext bytes.

### 2. One-time access not enforced — `/api/doc/[token]/route.ts`
**Root cause:** The 410 status gate only checked `deleted` and `expired`, not `viewed`. Any person who got the link could re-open it after the first viewer had already opened it, defeating the one-time promise.

**Fix:** Added `doc.status === 'viewed'` to the 410 gate. The first viewer gets metadata + file (file route still serves `viewed` docs). Any subsequent `/api/doc` call (refresh, second person) gets 410 → "already opened".

### 3. DOCX files rendered as broken `<img>` — `/d/[token]/page.tsx`
**Root cause:** The viewer only checked `isPDF` and fell back to `<img>` for everything else. DOCX blobs can't render as images, so users saw a broken icon.

**Fix:** Added explicit `isImage` check. DOCX (and any other unsupported MIME) now shows a clear "document ready to print" message explaining the limitation.

### 4. Dropped DOCX support entirely
DOCX files can't be rendered or printed in-browser. Removed from:
- `api/upload/route.ts` — ALLOWED_MIMES
- `page.tsx` — MIME_LABEL, EXT_TO_MIME, file input accept, accepted chips, error message
- `d/[token]/page.tsx` — removed DOCX fallback render branch

### 5. Cron cleanup route (`/api/cron/cleanup`)
New `POST /api/cron/cleanup` route that purges stale docs from R2:
- **Expired:** `pending` docs past `expires_at` → deletes R2 blob, marks `expired`
- **Stale viewed:** `viewed` docs past `viewed_at + ttl_after_view` → deletes R2 blob, marks `deleted`
- Protected by `CRON_SECRET` bearer token
- Processes up to 100 docs per category per run
- Returns `{ purged, failed, timestamp }`

---
