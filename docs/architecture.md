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
  /src/app/api/doc/[token]/route.ts   → Fetch blob once / delete
  /src/app/api/status/[token]/route.ts → Status check
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

---

## API Route Map

```
# Personal Mode
POST /api/upload                     → Receive encrypted blob, store in R2
GET  /api/doc/:token                 → Fetch blob once, mark viewed
GET  /api/status/:token              → Check status (for uploader)
DEL  /api/doc/:token                 → Manual delete by uploader

# Commercial Mode (auth required except /shop/:slug) — Phase 3
POST /api/shop/register              → Register shop
GET  /shop/:slug                     → Customer upload page (public)
POST /api/shop/:shop_id/upload       → Upload via shop, creates print_job
WS   /api/shop/:shop_id/live         → Real-time dashboard feed
POST /api/shop/job/:job_id/complete  → "Printed & Delete" action
GET  /api/status/:token/stream       → SSE for customer live status
```
