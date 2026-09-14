# Project State

> **Update this file at the end of every session.**
> Format: what was done · why · what's next · any blockers.
> **If this file exceeds 150 lines → move older sessions to `tasks/history.md` (append-only).**

---

## Current Phase
**Phase 1 — Personal Mode MVP** ← **FULLY WORKING end-to-end ✅**
**Phase 2 — Security Hardening** ← **COMPLETE ✅**
**Phase 3 — Commercial Mode & PWA** ← **current**

---

## Last Session Summary
**Date:** 2026-09-14 (session 10)

### Fix: uploads 4.5–25 MB silently failing (Vercel body size cap)

**Root cause:** `/api/upload` received the full encrypted file body directly
in a POST handled by a Node.js Vercel Serverless Function. Vercel caps
serverless function request bodies at ~4.5 MB, but the app allows files up to
25 MB (`MAX_FILE_SIZE`). Vercel returned a 413 before the route handler even
ran; the client's `.catch(() => ({}))` swallowed the non-JSON error body, so
the user just saw a generic "Upload failed."

**Fix — presigned R2 PUT upload**, matching Vercel's own guidance for large
uploads:
1. Client → `POST /api/upload` with metadata only in headers (no body). Rate
   limit + CAPTCHA gate this exactly as before. Server inserts a `documents`
   row with `confirmed_at = NULL`, then returns `{ token, deleteToken,
   uploadUrl }` — `uploadUrl` is a presigned R2 PUT URL (5 min expiry).
2. Client → `PUT`s the ciphertext directly to `uploadUrl` (never touches the
   Vercel function body).
3. Client → `POST /api/upload/confirm` `{ token }` — server `HeadObjectCommand`s
   R2 to verify the object landed and its size roughly matches what was
   declared, then sets `confirmed_at`.
4. If the client never confirms, the row isn't a real document:
   `/api/doc/:token` and `/api/file/:token` now treat `status='pending' AND
   confirmed_at IS NULL` as 404 (not found), and the cron cleanup job
   (`/api/cron/cleanup`) purges rows unconfirmed for over 1 hour, best-effort
   deleting the R2 object too.

**Files changed:**
- `src/lib/r2.ts` — added `getPresignedUploadUrl()`, `headR2Object()`
- `src/app/api/upload/route.ts` — rewritten: no body read, issues presigned URL
- `src/app/api/upload/confirm/route.ts` — **new** route
- `src/app/api/doc/[token]/route.ts`, `src/app/api/file/[token]/route.ts` — gate on `confirmed_at`
- `src/app/api/cron/cleanup/route.ts` — third cleanup pass for abandoned uploads
- `src/lib/supabase.ts` — `DocumentRow.confirmed_at`
- `src/app/page.tsx` — `handleUpload()` now does presign → PUT → confirm
- `docs/security.md`, `docs/schema.md` — updated per rule #8

**⚠️ Manual SQL required before this works in prod/staging:**
```sql
ALTER TABLE documents ADD COLUMN confirmed_at TIMESTAMPTZ;
```
Run this in the Supabase SQL editor (see `docs/schema.md`). Until it's run,
every `/api/upload` insert will fail (unknown column) — this needs to happen
before deploying this change.

**Verified:** `npx tsc --noEmit` clean, `npm run build` succeeds (confirms
`/api/upload/confirm` route registers correctly). `npm run lint` has ~19
pre-existing errors/warnings unrelated to this change (stray `<a>` tags,
`ThemeToggle` effect warning, etc.) — none in the touched files' new code.
**Not tested end-to-end** — no live Supabase/R2/Redis in this environment.
Please smoke-test a real upload (ideally an 8–20 MB file) after running the
migration above.

---

## Previous Session Summary
**Date:** 2026-04-09 (session 9)

### SEO & Google Search Console

**1. Google Search Console Setup** (`src/app/layout.tsx`, `src/app/sitemap.ts`, `src/app/robots.ts`)
- Added Google site verification meta tag (`-YXV_86XrlY3khfbPPD4XXSsbSU0KBX5emA2M88-4Sk`)
- Created `sitemap.ts` — generates `/sitemap.xml` listing public pages (`/`, `/share`)
- Created `robots.ts` — generates `/robots.txt` blocking `/d/`, `/status/`, `/api/` from crawlers
- Added `metadataBase`, Open Graph, Twitter cards, SEO keywords to root layout
- **Domain verified:** `printsafe.in` via DNS TXT record (domain property)

### Bug Fixes

**2. Fix: Blank first page when printing 1-page PDFs** (`src/app/d/[token]/page.tsx`)
- **Root cause:** `min-height:100vh` on the page wrapper div in the print iframe created a blank viewport-height page in print context. The separate footer `<div>` also forced a second page.
- **Fix:** Removed `min-height:100vh` and `display:flex`, moved footer inline on the last page, used `page-break-inside:avoid` instead.
- Also replaced the 100ms `setTimeout` before `print()` with `Promise.all` waiting for all images to load — ensures large 2× PNG data URLs are fully decoded before printing.

**3. Fix: View-once PDFs disappear when changing pages** (`src/app/d/[token]/page.tsx`)
- **Root cause:** With TTL=0, the `after()` callback marks the document as `deleted` in the DB immediately after serving. The 5-second status poll detects `deleted` and revokes the blob URL while the user is still viewing.
- **Fix:** Skip status polling when `ttlAfterView === 0`. The document is already decrypted in browser memory — R2 cleanup happened, no need to poll.

### Feature: Live Trust Counter & Messaging Rebrand

**4. Live trust counter** (`src/app/api/stats/route.ts`, `src/app/page.tsx`)
- New `/api/stats` API route — returns `1,000 + actual Supabase document count` (60s cache)
- Animated count-up on homepage hero (ease-out curve, 1.5s duration)
- Green pulsing dot + glassmorphism pill: "1,247+ documents securely shredded"

**5. Messaging rebrand** (`src/app/page.tsx`, `src/app/layout.tsx`)
- Hero: "Print anything. Leave nothing." → **"Share privately. Delete automatically."**
- Badge: "AES-256 Encrypted · Zero Storage" → **"AES-256 Encrypted · Auto-Destruct"**
- Description: "permanently deleted after printing" → **"permanently shredded after viewing"**
- Footer: **"Share privately. Delete automatically."** + **"Encrypted in browser · Auto-shredded · Zero trace"**
- All SEO metadata (title, description, Open Graph, Twitter) updated to match

**6. Print button text** (`src/app/d/[token]/page.tsx`)
- Changed from `🖨 Print` emoji to plain **"Print"** text

**7. Footer credit** (`src/app/page.tsx`)
- Added "Built by [Vishal Agarwal](https://www.linkedin.com/in/vishal-agarwal123/)" with LinkedIn link

**8. Cron schedule** (`vercel.json`)
- Changed from hourly (`0 * * * *`) to daily at 2 AM (`0 2 * * *`)

---

## What's Next (Phase 3)

Phase 2 is fully complete. Next up:
- Build **Progressive Web App (PWA)** capability with `manifest.json` and `service-worker.js`.
- Enable **Native Share Target API** so mobile users can "Share" from their Camera Roll direct to PrintSafe.
- Commercial mode: shop registration + Supabase Auth (Google OAuth + email OTP).
- Branded pages per shop.
- Live dashboard with real-time customer sync (WebSocket/SSE).

---

## Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| Refresh after first view shows "already opened" | Low | Known design trade-off |
