# Project State

> **Update this file at the end of every session.**
> Format: what was done · why · what's next · any blockers.
> **If this file exceeds 150 lines → move older sessions to `tasks/history.md` (append-only).**

---

## Current Phase
**Phase 1 — Personal Mode MVP** ← **FULLY WORKING end-to-end ✅**
**Phase 2 — Security Hardening** ← **COMPLETE ✅**
**Phase 3 — Commercial Mode & PWA** ← **current**

---

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

## What's Next (Phase 3)

Phase 2 is fully complete. Next up:
- Build **Progressive Web App (PWA)** capability with `manifest.json` and `service-worker.js`.
- Enable **Native Share Target API** so mobile users can "Share" from their Camera Roll direct to PrintSafe.
- Commercial mode: shop registration + Supabase Auth (Google OAuth + email OTP).
- Branded pages per shop.
- Live dashboard with real-time customer sync (WebSocket/SSE).

---

## Known Issues

| Issue | Severity | Status |
|-------|----------|--------|
| Refresh after first view shows "already opened" | Low | Known design trade-off |
