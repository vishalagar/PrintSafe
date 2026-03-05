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
- **Ciphertext flow:** client encrypts → POST `/api/upload` (binary body) → R2 as `application/octet-stream` under opaque UUID key
- **Decryption flow:** GET `/api/doc/:token` (returns iv + metadata) → GET `/api/file/:token` (proxies ciphertext from R2) → browser decrypts with `#fragment` key

---

## C. API Route Auth Model

| Route | Method | Auth mechanism |
|-------|--------|----------------|
| `/api/upload` | POST | None (personal mode) — rate-limited by IP via Upstash |
| `/api/doc/:token` | GET | Token lookup + status gate (410 if `viewed`/`deleted`/`expired`) |
| `/api/doc/:token` | DELETE | `x-delete-token` header must match DB `delete_token` value |
| `/api/file/:token` | GET | Token lookup + status gate (410 if `deleted`/`expired`; allows `viewed`) |
| `/api/status/:token` | GET | Token lookup (read-only) |
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

**IS stored:** token, delete_token, storage_key (UUID), sanitized filename, file_size, mime_type, iv, ip_hash (SHA-256 of raw IP), timestamps, ttl_after_view

**NEVER stored:** decryption key, plaintext document content, raw IP address

---

## F. Rate Limiting

- **Function:** `checkRateLimit()` in `src/lib/redis.ts`
- **Limit:** 10 uploads per IP per hour
- **IP source:** `x-forwarded-for` first segment (Vercel-safe — Vercel sets this header, not the client)
- **⚠️ Known gap:** Fails open (allows requests) when Redis is unavailable — Phase 2 hardening needed (see Section J)

---

## G. R2 Storage Security

- No public bucket access — pre-signed URLs only (60-second expiry)
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
| Remote-delete polling | Viewer polls `/api/status/:token` every 5 s; revokes blob URL immediately if status is `deleted` or `expired` |

---

## I. One-Time Access

- `/api/doc/:token` returns **410** if status is `viewed`, `deleted`, or `expired`
- Status atomically set to `viewed` via `.eq('status', 'pending')` guard — prevents race condition on concurrent requests
- `/api/file/:token` still allows `viewed` status (legitimate viewer continues fetching ciphertext after `/api/doc` marks it viewed)

---

## J. Known Gaps

| Gap | Severity | Planned fix |
|-----|----------|-------------|
| Rate limit fails open when Redis is down | Medium | Fail closed: throw 429 when Redis unavailable |
| No CAPTCHA on upload | Medium | Add hCaptcha or Cloudflare Turnstile to `/api/upload` |
| TTL=0: blob stays in R2 after first view until cron runs | Medium | Use `after()` from `next/server` to trigger deletion immediately post-response |
| `x-forwarded-for` spoofable off Vercel | Low | Vercel overwrites this header — safe on Vercel only; document infra requirement |
| No CSP / security headers | Low | Add via `next.config.ts` `headers()` in Phase 2 |
| No RLS policies (service_role bypasses row-level security) | Low | By design for Phase 1; add per-user policies in Phase 3 |

---

## K. Security Changelog

*(newest first)*

| Date | Change |
|------|--------|
| 2026-02-27 | Added: rasterized PDF print via canvas, watermark overlay, `userSelect:none`, remote-delete polling (session 5) |
| 2026-02-26 | Added: cron cleanup route (`/api/cron/cleanup`), HEIC/HEIF support, one-time 410 gate extended to `viewed` status |
| Initial | AES-256-GCM encryption, R2 presigned-only access, IP rate limiting, `delete_token` auth on DELETE route |
