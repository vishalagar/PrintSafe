# PrintSafe — Security Reference

Canonical record of every security decision, pattern, and known gap.
**Rule:** After any change to a security pattern, update this file (Security Changelog + relevant section).

---

## A. Security Invariants — NEVER VIOLATE

1. **NEVER log or store decryption keys** — keys only live in URL fragments (`#key`)
2. **NEVER send the encryption key to the server** — all crypto is 100% client-side
3. **NEVER store document contents** — server only holds ciphertext blobs in R2
4. R2 object keys must be **opaque UUIDs** — never expose original filenames in storage paths
5. All commercial mode API routes **MUST** verify `Authorization: Bearer <supabase-jwt>` header
6. Personal mode `/api/upload` **MUST** be rate-limited by IP via Upstash
7. R2 bucket must have **no public access** — pre-signed URLs only; 25-hour lifecycle rule as safety net

---

## B. Encryption Architecture

- **Algorithm:** AES-256-GCM, 256-bit key
- **Key generation:** Client-side only (`src/lib/crypto.ts` — `'use client'` enforced; never import server-side)
- **Key transport:** Exported → base64url → appended as URL `#fragment` only (never in path, query, or request body)
- **IV:** 12-byte random, stored server-side in Supabase (safe — useless without key)
- **Ciphertext flow (presigned upload):** client encrypts → POST `/api/upload` (metadata only, headers, no body) returns a presigned R2 PUT URL → browser `PUT`s ciphertext **directly to R2** as `application/octet-stream` under an opaque UUID key (never through the Vercel function body) → client `POST`s `/api/upload/confirm` `{ token }`, which `HeadObjectCommand`s R2 to verify the object landed and roughly matches the declared size, then marks the document row confirmed
  - **Why:** Vercel serverless function request bodies are capped at ~4.5 MB; the app allows files up to 25 MB (`MAX_FILE_SIZE`). Routing ciphertext through the function body silently 413'd every upload above ~4.5 MB. The presigned-PUT flow removes the Vercel body entirely from the upload path.
  - **Unconfirmed uploads are not real documents:** a `documents` row is inserted at presign time with `confirmed_at IS NULL`. `/api/doc/:token` and `/api/file/:token` treat `status = 'pending' AND confirmed_at IS NULL` as **not found** — a token can't be used to probe metadata or ciphertext for a blob that may not exist yet. The cron cleanup job (`/api/cron/cleanup`) deletes rows that stay unconfirmed for more than 1 hour, best-effort deleting the (possibly nonexistent) R2 object too.
- **Decryption flow:** GET `/api/doc/:token` (returns iv + metadata) → GET `/api/file/:token` (proxies ciphertext from R2) → browser decrypts with `#fragment` key

---

## C. API Route Auth Model

| Route | Method | Auth mechanism |
|-------|--------|----------------|
| `/api/upload` | POST | None (personal mode) — rate-limited by IP via Upstash + CAPTCHA. Issues a presigned R2 PUT URL; no file body accepted here |
| `/api/upload/confirm` | POST | Token lookup only (token is an unguessable nanoid). Verifies the R2 object via `HeadObjectCommand` before marking the row confirmed |
| `/api/doc/:token` | GET | Token lookup + confirmed-upload gate (404 if unconfirmed) + status gate (410 if `viewed`/`deleted`/`expired`) |
| `/api/doc/:token` | DELETE | `x-delete-token` header must match DB `delete_token` value |
| `/api/file/:token` | GET | Token lookup + confirmed-upload gate (404 if unconfirmed) + status gate (410 if `deleted`/`expired`; allows `viewed`) |
| `/api/status/:token` | GET | Token lookup (read-only) |
| `/api/stats` | GET | None — public, read-only aggregate count |
| `/api/cron/cleanup` | POST | `Authorization: Bearer {CRON_SECRET}` |
| Commercial routes (Phase 3) | * | `Authorization: Bearer <supabase-jwt>` |

---

## D. Input Validation (upload route)

| Field | Rule |
|-------|------|
| MIME type | Allowlist: `application/pdf`, `image/jpeg`, `image/png`, `image/heic`, `image/heif` |
| File size | Max 25 MB (26,214,400 bytes) — enforced server-side |
| TTL | Allowlist: `[0, 900, 1800, 3600]` — no other values accepted |
| Filename | `replace(/[^a-zA-Z0-9._\-\s]/g, '').trim().slice(0, 255)` — fallback `'document'` |
| Storage key | `crypto.randomUUID()` — never derived from filename |

---

## E. Data Minimisation

**IS stored:** token, delete_token, storage_key (UUID), sanitized filename, file_size, mime_type, iv, ip_hash (HMAC-SHA256 of raw IP, keyed by `IP_HASH_SECRET` — a bare SHA-256 hash of an IPv4 address is reversible via rainbow table since there are only ~4B possible inputs), timestamps, ttl_after_view

**NEVER stored:** decryption key, plaintext document content, raw IP address

---

## F. Rate Limiting

- **Function:** `checkRateLimit(key, limit, windowSeconds)` in `src/lib/redis.ts` — generic INCR-based limiter; callers scope their own key (`upload:${ip}`, `file:${token}`, `admin-login:${ip}`)
- **Limits:** 30 uploads per IP per hour (`/api/upload`, raised from 10 in session 12 — CGNAT on Indian mobile networks puts many real users behind one IP; Turnstile is the primary bot defense) · 20 ciphertext fetches per token per 5 min (`/api/file/:token`, added session 12 — stops someone holding a still-live link from re-downloading the blob in a loop before its TTL deletes it) · 5/IP + 30 global per 5 min for `/api/admin/login`
- **IP source:** `x-forwarded-for` first segment (Vercel-safe — Vercel sets this header, not the client)
- **Fail-closed:** When Redis is unavailable, `checkRateLimit` returns `false` → the calling route returns 429. No requests allowed during Redis outages.

---

## G. R2 Storage Security

- No public bucket access — pre-signed PUT URLs for uploads (`getPresignedUploadUrl`, 5-minute expiry, to give a slow connection enough time to PUT up to 25 MB). Downloads are proxied through `/api/file/:token` via the server-side SDK (`GetObjectCommand`), not a presigned GET URL — `getPresignedDownloadUrl` in `src/lib/r2.ts` is currently unused
- **Bucket CORS policy required** (session 10, 2026-09-14): the browser PUTs ciphertext directly to R2, which triggers a CORS preflight — R2 buckets have no CORS rules by default (only needed once a browser talks to the bucket directly; server-side SDK calls aren't subject to CORS). Configured in the Cloudflare dashboard (R2 → print-safe-documents → Settings → CORS Policy), allowing `PUT` + `content-type` header from `https://www.printsafe.in`, `https://printsafe.in`, and `http://localhost:3000`. The app's own R2 API token is object-scoped only and can't set this — it must be done via dashboard or a bucket-admin-scoped token. **Add any new deployment origin (preview domains, new custom domain) to this policy or uploads will fail with a CORS preflight rejection.**
- Upload presign fixes `ContentType: application/octet-stream` — the client's PUT must send the same header or the signature won't match
- `/api/upload/confirm` cross-checks the real R2 object size (`HeadObjectCommand`) against the size declared at `/api/upload` time (± a small tolerance for the AES-GCM auth tag) before marking a document confirmed — stops a client from swapping in a wildly different-sized payload than it declared
- 25-hour R2 lifecycle rule as last-resort safety net for orphaned blobs
- Ciphertext stored as `application/octet-stream` — browser cannot render directly
- `Cache-Control: no-store, no-cache` on all file proxy responses
- **Buffer pool fix** (`/api/file/[token]/route.ts`): AWS SDK `transformToByteArray()` uses `Buffer.concat()` which for files < ~4 KB allocates from Node.js 8192-byte pool (`byteOffset > 0`). Sending `bytes.buffer` (the full pool ArrayBuffer) sends garbage bytes → AES-GCM decryption failure.
  - Fix: `bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer`

---

## H. Viewer-Side Protections

| Protection | Implementation |
|------------|----------------|
| Block text selection | `userSelect: 'none'` on viewer root |
| Block right-click on images | `onContextMenu={e => e.preventDefault()}` |
| Watermark overlay | `position:fixed; z-index:500; pointer-events:none` — diagonal "PrintSafe · {token[-8:]} · Print only" at 8% opacity; `@media print { display:none }` hides it from print output |
| Rasterized PDF print | `printPDFViaCanvas()` renders each page to `<canvas>` → PNG → hidden iframe → `window.print()` — no Download button, no native PDF exposed |
| Print footer | `PrintSafe — authorised print copy · {token[-8:]} · {date}` embedded in print output |
| Remote-delete polling | Viewer polls `/api/status/:token` every 5 s; revokes blob URL immediately if status is `deleted` or `expired`. **Exception:** polling is skipped for TTL=0 (view-once) documents — the file is deleted from R2 immediately via `after()`, so polling would prematurely revoke the blob while the user is still viewing. |

---

## I. One-Time Access

- `/api/doc/:token` returns **410** if status is `viewed`, `deleted`, or `expired`
- Status atomically set to `viewed` via `.eq('status', 'pending')` guard — prevents race condition on concurrent requests
- `/api/file/:token` still allows `viewed` status (legitimate viewer continues fetching ciphertext after `/api/doc` marks it viewed)

---

## H2. CAPTCHA (Cloudflare Turnstile)

- **Widget:** `react-turnstile` on the upload page (`src/app/page.tsx`) — rendered only when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set
- **Server verify:** `/api/upload` calls `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `TURNSTILE_SECRET_KEY` before processing any upload
- **Dev mode:** If `TURNSTILE_SECRET_KEY` is not set, verification is skipped — safe for local development without CAPTCHA keys
- **Token transport:** Via `x-captcha-token` request header (never in URL or body)
- **Reset on failure:** Widget re-renders (via key increment) after a failed upload so user can solve again

---

## J. Known Gaps

| Gap | Severity | Status |
|-----|----------|--------|
| ~~Rate limit fails open when Redis is down~~ | Medium | ✅ Fixed — fail-closed (session 7) |
| ~~No CAPTCHA on upload~~ | Medium | ✅ Fixed — Cloudflare Turnstile (session 7) |
| ~~TTL=0: blob stays in R2 after first view until cron runs~~ | Medium | ✅ Fixed — `after()` immediate deletion (session 7) |
| `x-forwarded-for` spoofable off Vercel | Low | Vercel overwrites this header — safe on Vercel only; document infra requirement |
| ~~No CSP / security headers~~ | Low | ✅ Partially fixed (session 12) — `nosniff`, HSTS, `Referrer-Policy`, `Permissions-Policy` site-wide + `X-Frame-Options: DENY` on `/d/:token`. No CSP yet — Turnstile/PostHog/Sentry all load third-party scripts, so a strict CSP needs per-script nonces and a real browser pass, not a drive-by add |
| No RLS policies (service_role bypasses row-level security) | Low | By design for Phase 1; add per-user policies in Phase 3 |
| ~~`ttl_after_view` only enforced by daily cron~~ | Medium | ✅ Fixed (session 12) — `delete_after` column + lazy deletion on read in `/api/file` and `/api/status`, see section B and `src/lib/document-lifecycle.ts` |
| ~~`ip_hash` was unsalted SHA-256 (reversible for IPv4)~~ | Low | ✅ Fixed (session 12) — HMAC-SHA256 keyed by `IP_HASH_SECRET` |
| `/api/file/:token` has no rate limit beyond the one-time-access gate | Medium | ✅ Fixed (session 12) — 20 requests / 5 min per token |

---

## K. Security Changelog

*(newest first)*

| Date | Change |
|------|--------|
| 2026-09-15 | **TTL enforcement + hardening pass (session 12)** — added `delete_after` column, enforced lazily by `/api/file` and `/api/status` (previously only the daily cron enforced `ttl_after_view`, so a document could still be downloaded past its stated deletion window). Fixed the cron's viewed-docs query to filter `delete_after` in SQL instead of paginating 100 rows and filtering in JS (could silently skip overdue docs once >100 were live). `ip_hash` switched from unsalted SHA-256 to HMAC-SHA256 (`IP_HASH_SECRET`) — SHA-256 of an IPv4 is reversible via rainbow table. Added a per-token rate limit to `/api/file/:token` (20/5min). Raised the upload rate limit to 30/hr/IP (CGNAT). `/api/upload/confirm` now deletes a size-mismatched R2 object immediately instead of leaving it for the 1-hour abandoned-upload cron pass. Fixed the document viewer's unmount cleanup revoking a stale `null` blob URL instead of the real one (closure captured the initial render's state). Added `nosniff`/HSTS/`Referrer-Policy`/`Permissions-Policy` site-wide and `X-Frame-Options: DENY` on `/d/:token` via `next.config.ts` `headers()` |
| 2026-09-14 | **Presigned R2 upload flow** — fixes files 4.5–25 MB silently failing (Vercel serverless body cap ~4.5 MB, app allows up to 25 MB). `/api/upload` now returns a presigned R2 PUT URL instead of accepting the ciphertext body; browser PUTs directly to R2; new `/api/upload/confirm` verifies the object landed (`HeadObjectCommand`, size cross-check) before the document is servable. Added nullable `documents.confirmed_at` column — a `'pending'` row with `confirmed_at IS NULL` is an in-progress/abandoned upload, not a real document; `/api/doc/:token` and `/api/file/:token` now 404 on it instead of leaking metadata or attempting to proxy a nonexistent blob. Cron cleanup gained a third pass purging rows unconfirmed for over 1 hour (session 10) |
| 2026-04-09 | SEO: sitemap.ts, robots.ts, Google site verification, Open Graph/Twitter metadata. Fixed blank 1st page in PDF print (removed `min-height:100vh`). Fixed view-once PDFs disappearing on page change (skip status polling for TTL=0). Added `/api/stats` public route. (session 9) |
| 2026-03-06 | Rate limit fail-closed; TTL=0 immediate R2 deletion via `after()`; Cloudflare Turnstile CAPTCHA on upload (session 7) |
| 2026-02-27 | Added: rasterized PDF print via canvas, watermark overlay, `userSelect:none`, remote-delete polling (session 5) |
| 2026-02-26 | Added: cron cleanup route (`/api/cron/cleanup`), HEIC/HEIF support, one-time 410 gate extended to `viewed` status |
| Initial | AES-256-GCM encryption, R2 presigned-only access, IP rate limiting, `delete_token` auth on DELETE route |
