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

## Session: 2026-02-26 (session 2)

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

## Session: 2026-02-27 (session 4)

### 1. Fixed: Apple HDR HEIC upload fails on iPhone Safari
**Root cause:** iPhone 15 (iOS 26.1) reports Apple HDR photos (HEIC files with `tmap` gain-map) with non-standard MIME type variants like `image/heic-sequence` instead of `image/heic`. This passed the extension fallback (`file.name` still has `.HEIC`), but if iOS ever presents the file with no extension AND a variant MIME type, `getEffectiveMime` returned `""` which failed client-side validation, blocking upload entirely. Confirmed: server accepts the file fine (tested with Node.js) — issue was 100% client-side validation.
**Fix:** `getEffectiveMime` in `page.tsx` now normalizes any `file.type` that starts with `image/hei` → `image/heic`. Also improved error message to include what type was detected (for future debugging) and corrected the "PDF, JPG, or PNG" message to also mention HEIC.

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

## Session: 2026-02-27 (session 5)

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

## Session: 2026-03-06 (session 7)

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

## Session: 2026-04-09 (session 8)

### UI/UX & Native Polish

**1. Premium System UI Typography** (`src/app/globals.css`, `src/app/layout.tsx`)
- Removed external Google Fonts (`DM Sans`, `JetBrains Mono`, `Fraunces`).
- Switched CSS variables to standard native stacks (`-apple-system`, `BlinkMacSystemFont`, `ui-serif`, `ui-monospace`).
- **Why:** Delivers a high-end, native app feel. Reduces layout shift and FOUC, drastically speeding up initial render times by cutting out third-party network payloads.

**2. Initial SEO setup**
- Added `sitemap.ts` and `robots.ts` to `src/app/` to configure crawling policies.

---

## Session: 2026-04-09 (session 9)

### SEO & Google Search Console
- Google site verification meta tag added to `layout.tsx`
- `metadataBase`, Open Graph, Twitter cards, SEO keywords added
- Domain verified: `printsafe.in` via DNS TXT record

### Bug Fixes
**1. Fix: Blank first page when printing 1-page PDFs** (`d/[token]/page.tsx`)
- Removed `min-height:100vh` from print iframe wrapper (created blank page in print context)
- Replaced 100ms `setTimeout` with `Promise.all` waiting for all images to load before `print()`

**2. Fix: View-once PDFs disappear when changing pages** (`d/[token]/page.tsx`)
- TTL=0 `after()` callback marks doc as `deleted` immediately → status poll revoked blob URL
- Fix: Skip status polling when `ttlAfterView === 0`

### Features
**3. Live trust counter** (`api/stats/route.ts`, `page.tsx`)
- `/api/stats` returns 1,000 + actual Supabase count (60s cache)
- Animated count-up on homepage hero with ease-out curve

**4. Messaging rebrand**
- Hero: "Share privately. Delete automatically."
- Description: "permanently shredded after viewing"
- Footer: "Encrypted in browser · Auto-shredded · Zero trace"
- All SEO metadata updated to match

**5. Print button** — changed from `🖨 Print` to plain "Print" text
**6. Footer credit** — "Built by Vishal Agarwal" with LinkedIn link
**7. Cron schedule** — changed to daily at 2 AM (`0 2 * * *`)

---
