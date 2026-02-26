# Project State

> **Update this file at the end of every session.**
> Format: what was done · why · what's next · any blockers.
> **If this file exceeds 150 lines → move older sessions to `tasks/history.md` (append-only).**

---

## Current Phase
**Phase 1 — Personal Mode MVP** ← **FULLY WORKING end-to-end ✅**
**Phase 2 — Security Hardening** ← **IN PROGRESS**

---

## Last Session Summary
**Date:** 2026-02-26 (session 2)

### 1. Fixed: image rendered under the grid overlay (`d/[token]/page.tsx`)
**Root cause:** `body::before` (grid) has `position: fixed; z-index: 0` — paints over non-positioned block elements.
**Fix:** Added `position: relative; zIndex: 1` to the outer page wrapper.

### 2. Fixed: Print button printing full page UI + PDF only printing 1 page
**Root cause:** `window.print()` captures the entire DOM; react-pdf only renders current page as `<canvas>`.
**Fix:** All printing now uses a hidden `<iframe>`:
- **PDFs:** `frame.src = blobUrl` — native PDF renderer, all pages
- **Images:** `contentDocument.write()` with `@page { margin: 0; size: auto }` + `object-fit: contain` — one clean page
- `afterprint` event cleans up the iframe

### 3. Fixed: Borders on image/PDF viewer looked like part of the document
**Fix:** Removed `border`, `borderRadius`, `boxShadow` from `<img>` and its wrapper. Added global CSS override `.react-pdf__Page, .react-pdf__Page canvas { box-shadow: none !important; border: none !important; }`.

### 4. Fixed: PrintSafe logo not clickable on home + share pages
**Fix:** Wrapped logo `<div>` in `<a href="/" style="text-decoration:none; color:inherit">` on `page.tsx` and `share/page.tsx`.

### 5. CLAUDE.md maintenance
- Removed stale `open index.html` command (file deleted)
- Fixed Next.js version "14+" → "16"
- Updated Phase 1 → ✅ COMPLETE, Phase 2 → current
- Archived old session logs to `tasks/history.md`

---

## What's Next (Phase 2 — continued)

1. ~~**Cron cleanup job**~~ ✅ Done
2. **TTL=0 immediate deletion** — when `ttl_after_view === 0`, delete from R2 + mark deleted after file is served. Use `after()` from `next/server`. Currently blob stays in R2 until cron runs.
3. **Rate limit hardening** — fail closed when Redis is down (currently fails open)
4. **CAPTCHA on upload** — hCaptcha or Cloudflare Turnstile
5. **Vercel deployment** — env vars + CRON_SECRET in Vercel dashboard, configure Vercel Cron for `/api/cron/cleanup`
6. **Phase 3 prep** — Commercial mode: shop auth, branded pages, live dashboard

---

## Known Issues

| Issue | Severity | Fix |
|-------|----------|-----|
| ~~No cron cleanup for expired docs~~ | ~~Medium~~ | ✅ Done |
| ~~DOCX can't be previewed/printed~~ | ~~Medium~~ | ✅ Done — removed |
| TTL=0 blob stays in R2 after first view | Medium | Phase 2: `after()` from `next/server` |
| Rate limit fails open if Redis is down | Medium | Phase 2: fail closed |
| No CAPTCHA on upload | Medium | Phase 2: hCaptcha or Turnstile |
| Refresh after first view shows "already opened" | Low | Known design trade-off |
