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

---

## What's Next

### Before next deploy (blocking)
- Run the `delete_after` migration in Supabase SQL editor — see `docs/schema.md`.
- Set `IP_HASH_SECRET` in Vercel env vars (and any other non-local
  environment) — see `docs/setup.md`. Already in local `.env.local`.
- Run `test-e2e.mjs` against a real dev server at least once — rewritten
  this session but not executed (no tmux available).
- Still outstanding from session 11: confirm the Safari PDF fix on a real
  iPhone/iPad — only verified via headless Brave so far.

### Phase 3

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
