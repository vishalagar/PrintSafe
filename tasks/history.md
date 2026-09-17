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

---

## Session: 2026-04-09 (session 9)

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

## Session: 2026-09-14 (session 10)

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

**Migration:** `ALTER TABLE documents ADD COLUMN confirmed_at TIMESTAMPTZ;` —
✅ run in Supabase (production).

**Also this session:**
- Extended the same `confirmed_at` gate to `/api/status/[token]/route.ts`
  (previously only `/api/doc` and `/api/file` hid unconfirmed uploads —
  `/api/status` was leaking `pending` status for rows with no blob yet).
- **R2 CORS was missing** — the presigned-PUT flow requires the browser to
  send a cross-origin `PUT` straight to R2, which needs a bucket CORS policy;
  it never needed one before (server SDK calls aren't subject to CORS). First
  real upload attempt failed with `curl` succeeding but the browser failing —
  confirmed via `OPTIONS` preflight returning `"CORS not configured for this
  bucket"`. Fixed by adding a CORS policy in the Cloudflare dashboard (R2 →
  print-safe-documents → Settings) allowing `PUT` from `https://www.printsafe.in`,
  `https://printsafe.in`, and `http://localhost:3000`. The app's own R2 API
  token doesn't have bucket-admin scope, so this can't be set from the app's
  env credentials — dashboard (or a broader-scoped token) is required.
- Merged `dev` → `main` and deployed. **Note:** `main` has a GitHub ruleset
  requiring linear history (no merge commits) — used `git merge --squash`
  instead of a normal merge. Live on `main` @ `0460dba`, Vercel deployment
  `dpl_2f52nUa82GzzaQ2HhqJn1myauNsv`, READY, production.

**Verified:** `npx tsc --noEmit` clean, `npm run build` succeeds. The original
Vercel-413 failure was diagnosed from an 8 MB PNG that failed on production
before this fix (not separately reproduced locally, since the body limit is
Vercel-platform-specific and doesn't apply to `next dev`). The CORS failure
*was* reproduced live via Chrome browser automation against local dev after
the presigned-upload code was in place, root-caused via an `OPTIONS`
preflight returning `"CORS not configured for this bucket"`. User confirmed
the upload succeeds end-to-end in production after both fixes were applied.

---

## Session: 2026-09-15 (session 11)

### Fix: PDF preview/print showing white/blank pages on iPhone Safari

**Root cause:** `d/[token]/page.tsx` handed pdf.js a `blob:` object URL
(`{ url: blobUrl }`) for both the react-pdf preview and the canvas-based
print path (`printPDFViaCanvas`). pdf.js does range-request-style fetches
against that URL; WebKit's stricter `Headers` validation throws partway
through on a synthetic `blob:` response, which pdf.js swallows internally,
leaving every page blank. Chromium tolerates the same call, which is why
it worked on desktop (Chrome/Brave/laptop Safari not affected) but failed
on every PDF on iPhone/iPad Safari. Matches pdf.js upstream issue
[#19205](https://github.com/mozilla/pdf.js/issues/19205).

**Fix:** pass the raw decrypted bytes to pdf.js instead of a blob URL —
sidesteps the fetch/Headers path entirely.
- Added `pdfBytes` (`Uint8Array`) state, set alongside `blobUrl` after
  decryption when `mimeType === 'application/pdf'`.
- `PDFViewer` now takes `pdfBytes` and passes `{ data: pdfBytes.slice() }`
  to react-pdf's `<Document file={...}>` (memoized via `useMemo` — react-pdf
  re-parses whenever the `file` object reference changes).
- `printPDFViaCanvas` now takes `bytes: Uint8Array` and calls
  `pdfjsLib.getDocument({ data: bytes.slice() })`.
- `.slice()` in both call sites avoids pdf.js transferring/detaching the
  shared `pdfBytes` buffer, keeping `blobUrl`'s independent copy intact for
  image handling and cleanup (`blobUrl` itself is unchanged, still used for
  `<img>` display and `URL.revokeObjectURL`).

**Verified:** `npx tsc --noEmit` clean; `npm run lint` shows no new issues
in the touched file. Reproduced the original bug's *absence in Chromium*
and confirmed the fix doesn't regress it: drove the full upload → decrypt
→ preview → print flow against local dev with headless Brave (no browser
extension available this session) using an 8-page real PDF, reading actual
canvas/image pixel data (not just "no exception") before and after the
change — ~15–17% non-white pixels per page both times. **Not yet verified
on a real iPhone/iPad Safari** — no way to drive Safari from this session;
user should confirm on-device before considering this closed.

**Files changed:** `src/app/d/[token]/page.tsx` only.

---

## Session 12 — 2026-09-15
**Date:** 2026-09-15 (session 12)

### Codebase review + fixes: correctness, security, lint/audit, dead code, doc drift

Full pass over the repo requested by the user ("go through it and mf and
code, see where it can be improved"). Committed the session-11 work that
was still sitting uncommitted (Sentry, admin dashboard, Safari PDF fix),
then found and fixed:

**Correctness/security (commit `2cd6c42`):**
- `ttl_after_view` was only enforced by the daily cron — a document could
  still be fetched via `/api/file` and `/api/status` still showed "Viewed"
  with a countdown stuck at 00:00, well past its stated deletion window.
  Added `documents.delete_after` column + `src/lib/document-lifecycle.ts`;
  `/api/file` and `/api/status` now lazily delete a document the instant
  its deadline passes. **Needs a DB migration before deploy — see
  `docs/schema.md`.**
- Cron's viewed-docs pass fetched the first 100 `'viewed'` rows with no
  filter and checked the deadline in JS — once there were >100 live viewed
  docs, overdue ones could be pushed off page 1 and never purged. Fixed to
  filter `delete_after` in SQL directly.
- `ip_hash` was unsalted SHA-256 of an IPv4 (reversible via rainbow table —
  only ~4B possible inputs). Switched to HMAC-SHA256 keyed by
  `IP_HASH_SECRET`. **Needs the new env var set in every environment before
  deploy — see `docs/setup.md`.** Added to local `.env.local` already.
- `/api/file/:token` had no rate limit beyond the one-time-access gate —
  added 20 requests/5min per token.
- `/api/upload` limit raised 10 → 30/hr/IP (Jio/Airtel CGNAT puts many real
  users behind one IP; Turnstile is the actual bot defense).
- `/api/upload/confirm` now deletes a size-mismatched R2 object immediately
  instead of leaving it for the 1-hour abandoned-upload cron pass.
- Document viewer's unmount cleanup was revoking a stale `null` blob URL
  instead of the real one (closure captured state from the initial render).
- Added `nosniff`/HSTS/`Referrer-Policy`/`Permissions-Policy` site-wide and
  `X-Frame-Options: DENY` on `/d/:token` (no CSP yet — needs per-script
  nonces because of Turnstile/PostHog/Sentry, deferred as a dedicated pass).
- Deliberately did **not** switch `/api/file` from proxying to a presigned
  redirect (would cut R2 bandwidth through the function) — needs a
  Cloudflare R2 CORS policy change for GET that can't be made or verified
  from this session; risk of breaking decryption in prod if forgotten.

**Lint/audit/dead code (commits `37ba2a5`, `54312df`, `c5acc29`, `2f288a9`):**
- ESLint: 19 errors → 0 (internal `<a>` → `next/link`, `ThemeToggle`
  set-state-in-effect, unescaped quotes). Ignored `public/**` — the vendored
  pdf.js worker file was ~1,477 of ~1,495 total warnings.
- `npm audit`: 2 critical + 7 high → 0. `npm audit fix` cleared `ws`/
  `protobufjs`; bumped `next` 16.1.6 → 16.3.5 (same-major patch) for the
  rest.
- Removed 5 unused dependencies (`class-variance-authority`, `radix-ui`,
  `lucide-react`, `tw-animate-css`, `shadcn`) — 307 packages out of
  `node_modules`. App uses inline styles throughout, not shadcn/ui.
- Deduplicated MIME/TTL/size constants and `formatBytes()` that were
  hand-copied between the client upload page and the server upload route
  (a real drift risk, not just repetition) into `src/lib/document-constants.ts`
  and `src/lib/format.ts`.
- Rewrote `test-e2e.mjs`, which still posted the ciphertext body straight to
  `/api/upload` — broken since the presigned-upload migration (session 10).
  **Not executed this session** (no tmux available to hold a dev server) —
  checked by inspection against each route's contract only.

**Docs (commit `772e663`):** `architecture.md` project structure/route map,
`design.md`'s incorrect Web Share API claim, created `tasks/lessons.md`
(referenced by `docs/workflow.md` since it was written, never existed),
replaced the unedited create-next-app `README.md`.

**Verified:** `npx tsc --noEmit` clean, `npm run lint` 0 errors (4 remaining
`<img>`-vs-`next/image` warnings, not fixed — low value for a blob:/small-
logo use case), `npm run build` succeeds after every commit in this session.

**Not verified live:** the rewritten `test-e2e.mjs`, and the new
`delete_after` lazy-deletion path haven't been run against a real dev
server + Supabase/R2 in this session.

> Session 11 summary (Safari PDF blank-page fix) moved to `tasks/history.md`.
