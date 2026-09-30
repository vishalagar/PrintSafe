# Plan — "Report a problem" (issue reporting to email)

Status: **planned, awaiting approval** · Mockup: https://claude.ai/artifact/RX2JRGkrk6E1zN26rsPV7q

## Goal
When something breaks (upload fails, viewer can't open a document), PrintSafe
notices, shows a friendly nudge ("Hmm, that shouldn't happen — report it and
I'll look into it"), and a one-tap report lands in the owner's inbox with
enough context to debug. There's also a manual "Report a problem" link in the footer.

## Privacy line (non-negotiable — see CLAUDE.md rules 1–3)
- **Sent:** error step, error kind, HTTP status, file *type* + size *bucket*,
  TTL label, browser/OS (parsed UA), page path **without `#fragment`**, app
  version (commit SHA), optional user message (≤1000 chars), optional reply email.
- **Never sent:** file bytes, filename, decryption key, full share URL or token
  fragment, raw IP. The client builds the payload from a fixed whitelist —
  never `location.href`, never the `Error` object wholesale.

## Pieces

### 1. `POST /api/report` (new route)
- Body JSON validated against a fixed schema; `kind` and `step` are enums.
- Rate limit by IP via Upstash (e.g. 5/hour, fail-closed like `/api/upload`).
  Honeypot field for bots; Turnstile not required (reports are low-value to abuse
  and email is capped by the limit).
- Generates a short ref `PS-XXXXXX` (nanoid, uppercase alphabet).
- Sends email via **Resend** HTTP API (`fetch`, no SDK): `RESEND_API_KEY`,
  `REPORT_TO_EMAIL`, from `reports@printsafe.in` (domain needs DNS verify;
  `onboarding@resend.dev` works for testing). Free tier 3,000/month.
- Also `Sentry.captureMessage` with the ref tag so the email links to the event.
- Nothing stored in Supabase (data minimisation). Can add a `reports` table later
  if we want a dashboard.

### 2. Client: detection + nudge
- `src/lib/report.ts` — `buildReport({ step, kind, status?, file? })` → whitelisted
  payload; `sendReport(payload, message?, email?)`.
- `src/components/ReportIssue.tsx` — nudge card + bottom sheet (report →
  sending → sent), per the mockup.
- Hook points (existing error paths, no new detection magic):
  - `src/app/page.tsx` `handleUpload` catch → already knows the step via the
    `capture("UploadError", { reason })` calls; reuse `reason` as `step`.
  - `src/app/d/[token]/page.tsx` — `viewState === "error"` and per-page
    render failure.
  - Global `window.onerror` / `unhandledrejection` → **no auto-nudge** (too
    noisy); only the footer link is offered.
- Footer "Report a problem" link on `/`, `/share`, `/d/[token]`, `/status/[token]`.
- PostHog events: `ReportNudgeShown`, `ReportOpened`, `ReportSent`, `ReportFailed`.

### 3. Motion (CSS keyframes only, zero deps)
- Doc icon wobbles + crack flickers when the nudge appears.
- Nudge slides up; sheet slides up over a fading overlay.
- Sending: page folds, turns into a paper plane, flies off along a dashed trail.
- Sent: red "RECEIVED" stamp slams in.
- All disabled under `prefers-reduced-motion`. Dark-mode tokens applied.

### 4. Docs
- `docs/security.md` — new section + changelog entry (report payload whitelist,
  rate limit). Required by CLAUDE.md rule 8.
- `docs/setup.md` — `RESEND_API_KEY`, `REPORT_TO_EMAIL`.
- `docs/architecture.md` — API map entry. `docs/analytics.md` — new events.

### 5. Optional — feature video
Short (~15 s) clip of the flow for socials, made the same way as session 13
(HTML + CSS/GSAP → headless Chromium frames → FFmpeg). Can be built in this
cloud container with its bundled Chromium; H.264 encoding and Kokoro narration
depend on what FFmpeg/TTS can be installed here — verify before promising a
voiced cut, otherwise render silent here and voice it locally.

## Verification
- `npm run lint`, `tsc --noEmit`, `npm run build`.
- Force each failure (block R2 host, 429, bad confirm, corrupt PDF) → nudge
  appears → report arrives in inbox with correct step; assert payload contains
  no filename / key / fragment.
- Rate limit returns 429 after the cap; reduced-motion disables animations;
  mobile 390px has no horizontal scroll.

## Open questions
1. Email provider: Resend (recommended) vs Telegram/Discord webhook (instant
   phone ping, zero DNS setup).
2. Destination address for reports.
3. Video: yes/no, and silent vs narrated.
