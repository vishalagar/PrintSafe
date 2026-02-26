# Project State

> **Update this file at the end of every session.**
> Format: what was done · why · what's next · any blockers.

---

## Current Phase
**Phase 1 — Personal Mode MVP** ← **FULLY WORKING end-to-end ✅**
**Phase 2 — Security Hardening** ← **IN PROGRESS**

## Last Session Summary
**Date:** 2026-02-26
**What was done:**

### 1. Dropped DOCX support
DOCX files can't be rendered or printed in-browser — the "Print" button called `window.print()` which only printed the placeholder card, not the actual document. Removed DOCX from:
- `api/upload/route.ts` — ALLOWED_MIMES
- `page.tsx` — MIME_LABEL, EXT_TO_MIME, file input accept, accepted chips, error message
- `d/[token]/page.tsx` — removed DOCX fallback render branch

### 2. Cron cleanup route (`/api/cron/cleanup`)
New `POST /api/cron/cleanup` route that purges stale docs from R2:
- **Expired:** `pending` docs past `expires_at` → deletes R2 blob, marks `expired`
- **Stale viewed:** `viewed` docs past `viewed_at + ttl_after_view` → deletes R2 blob, marks `deleted`
- Protected by `CRON_SECRET` bearer token
- Processes up to 100 docs per category per run
- Returns `{ purged, failed, timestamp }`

### Previous session (2026-02-25):

#### Bugs fixed:

#### 1. Critical: `bytes.buffer` pool corruption in `/api/file/[token]/route.ts`
**Root cause:** `transformToByteArray()` in the AWS SDK uses `Buffer.concat()` internally. For small files (< ~4 KB ciphertext), Node.js allocates from an 8192-byte pool buffer. The returned `Buffer` has `byteOffset > 0` pointing into the middle of the pool. Sending `bytes.buffer` (the full 8192-byte pool) meant the browser received pool garbage bytes — NOT the ciphertext — causing AES-GCM decryption to fail.

**Fix:** `bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer` creates a fresh ArrayBuffer containing only the actual ciphertext bytes.

#### 2. One-time access not enforced — `/api/doc/[token]/route.ts`
**Root cause:** The 410 status gate only checked `deleted` and `expired`, not `viewed`. Any person who got the link could re-open it after the first viewer had already opened it, defeating the one-time promise.

**Fix:** Added `doc.status === 'viewed'` to the 410 gate. The first viewer gets metadata + file (file route still serves `viewed` docs). Any subsequent `/api/doc` call (refresh, second person) gets 410 → "already opened".

#### 3. DOCX files rendered as broken `<img>` — `/d/[token]/page.tsx`
**Root cause:** The viewer only checked `isPDF` and fell back to `<img>` for everything else. DOCX blobs can't render as images, so users saw a broken icon.

**Fix:** Added explicit `isImage` check. DOCX (and any other unsupported MIME) now shows a clear "document ready to print" message explaining the limitation.

### Previous session changes (already committed):
- `api/upload/route.ts` — refactored from FormData to binary body + custom headers
- `page.tsx` — matched upload change, added MIME extension detection
- `status/[token]/page.tsx` — added "Back to share" / "Upload another" nav buttons
- `next.config.ts` — added `serverActions.bodySizeLimit: '26mb'` (note: applies to Server Actions only, not API routes — API routes have no framework-level body limit)

---

## What's Next (Phase 2 — continued)

1. ~~**Cron cleanup job**~~ ✅ Done
2. **TTL=0 immediate deletion** — when `ttl_after_view === 0`, delete from R2 + mark deleted after the file is served. Needs `after()` from `next/server` to fire after response. Currently TTL=0 docs are access-blocked but blob stays in R2 until cron runs.
3. **Rate limit hardening** — fail closed when Redis is down (currently fails open)
4. **CAPTCHA on upload** — hCaptcha or Cloudflare Turnstile to prevent abuse
5. **Vercel deployment** — `npm run build` passes; add env vars + CRON_SECRET in Vercel dashboard, configure Vercel Cron for `/api/cron/cleanup`
6. **Phase 3 prep** — Commercial mode: shop auth, branded pages, live dashboard

---

## Current Code Structure

```
/Code
  CLAUDE.md
  .env.local                       ← all 12 env vars (DO NOT COMMIT)
  package.json                     ← postinstall copies pdf.worker to public/
  tsconfig.json
  next.config.ts
  public/
    pdf.worker.min.mjs             ← PDF.js v5 worker (copied from node_modules)
  src/
    app/
      globals.css                  ← PrintSafe design tokens (sky blue, neo-brutalist)
      layout.tsx                   ← Google Fonts, metadata
      page.tsx                     ← Upload page (/)
      share/
        page.tsx                   ← Link ready (/share)
      d/[token]/
        page.tsx                   ← Document viewer (/d/:token#key)
      status/[token]/
        page.tsx                   ← Status & delete (/status/:token)
      api/
        upload/route.ts            ← POST /api/upload
        doc/[token]/route.ts       ← GET metadata + DELETE purge
        file/[token]/route.ts      ← GET ciphertext proxy (R2 → browser)
        status/[token]/route.ts    ← GET status/timeline
    lib/
      supabase.ts                  ← server client (untyped) + DocumentRow type
      r2.ts                        ← R2 upload / presign / delete
      redis.ts                     ← Upstash rate-limit helper
      crypto.ts                    ← browser AES-256-GCM
      utils.ts                     ← cn() (shadcn)
  docs/
    architecture.md
    schema.md                      ← ⚠️ RUN THIS SQL IN SUPABASE FIRST
    setup.md
    design.md
    decisions.md
    workflow.md
  tasks/
    state.md                       ← this file
```

---

## Architecture Notes

### Document fetch flow
```
Browser → GET /api/doc/{token}     marks viewed (first access only), returns { iv, mimeType, ttlAfterView, viewedAt }
Browser → GET /api/file/{token}    proxies encrypted bytes from R2 (same-origin)
Browser decrypts with key from URL#fragment → renders PDF or image
```

### One-time access model
- `/api/doc/:token` returns 410 if status is `pending→viewed` already done, `deleted`, or `expired`
- `/api/file/:token` serves the ciphertext as long as status is NOT `deleted`/`expired` (allows 'viewed')
- This means: the legitimate viewer who called /api/doc gets the file. Anyone else gets 410.
- If network fails between the doc and file calls, the user loses access on refresh (known limitation, Phase 2 fix: short-lived signed fetch token)

### Key security invariants (never break these)
- Encryption key lives ONLY in the URL `#fragment` — never sent to server
- `crypto.ts` is client-side only (`'use client'` at top)
- R2 objects keyed by `crypto.randomUUID()`, never by filename
- `service_role` key used only in API routes, never exposed to browser
- Rate limit fails open (upload allowed even if Redis down) — fix in Phase 2

### Supabase typing quirk
- `createClient<Database>()` causes `.update()` to infer args as `never` in TS strict mode
- Solution: use `createClient()` (untyped), manually cast `data as DocumentRow`

---

## Known Issues

| Issue | Severity | Fix |
|-------|----------|-----|
| ~~No cron cleanup for expired docs~~ | ~~Medium~~ | ✅ Done — `/api/cron/cleanup` |
| ~~DOCX can't be previewed/printed~~ | ~~Medium~~ | ✅ Done — DOCX removed from allowed types |
| TTL=0 blob stays in R2 after first view | Medium — access blocked but blob not purged until cron | Phase 2: `after()` from `next/server` |
| Rate limit fails open if Redis is down | Medium | Phase 2: fail closed |
| No CAPTCHA on upload | Medium | Phase 2: hCaptcha or Turnstile |
| Refresh after first view shows "already opened" | Low — expected for one-time links | Known design trade-off |
