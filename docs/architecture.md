# Architecture

## Project Structure

```
/Code
  /src/app                    → Next.js App Router pages
  /src/app/page.tsx           → Upload page (/)
  /src/app/share/page.tsx     → Link ready (/share)
  /src/app/d/[token]/page.tsx → Document viewer (one-time, decrypts in browser)
  /src/app/status/[token]/page.tsx → Status & delete (/status/[token])
  /src/app/api/upload/route.ts        → Receive encrypted blob, store in R2
  /src/app/api/doc/[token]/route.ts   → Mark viewed, return iv/mimeType/ttl (no blob)
  /src/app/api/file/[token]/route.ts  → Proxy encrypted blob from R2 (browser can't fetch R2 directly)
  /src/app/api/status/[token]/route.ts → Status check
  /src/app/api/cron/cleanup/route.ts  → Purge expired/stale docs from R2 (CRON_SECRET protected)
  /src/app/shop/[slug]        → Shop branded upload page (public) — Phase 3
  /src/app/dashboard          → Shop operator dashboard — Phase 3
  /src/components             → Reusable UI components
  /src/lib/crypto.ts          → AES-256-GCM helpers (client-side only)
  /src/lib/r2.ts              → Cloudflare R2 client
  /src/lib/supabase.ts        → Supabase client
  /src/lib/redis.ts           → Upstash Redis client
  /public                     → Static assets
  /tasks                      → state.md · lessons.md
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
- Flow: Encrypt → upload ciphertext → server stores opaque blob → download ciphertext → decrypt in browser

## PDF.js Worker

`postinstall` in `package.json` copies `pdfjs-dist/build/pdf.worker.min.mjs` → `public/pdf.worker.min.mjs`. The viewer sets `pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'`. Use this path — CDN does not reliably host pdfjs v5.

---

## API Route Map

```
# Personal Mode
POST /api/upload                     → Receive encrypted blob, store in R2
GET  /api/doc/:token                 → Mark viewed, return iv/mimeType/ttl — 410 if already viewed
GET  /api/file/:token                → Proxy encrypted ciphertext blob from R2 (avoids browser CORS)
GET  /api/status/:token              → Check status (for uploader)
GET  /api/stats                       → Public: returns total document count (seeded 1000 + real; 60s cache)
DEL  /api/doc/:token                 → Manual delete by uploader
POST /api/cron/cleanup               → Purge expired/stale docs (Authorization: Bearer CRON_SECRET) — daily at 2 AM

# Commercial Mode (auth required except /shop/:slug) — Phase 3
POST /api/shop/register              → Register shop
GET  /shop/:slug                     → Customer upload page (public)
POST /api/shop/:shop_id/upload       → Upload via shop, creates print_job
WS   /api/shop/:shop_id/live         → Real-time dashboard feed
POST /api/shop/job/:job_id/complete  → "Printed & Delete" action
GET  /api/status/:token/stream       → SSE for customer live status
```
