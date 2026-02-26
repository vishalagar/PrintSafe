# Analytics — Vercel Analytics + PostHog

## Overview

Two-layer analytics setup — **both free**:
- **Vercel Analytics** — free, zero config. Page views, unique visitors, countries, devices, Core Web Vitals. Enable in Vercel dashboard, no code needed.
- **PostHog** — open-source, privacy-first. Free up to 1M events/month. Custom event tracking for upload funnel and document lifecycle. No credit card required.

No Google Analytics. All event props are non-identifying (file type, size bucket, TTL label) — no tokens, filenames, or user IDs ever enter analytics.

**Domain:** `printsafe.in`

---

## Setup (one-time, manual)

1. Create PostHog account at [posthog.com](https://posthog.com) → add project → copy API key
2. Add to `.env.local`:
   ```
   NEXT_PUBLIC_POSTHOG_KEY=phc_xxxxxxxxxxxxxxxxxxxx
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
   ```
3. Install packages:
   ```bash
   npm install posthog-js @vercel/analytics
   ```
4. Enable Vercel Analytics: Vercel dashboard → Project → Analytics tab → Enable

---

## Events Tracked

| Event | Where fired | Props |
|-------|-------------|-------|
| `FileSelected` | Upload page — after `setFile(f)` | `fileType`, `fileSizeBucket` |
| `UploadStarted` | Upload page — start of `handleUpload()` | `fileType`, `ttlLabel` |
| `UploadSuccess` | Upload page — after token received | `fileType`, `ttlLabel` |
| `UploadError` | Upload page — on any failure | `reason` (`api`\|`ratelimit`\|`encryption`) |
| `DocumentViewed` | Viewer — after `setViewState('ready')` | `fileType` |
| `DocumentPrinted` | Viewer — inside `handlePrint()` | `fileType` |
| `ManualDelete` | Status page — after successful DELETE | _(no props)_ |
| `DocumentExpired` | Cron — per expired doc deletion | _(server-side via PostHog API)_ |
| `DocumentDeleted` | Cron — per stale-viewed doc deletion | _(server-side via PostHog API)_ |

---

## Files Changed / Created

| File | Change |
|------|--------|
| `src/lib/analytics.ts` | **New** — event type definitions + helper functions + PostHog capture wrapper |
| `src/lib/analytics-server.ts` | **New** — server-side PostHog API helper (cron only) |
| `src/app/layout.tsx` | Add PostHog provider + Vercel `<Analytics />` component |
| `src/app/page.tsx` | Fire `FileSelected`, `UploadStarted`, `UploadSuccess`, `UploadError` |
| `src/app/d/[token]/page.tsx` | Fire `DocumentViewed`, `DocumentPrinted` |
| `src/app/status/[token]/page.tsx` | Fire `ManualDelete` |
| `src/app/api/cron/cleanup/route.ts` | Fire `DocumentExpired` / `DocumentDeleted` via server helper |

---

## Client Setup (`src/app/layout.tsx`)

```tsx
'use client'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'
import { Analytics } from '@vercel/analytics/react'
import { useEffect } from 'react'

function PHProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY!, {
      api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST,
      capture_pageview: true,
      capture_pageleave: true,
      person_profiles: 'never',  // no user profiles — privacy first
    })
  }, [])
  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
```

---

## Helper Functions (`src/lib/analytics.ts`)

```typescript
export type FileType = 'pdf' | 'jpg' | 'png' | 'unknown'
export type FileSizeBucket = 'small' | 'medium' | 'large'  // <1MB | 1–10MB | 10–25MB
export type TtlLabel = 'view-once' | '15min' | '30min' | '1hr'

mimeToFileType(mime: string): FileType
sizeToFileSizeBucket(bytes: number): FileSizeBucket
ttlToLabel(ttl: number): TtlLabel
capture(event: string, props?: Record<string, string>): void  // wraps posthog.capture
```

---

## Server Helper (`src/lib/analytics-server.ts`)

PostHog has a server-side API — use it in the cron route (fire-and-forget):

```typescript
export async function trackServerEvent(event: string, props?: Record<string, string>) {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
  if (!key) return
  try {
    await fetch(`${process.env.NEXT_PUBLIC_POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        event,
        properties: { distinct_id: 'server', ...props },
      }),
    })
  } catch { /* never block server ops for analytics */ }
}
```

---

## Privacy Audit

- No `token` or `deleteToken` in any event props
- No filenames, IPs, or user identifiers in props
- `ManualDelete` has zero props by design
- Key fragment (`#KEY`) is never readable server-side and never appears in events
- `person_profiles: 'never'` disables PostHog user identity tracking

---

## Verification

1. `npm run build` — must pass with no TS errors
2. Dev: PostHog auto-captures events; check PostHog dashboard → Live Events
3. After deploy to `printsafe.in`: Vercel Analytics tab → page views and web vitals
4. After deploy: PostHog dashboard → Live Events → click through full funnel
5. Cron test: `curl -X POST https://printsafe.in/api/cron/cleanup -H "Authorization: Bearer $CRON_SECRET"` → verify `DocumentExpired` in PostHog

---

## Viewing Your Analytics

| Dashboard | URL | What you see |
|-----------|-----|-------------|
| PostHog | `https://us.posthog.com` | Custom events, upload funnel, document lifecycle, real-time |
| Vercel Analytics | `https://vercel.com/[team]/printsafe/analytics` | Page views, visitors, countries, devices, Core Web Vitals |

### PostHog — Live Events
1. Go to `https://us.posthog.com` → sign in
2. Sidebar → **Activity** → **Live Events**
3. Open a browser tab to `localhost:3000` or `printsafe.in` — `$pageview` appears within seconds
4. Upload a file → watch `FileSelected`, `UploadStarted`, `UploadSuccess` appear in real time

### PostHog — Upload Funnel Insight
1. Sidebar → **Insights** → **New insight** → **Funnel**
2. Add steps in order:
   - Step 1: `FileSelected`
   - Step 2: `UploadStarted`
   - Step 3: `UploadSuccess`
3. Set date range to **Last 30 days** → **Calculate** → see drop-off at each stage

### PostHog — Event Breakdown
- Go to **Insights** → **New insight** → **Trends**
- Select event e.g. `DocumentViewed` → breakdown by `fileType` property
- Shows which file types are most commonly viewed

### Vercel Analytics
- Vercel dashboard → project `printsafe` → **Analytics** tab
- Shows: page views, unique visitors, top pages, countries, devices
- **Web Vitals** sub-tab: LCP, FID, CLS scores per page
