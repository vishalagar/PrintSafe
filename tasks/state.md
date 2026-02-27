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

## Previous Session Summary
**Date:** 2026-02-27 (session 4)

### 1. Fixed: Apple HDR HEIC upload fails on iPhone Safari
**Root cause:** iPhone 15 (iOS 26.1) reports Apple HDR photos (HEIC files with `tmap` gain-map) with non-standard MIME type variants like `image/heic-sequence` instead of `image/heic`. This passed the extension fallback (`file.name` still has `.HEIC`), but if iOS ever presents the file with no extension AND a variant MIME type, `getEffectiveMime` returned `""` which failed client-side validation, blocking upload entirely. Confirmed: server accepts the file fine (tested with Node.js) — issue was 100% client-side validation.
**Fix:** `getEffectiveMime` in `page.tsx` now normalizes any `file.type` that starts with `image/hei` → `image/heic`. Also improved error message to include what type was detected (for future debugging) and corrected the "PDF, JPG, or PNG" message to also mention HEIC.

### 2. Fixed: PDF print opens blank popup on Safari Private / Chrome
**Root cause:** `window.open(blobUrl)` was already the fix from last session. No regression.

### 2. Fixed: Safari Private Mode — localStorage throws SecurityError
**Root cause:** Safari blocks localStorage in Private Browsing.
**Fix:** `share/page.tsx` and `status/[token]/page.tsx` now use `sessionStorage` with a `localStorage` fallback.

### 3. Fixed: Clipboard copy fails on non-HTTPS / older iOS
**Root cause:** `navigator.clipboard.writeText()` is HTTPS-only and not available on all iOS browsers.
**Fix:** Added `document.execCommand('copy')` fallback + `copyFailed` error state in `share/page.tsx`.

### 4. Fixed: HEIC from iPhone Photos app shows broken image in Chrome/Firefox
**Root cause:** Commit `e0be67d` added `.heic` to the file input's `accept` attribute → iOS stops auto-converting to JPEG → raw HEIC bytes arrive → Chrome/Firefox cannot display HEIC blob URLs via `<img>`.
**Fix:** Added `heic2any` package. In `d/[token]/page.tsx`, after AES-GCM decryption, lazily import `heic2any` and convert HEIC/HEIF → JPEG before creating the blob URL. Dynamic import so zero bundle impact for non-HEIC uploads. `setMimeType(displayMime)` ensures `isPDF`/`isImage` checks stay consistent.

---

## Previous Session Summary
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
