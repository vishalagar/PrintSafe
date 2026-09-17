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
**Date:** 2026-09-17 (session 14)

### Explainer video embedded on the landing page

The 52 s voiced explainer from session 13 now ships on `/`, between the
upload card and the footer, as a "Can your developers see my documents?"
section.

- Assets copied to `public/demo/` — `how-it-works.mp4` (2.6 MB, 1080p30,
  AAC) and `how-it-works-poster.jpg` (101 KB).
- New component `src/components/DemoVideo.tsx`; `src/app/page.tsx` only
  gained the import and one `<DemoVideo />` tag.
- **Never autoplays** — the clip is narrated, so it stays on the poster
  behind a yellow play button until clicked. `preload="none"` keeps the
  2.6 MB off first paint; only the poster loads.
- `playsInline` so iOS Safari plays in place instead of going fullscreen.
- Controls are revealed *before* `play()` is awaited, so a rejected play
  (autoplay policy, stalled network) leaves native controls to retry with
  rather than a dead poster.
- PostHog events: `DemoVideoPlayed`, `DemoVideoPlayFailed`,
  `DemoVideoCompleted`.
- Verified: `tsc --noEmit` clean, lint clean (4 pre-existing `<img>`
  warnings only), `npm run build` passes, playback confirmed in Chrome at
  desktop and narrow widths with no horizontal scroll.

### Full test pass — `delete_after` migration applied, everything green

User ran the `delete_after` migration in the Supabase SQL editor. Verified
end to end against real R2 / Supabase / Redis:

- **`test-e2e.mjs` — all 3 sizes pass** (100 B, 3 KB, 20 KB): encrypt →
  presigned PUT to R2 → confirm → metadata → file proxy → decrypt → 410 on
  second access → delete.
- **Fixed a bug in the test harness itself** (`test-e2e.mjs:30`). It
  returned `Buffer.from(str,'base64').buffer`; Node allocates small Buffers
  out of a shared pool, so `.buffer` was the whole ~8 KB pool rather than
  the 32-byte key — `importKey` rejected it with "Invalid key length". Now
  slices `byteOffset..byteOffset+byteLength`. **App code was never wrong** —
  `src/lib/crypto.ts` allocates a fresh `Uint8Array`, so its `.buffer` is
  exactly sized. This is why the test had never passed before.
- **Browser flow**: upload PDF → share page (QR + `#key` fragment) →
  viewer decrypts and renders with watermark + "deleted 30 min after you
  close this tab" banner → status page timeline.
- **Migration confirmed working**: after view, `delete_after` = `viewed_at`
  + `ttl_after_view` exactly. Backdating it made `/api/status` flip
  `viewed` → `deleted` on the next hit, which is the session-12 lazy-delete
  fix doing its job.
- No console errors anywhere in the flow.

Note: there is no `deleted_at` column in the schema, so the status page
timeline renders "Deleted —" with no timestamp. Cosmetic, by design.

> Session 13 (five marketing video cuts) summary follows.

### Marketing videos — five cuts built with /brag + Hyperframes (no app code changed)

User asked what `github.com/latent-spaces/brag` was, then had it used on
PrintSafe. **No `src/` code was touched this session** — this was all
marketing asset production plus one new doc.

Built five videos, each an HTML/GSAP composition screenshotted frame-by-frame
in headless Chrome and encoded with FFmpeg. All local, all free, fully
re-renderable:

| Output | Format | Len |
|--------|--------|-----|
| `brag-output/brag.mp4` — comedic launch cut | 1920×1080 | 21s |
| `brag-output-vertical/` — social cut | 1080×1920 | 21s |
| `brag-output-technical/` — architecture film (dark theme) | 1920×1080 | 20.5s |
| `brag-output-explainer/brag-explainer.mp4` — tech explainer | 1920×1080 | 31s |
| `brag-output-explainer/brag-explainer-voiced.mp4` — narrated | 1920×1080 | 52s |

The explainer answers "can your developers see my documents?" using the real
architecture from `docs/security.md` — client-side AES-256-GCM, the key in the
URL fragment, ciphertext under opaque UUIDs, and a mocked `documents` row whose
`key` field reads "no such column". All tokens/keys/hex shown are fake.

Narration uses Kokoro TTS locally (voice `af_heart`), which needed a one-time
isolated venv at `~/.cache/hyperframes-tts` — the `youtube` conda env was left
untouched. The 310 MB model stalls through the CLI and was fetched directly;
it is cached now.

Full pipeline, environment gotchas (FFmpeg only exists in the `youtube` conda
env; render with `--low-memory-mode --workers 1` on 8 GB RAM), and lint/contrast
rules are written up in **`tasks/video-production.md`**.

> Session 12 summary (codebase review + fixes) moved to `tasks/history.md`.

---

## What's Next

### Before next deploy (blocking)
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
