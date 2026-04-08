# Project State

> **Update this file at the end of every session.**
> Format: what was done · why · what's next · any blockers.
> **If this file exceeds 150 lines → move older sessions to `tasks/history.md` (append-only).**

---

## Current Phase
**Phase 1 — Personal Mode MVP** ← **FULLY WORKING end-to-end ✅**
**Phase 2 — Security Hardening** ← **COMPLETE ✅**
**Phase 3 — Commercial Mode** ← **next**

---

## Last Session Summary
**Date:** 2026-03-06 (session 7)

### Phase 2 Security Hardening — all items complete ✅

**1. Rate limit fail-closed** (`src/lib/redis.ts`, `src/app/api/upload/route.ts`)
- `checkRateLimit` now returns `false` (instead of `true`) when Redis is unavailable
- Upload route outer catch also changed from `allowed = true` to `allowed = false`
- Result: Redis outage → all uploads blocked (429), not allowed through

**2. TTL=0 immediate R2 deletion** (`src/app/api/file/[token]/route.ts`)
- Added `after()` from `next/server` to run cleanup after response is sent
- When `ttl_after_view === 0` ("view once"): `deleteR2Object()` + status → `deleted` fires immediately post-response
- DB query updated to select `ttl_after_view` alongside `storage_key` and `status`

**3. CAPTCHA (Cloudflare Turnstile)** (`src/app/page.tsx`, `src/app/api/upload/route.ts`)
- `react-turnstile` installed; widget renders above submit button when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set
- Submit button disabled until CAPTCHA solved (when site key configured)
- Widget resets (key increment) after failed upload attempt
- Server verifies via Turnstile siteverify API; skipped if `TURNSTILE_SECRET_KEY` not set (dev-friendly)

**4. Vercel deployment** (`vercel.json`, `docs/setup.md`)
- `vercel.json` created with hourly cron for `/api/cron/cleanup`
- `docs/setup.md` updated with full Vercel deployment instructions + new env vars

---

## Previous Session Summary
**Date:** 2026-02-27 (session 5)

### 1. Security: PDF print — eliminated blob URL new-tab exposure
**Problem:** `window.open(blobUrl, '_blank')` exposed the raw PDF in a new tab with a native Download button, bypassing PrintSafe's one-time-use intent entirely.
**Fix:** `printPDFViaCanvas()` in `d/[token]/page.tsx` — uses `pdfjs-dist` (already a dependency) to render each page to canvas at 2× scale, serialises to PNG data URLs, writes all pages into a hidden iframe, calls `frame.contentWindow.print()`. No new tab; no Download button in the PDF viewer. "Save as PDF" output is rasterized images, not the original vector PDF.
**Bonus:** Print footer embedded in iframe HTML — `PrintSafe — authorised print copy · {token.slice(-8)} · {date}` — makes any "Save as PDF" output traceable.

### 2. Security: Watermark overlay for screenshot deterrence
**Problem:** Documents rendered in plain HTML/canvas — screenshots untraceable.
**Fix:** `position: fixed; inset: 0; pointer-events: none; z-index: 500` div with a tiled SVG background. Diagonal text `PrintSafe · {token[-8:]} · Print only` at 8% opacity. Visible in screenshots/screen recordings; hidden in print (`no-print` class). Token suffix makes each link's screenshots distinguishable.

### 3. Security: `user-select: none` on viewer root
Added `userSelect: 'none'` to the top-level viewer div — blocks text selection and ctrl+C from the document viewer page.

### 4. UX: isPrinting state + spinner on Print button
While canvas rendering runs (1–3s for multi-page PDFs), the Print button disables itself and shows a spinner + "Preparing print…" label. Prevents double-clicks.

---

## What's Next (Phase 3)

Phase 2 is fully complete. Next up:
- Commercial mode: shop registration + Supabase Auth (Google OAuth + email OTP)
- Branded pages per shop
- Live dashboard with real-time customer sync (WebSocket/SSE)
- Per-user RLS policies in Supabase

---

## Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| ~~No cron cleanup for expired docs~~ | ~~Medium~~ | ✅ Done |
| ~~DOCX can't be previewed/printed~~ | ~~Medium~~ | ✅ Done — removed |
| ~~TTL=0 blob stays in R2 after first view~~ | ~~Medium~~ | ✅ Done — session 7 |
| ~~Rate limit fails open if Redis is down~~ | ~~Medium~~ | ✅ Done — session 7 |
| ~~No CAPTCHA on upload~~ | ~~Medium~~ | ✅ Done — session 7 |
| Refresh after first view shows "already opened" | Low | Known design trade-off |
