# Project State

> **Update this file at the end of every session.**
> Format: what was done · why · what's next · any blockers.

---

## Current Phase
**Phase 1 — Personal Mode MVP** ← **FULLY WORKING end-to-end ✅**

## Last Session Summary
**Date:** 2026-02-25
**What was done:**

### Code built from scratch (full Phase 1 MVP):
- `src/lib/supabase.ts` — server Supabase client (service_role key, untyped to avoid generic inference bug)
- `src/lib/r2.ts` — Cloudflare R2 via AWS S3 SDK: upload, presign, delete
- `src/lib/redis.ts` — Upstash Redis rate-limit helper (fails open on error)
- `src/lib/crypto.ts` — browser-only AES-256-GCM: generateKey, encryptFile, decryptFile, keyToBase64url, base64urlToKey
- `src/app/api/upload/route.ts` — POST: IP rate-limit → validate → R2 upload → Supabase insert
- `src/app/api/doc/[token]/route.ts` — GET: mark viewed, return metadata | DELETE: verify delete_token, purge R2
- `src/app/api/file/[token]/route.ts` — GET: proxy ciphertext from R2 (avoids CORS on presigned URLs)
- `src/app/api/status/[token]/route.ts` — GET: status + timeline data
- `src/app/page.tsx` — Upload page: drag-drop, expiry pills, encrypt & upload
- `src/app/share/page.tsx` — Link ready: QR code, copy, WhatsApp share, expiry badge, track link
- `src/app/d/[token]/page.tsx` — Document viewer: browser-side AES decrypt, react-pdf (local worker), print button
- `src/app/status/[token]/page.tsx` — Status: countdown timer, delete modal
- `src/app/globals.css` — PrintSafe neo-brutalist design tokens
- `src/app/layout.tsx` — Google Fonts, metadata
- `public/pdf.worker.min.mjs` — PDF.js worker (copied from node_modules, served locally)

### Bugs fixed during testing:
1. **Supabase TS generics** — `.update()` inferred as `never`; fixed by removing generic `<Database>` from `createClient()`, using `as DocumentRow` casts manually
2. **CORS on R2 presigned URLs** — browser couldn't `fetch()` cross-origin R2 URL; fixed by adding `/api/file/[token]` proxy route (same-origin, no CORS)
3. **PDF.js worker CDN missing** — `pdfjs-dist@5.4.296` not available on cdnjs; fixed by copying worker to `public/pdf.worker.min.mjs` and setting `workerSrc = '/pdf.worker.min.mjs'`

**`npm run build` — PASSES ✅**
**End-to-end flow — WORKS ✅** (upload → link → view → decrypt → print → delete)
**Redis rate-limiting — WORKING ✅** (token refreshed 2026-02-25)

---

## What's Next (Phase 2 — Security Hardening)

1. **Cron cleanup job** — delete `expired` documents from R2 after 24h (`/api/cron/cleanup`)
2. **Disable PDF download** — react-pdf renders a download icon; hide via CSS or `renderMode="canvas"`
3. **CAPTCHA on upload** — hCaptcha or Cloudflare Turnstile to prevent abuse
4. **Vercel deployment** — `npm run build` passes; add env vars in Vercel dashboard, deploy
5. **Phase 3 prep** — Commercial mode: shop auth, branded pages, live dashboard

---

## Current Code Structure

```
/Code
  CLAUDE.md
  .env.local                       ← all 12 env vars (DO NOT COMMIT)
  index.html                       ← static design sample (open in browser)
  package.json                     ← postinstall copies pdf.worker to public/
  tsconfig.json
  next.config.ts
  public/
    pdf.worker.min.mjs             ← PDF.js v5 worker (copied from node_modules)
  src/
    app/
      globals.css                  ← PrintSafe design tokens (sky blue, neo-brutalist)
      layout.tsx                   ← Google Fonts, metadata
      page.tsx                     ← Upload page (/)
      share/
        page.tsx                   ← Link ready (/share)
      d/[token]/
        page.tsx                   ← Document viewer (/d/:token#key)
      status/[token]/
        page.tsx                   ← Status & delete (/status/:token)
      api/
        upload/route.ts            ← POST /api/upload
        doc/[token]/route.ts       ← GET metadata + DELETE purge
        file/[token]/route.ts      ← GET ciphertext proxy (R2 → browser)
        status/[token]/route.ts    ← GET status/timeline
    lib/
      supabase.ts                  ← server client (untyped) + DocumentRow type
      r2.ts                        ← R2 upload / presign / delete
      redis.ts                     ← Upstash rate-limit helper
      crypto.ts                    ← browser AES-256-GCM
      utils.ts                     ← cn() (shadcn)
  docs/
    architecture.md
    schema.md                      ← ⚠️ RUN THIS SQL IN SUPABASE FIRST
    setup.md
    design.md
    decisions.md
    workflow.md
  tasks/
    state.md                       ← this file
```

---

## Architecture Notes (important for next session)

### Document fetch flow (after CORS fix)
```
Browser → GET /api/doc/{token}     returns { iv, mimeType, ttlAfterView, viewedAt }
Browser → GET /api/file/{token}    proxies encrypted bytes from R2 (same-origin)
Browser decrypts with key from URL#fragment → renders PDF or image
```

### Key security invariants (never break these)
- Encryption key lives ONLY in the URL `#fragment` — never sent to server
- `crypto.ts` is client-side only (`'use client'` at top)
- R2 objects keyed by `crypto.randomUUID()`, never by filename
- `service_role` key used only in API routes, never exposed to browser
- Rate limit fails open (upload allowed even if Redis down) — fix in Phase 2

### Supabase typing quirk
- `createClient<Database>()` causes `.update()` to infer args as `never` in TS strict mode
- Solution: use `createClient()` (untyped), manually cast `data as DocumentRow`

---

## Known Issues

| Issue | Severity | Fix |
|-------|----------|-----|
| No cron cleanup for expired docs | Medium — R2 accumulates blobs | Phase 2: add `/api/cron/cleanup` route |
| PDF toolbar shows download icon | Low | Phase 2: CSS to hide toolbar or `renderMode="canvas"` |
