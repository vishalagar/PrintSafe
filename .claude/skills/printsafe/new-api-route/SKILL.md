---
name: new-api-route
description: Scaffold a new Next.js API route for the PrintSafe project. Use this skill whenever building any new file under src/app/api/ — it ensures every route includes the required security primitives: Supabase service-role client, Cloudflare R2 helpers, Upstash Redis rate limiting, proper error handling, and compliance with all PrintSafe security rules (no key logging, opaque R2 UUIDs, no public bucket access). Use this even for small routes — the boilerplate is minimal and prevents security regressions.
---

# PrintSafe — New API Route

## Overview

Every API route in PrintSafe touches encrypted blobs, a database, or rate-limited infrastructure. This skill generates a security-correct starting point so nothing gets missed. It produces a ready-to-edit `route.ts` file plus any missing lib files (`r2.ts`, `redis.ts`, `supabase.ts`).

## Workflow

### Step 1 — Identify the route

Determine:
- **Path**: e.g. `src/app/api/upload/route.ts`
- **HTTP method(s)**: GET / POST / DELETE
- **Mode**: Personal (no auth) or Commercial (requires Supabase JWT)
- **Operations needed**: R2 upload · R2 delete · R2 presign · DB insert · DB read · DB update · rate limit

### Step 2 — Check lib files exist

Before writing the route, verify these files exist. Create any that are missing using the templates in `references/boilerplate.md`:

```
src/lib/supabase.ts   ← Supabase admin client (service_role)
src/lib/r2.ts         ← S3Client + upload/delete/presign helpers
src/lib/redis.ts      ← Upstash rateLimit helper
```

### Step 3 — Scaffold the route

Use the appropriate template from `references/boilerplate.md`:

| Situation | Template to use |
|-----------|----------------|
| Personal mode (no auth) | `personal-route` |
| Commercial mode (auth required) | `commercial-route` |
| Cron / internal job | `cron-route` |

Fill in the TODOs. Do not remove the security primitives — only skip what genuinely does not apply (e.g. a read-only route skips R2 upload but keeps rate limiting).

### Step 4 — Security checklist

Before marking the route complete, verify every item:

- [ ] Encryption key NEVER appears in logs, DB, or response body
- [ ] R2 object key is a UUID (`crypto.randomUUID()`), not a filename
- [ ] R2 bucket has no public access — blobs served only via pre-signed URL
- [ ] Commercial routes verify `Authorization: Bearer <jwt>` via `supabaseAdmin.auth.getUser(token)`
- [ ] Personal routes call `rateLimit(ip)` from `src/lib/redis.ts` before any operation
- [ ] Errors return generic messages — no internal paths, DB errors, or stack traces in response
- [ ] `delete_token` is returned only at upload time and never stored in plaintext

### Step 5 — Wire up

Add the new route to the API Route Map in `CLAUDE.md` and run `npm run lint` to confirm no type errors.

---

## Security Rules (non-negotiable)

These are absolute constraints from the project. The boilerplate enforces them — do not remove the guards:

```ts
// ✅ Good — opaque storage key
const storageKey = crypto.randomUUID();

// ❌ Bad — exposes original filename
const storageKey = `uploads/${file.name}`;

// ✅ Good — key stays in URL fragment, never logged
// URL: /d/<token>#<base64url-key>

// ❌ Bad — logs the key
console.log('key:', exportedKey);

// ✅ Good — serve via pre-signed URL
const url = await r2.presign(storageKey, 3600);

// ❌ Bad — public bucket URL
const url = `https://pub.r2.dev/${storageKey}`;
```

---

## Reference

Full code templates (copy-paste ready) are in `references/boilerplate.md`:
- `personal-route` — POST upload with rate limit + R2 + Supabase
- `commercial-route` — auth-gated route with JWT verification
- `cron-route` — CRON_SECRET-protected background job
- `supabase.ts` lib
- `r2.ts` lib (upload, delete, presign)
- `redis.ts` lib (rate limiter)
