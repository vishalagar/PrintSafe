# Architecture

## Project Structure

```
/Code
  /src/app                    → Next.js App Router pages
  /src/app/page.tsx           → Upload page (/)
  /src/app/share/page.tsx     → Link ready (/share)
  /src/app/d/[token]/page.tsx → Document viewer (one-time, decrypts in browser)
  /src/app/status/[token]/page.tsx → Status & delete (/status/[token])
  /src/app/admin/stats/page.tsx       → Admin stats dashboard (password-gated)
  /src/app/api/upload/route.ts        → Issue presigned R2 PUT URL (metadata only, no body)
  /src/app/api/upload/confirm/route.ts → Verify the presigned PUT landed, mark document confirmed
  /src/app/api/doc/[token]/route.ts   → Mark viewed, return iv/mimeType/ttl (no blob); DELETE = manual delete
  /src/app/api/file/[token]/route.ts  → Proxy encrypted blob from R2 (browser can't fetch R2 directly)
  /src/app/api/status/[token]/route.ts → Status check
  /src/app/api/stats/route.ts         → Public seeded+real document count (for the upload page's trust counter)
  /src/app/api/cron/cleanup/route.ts  → Purge expired/stale/abandoned docs from R2 (CRON_SECRET protected)
  /src/app/api/cron/keepalive/route.ts → Daily ping to Supabase + Redis so free-tier inactivity policies don't pause them
  /src/app/api/admin/login/route.ts   → Admin session cookie login (rate-limited, ADMIN_SECRET)
  /src/app/api/admin/logout/route.ts  → Admin session logout
  /src/app/shop/[slug]        → Shop branded upload page (public) — Phase 3, not built yet
  /src/app/dashboard          → Shop operator dashboard — Phase 3, not built yet
  /src/components             → Reusable UI components
  /src/lib/crypto.ts          → AES-256-GCM helpers (client-side only)
  /src/lib/r2.ts              → Cloudflare R2 client
  /src/lib/supabase.ts        → Supabase client
  /src/lib/redis.ts           → Upstash Redis client + generic rate limiter
  /src/lib/document-lifecycle.ts → TTL deadline computation + lazy delete-on-read
  /src/lib/document-constants.ts → Shared MIME/TTL/size allowlists (client + server)
  /src/lib/ip-hash.ts          → HMAC-SHA256 IP hashing for the audit trail
  /src/lib/admin-auth.ts       → Admin session cookie verification (Redis-backed)
  /src/lib/admin-stats.ts      → Aggregate queries for the admin dashboard
  /src/lib/format.ts           → formatBytes()
  /public                     → Static assets
  /tasks                      → state.md · history.md
  /docs                       → This folder — detailed reference files
```

---

## Encryption Pattern

```ts
// Key generation (client-side only)
const key = await crypto.subtle.generateKey(
  { name: 'AES-GCM', length: 256 },
  true,
  ['encrypt', 'decrypt']
);

// Key exported to URL fragment — NEVER sent to server
// URL: https://printsafe.in/d/<token>#<base64url-key>
```

- Algorithm: AES-256-GCM via Web Crypto API (browser-native, no library)
- Key lives in `#fragment` only — browsers never include fragments in HTTP requests
- Flow: Encrypt → PUT ciphertext directly to R2 via a presigned URL → confirm with server → download ciphertext via proxy → decrypt in browser. See `docs/security.md` section B for the full presigned-upload sequence.

## PDF.js Worker

`postinstall` in `package.json` copies `pdfjs-dist/build/pdf.worker.min.mjs` → `public/pdf.worker.min.mjs`. The viewer sets `pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'`. Use this path — CDN does not reliably host pdfjs v5.

---

## API Route Map

```
# Personal Mode
POST /api/upload                     → Rate-limited + CAPTCHA-gated. Issues a presigned R2 PUT URL (no body accepted)
POST /api/upload/confirm             → Verify the client's presigned PUT landed in R2 before the doc is servable
GET  /api/doc/:token                 → Mark viewed, return iv/mimeType/ttl — 410 if already viewed/deleted/expired
GET  /api/file/:token                → Proxy encrypted ciphertext blob from R2 (avoids browser CORS); rate-limited per token
GET  /api/status/:token              → Check status (for uploader); lazily deletes past-TTL 'viewed' docs
GET  /api/stats                      → Public: returns total document count (seeded 1000 + real; 60s cache)
DEL  /api/doc/:token                 → Manual delete by uploader (x-delete-token header)
GET|POST /api/cron/cleanup           → Purge expired/stale/abandoned docs (Authorization: Bearer CRON_SECRET) — daily at 2 AM
GET|POST /api/cron/keepalive         → Ping Supabase + Redis to avoid free-tier pause — daily at 3 AM
POST /api/admin/login                → Admin password login, sets a Redis-backed opaque session cookie
POST /api/admin/logout               → Clears the admin session

# Commercial Mode (auth required except /shop/:slug) — Phase 3, not built yet
POST /api/shop/register              → Register shop
GET  /shop/:slug                     → Customer upload page (public)
POST /api/shop/:shop_id/upload       → Upload via shop, creates print_job
WS   /api/shop/:shop_id/live         → Real-time dashboard feed
POST /api/shop/job/:job_id/complete  → "Printed & Delete" action
GET  /api/status/:token/stream       → SSE for customer live status
```
