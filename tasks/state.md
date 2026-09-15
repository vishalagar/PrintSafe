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
**Date:** 2026-09-15 (session 11)

### Fix: PDF preview/print showing white/blank pages on iPhone Safari

**Root cause:** `d/[token]/page.tsx` handed pdf.js a `blob:` object URL
(`{ url: blobUrl }`) for both the react-pdf preview and the canvas-based
print path (`printPDFViaCanvas`). pdf.js does range-request-style fetches
against that URL; WebKit's stricter `Headers` validation throws partway
through on a synthetic `blob:` response, which pdf.js swallows internally,
leaving every page blank. Chromium tolerates the same call, which is why
it worked on desktop (Chrome/Brave/laptop Safari not affected) but failed
on every PDF on iPhone/iPad Safari. Matches pdf.js upstream issue
[#19205](https://github.com/mozilla/pdf.js/issues/19205).

**Fix:** pass the raw decrypted bytes to pdf.js instead of a blob URL —
sidesteps the fetch/Headers path entirely.
- Added `pdfBytes` (`Uint8Array`) state, set alongside `blobUrl` after
  decryption when `mimeType === 'application/pdf'`.
- `PDFViewer` now takes `pdfBytes` and passes `{ data: pdfBytes.slice() }`
  to react-pdf's `<Document file={...}>` (memoized via `useMemo` — react-pdf
  re-parses whenever the `file` object reference changes).
- `printPDFViaCanvas` now takes `bytes: Uint8Array` and calls
  `pdfjsLib.getDocument({ data: bytes.slice() })`.
- `.slice()` in both call sites avoids pdf.js transferring/detaching the
  shared `pdfBytes` buffer, keeping `blobUrl`'s independent copy intact for
  image handling and cleanup (`blobUrl` itself is unchanged, still used for
  `<img>` display and `URL.revokeObjectURL`).

**Verified:** `npx tsc --noEmit` clean; `npm run lint` shows no new issues
in the touched file. Reproduced the original bug's *absence in Chromium*
and confirmed the fix doesn't regress it: drove the full upload → decrypt
→ preview → print flow against local dev with headless Brave (no browser
extension available this session) using an 8-page real PDF, reading actual
canvas/image pixel data (not just "no exception") before and after the
change — ~15–17% non-white pixels per page both times. **Not yet verified
on a real iPhone/iPad Safari** — no way to drive Safari from this session;
user should confirm on-device before considering this closed.

**Files changed:** `src/app/d/[token]/page.tsx` only.

> Session 10 summary (upload 413 fix) moved to `tasks/history.md`.

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
