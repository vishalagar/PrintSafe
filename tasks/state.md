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

**Date:** 2026-09-30 (session 15)

### "Report a problem" → Telegram, with auto-detect nudge

When a known step fails, the page shows a nudge card ("Hmm, that shouldn't
happen. Report it and I'll look into it"), and the report arrives in the
owner's Telegram. Planned in `tasks/plan-issue-reporting.md`, mockup at
https://claude.ai/artifact/RX2JRGkrk6E1zN26rsPV7q.

- **`POST /api/report`**: whitelist-validated payload (`src/lib/report.ts`),
  5/hr/IP + 200/day global (fail closed), 4 KB cap, honeypot. Sends to
  Telegram (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`) and adds a tags-only
  Sentry event. Returns 503 if Telegram isn't configured. Nothing stored.
- **`src/components/ReportIssue.tsx`**: `ReportNudge` (auto), `ReportLink`
  (footer, manual) and the sheet (form → paper-plane sending → RECEIVED stamp).
  Bottom sheet on phones, centred card from 640px. CSS-only motion in
  `globals.css` under "ISSUE REPORTER", off under `prefers-reduced-motion`.
- **Hooked into**: upload page (`api`/`storage`/`confirm`/`encryption` steps;
  no nudge on 429), viewer (`key-missing`, `file-fetch`, `decrypt`,
  `pdf-parse`, `pdf-render`; no nudge on a `/api/doc` 404, since that's an
  expired link). Footer link on `/`, `/share`, `/status/[token]`.
- **Privacy**: route templates, not paths; error class names, not messages;
  no filename/token/key. Sentry gets tags only. `docs/security.md` § L.
- **Verified**: tsc, lint (4 pre-existing `<img>` warnings), `next build`.
  API exercised against mocked Redis/Telegram (validation, honeypot, 413,
  429 on the 6th report). Full UI flow driven in Chromium at 390px and
  1280px, dark mode, reduced motion, Esc to close; no horizontal scroll, no
  page errors, and the captured payload holds no filename.
- **Not verified**: a real Telegram delivery. Needs the two env vars set.

> Sessions 13–14 (marketing videos, landing-page explainer, JPX blank-page fix) moved to `tasks/history.md`.

> Session 12 summary (codebase review + fixes) moved to `tasks/history.md`.

---

## What's Next

### Before next deploy (blocking)
- **Set `TELEGRAM_BOT_TOKEN` + `TELEGRAM_CHAT_ID`** in Vercel (see `docs/setup.md`), then send one test report from production.
- ~~Run the `delete_after` migration in Supabase SQL editor~~ ✅ done
  session 14, verified writing correctly.
- ~~Run `test-e2e.mjs` against a real dev server at least once~~ ✅ done
  session 14, all 3 sizes pass (harness bug fixed to get there).
- Set `IP_HASH_SECRET` in Vercel env vars (and any other non-local
  environment) — see `docs/setup.md`. Already in local `.env.local`.
- Still outstanding from session 11: confirm the Safari PDF fix on a real
  iPhone/iPad — only verified via headless Brave so far.
- ~~Confirm the landing-page explainer plays inline on a real iPhone
  Safari~~ ✅ verified session 14 on the actual device — plays in place,
  no forced fullscreen.
- **Preview deploys cannot upload**: the R2 bucket CORS policy allows
  `http://localhost:3000` and `https://printsafe.in` but not
  `*.vercel.app`, so the browser's preflight to the presigned PUT URL is
  refused (403) and the client reports "Upload to storage failed. Please
  check your connection." Add `https://*.vercel.app` to AllowedOrigins in
  the Cloudflare R2 dashboard. Not a regression — preview uploads have
  never worked. Production (`printsafe.in`) is unaffected.

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
