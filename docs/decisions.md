# Product Decisions & Cost Budget

## Phase 1 Decisions (Locked — do not revisit)

| Decision | Value | Rationale |
|----------|-------|-----------|
| File size limit | 25 MB | Covers most scanned PDFs; Vercel default limit — no extra config |
| Expiry options | View-once · 15 min · 30 min · 1 hour | Sweet spot for print shop visits |
| Default expiry | 30 minutes after first view | Most common print shop session length |
| Max TTL (never opened) | 24 hours → auto-delete | Prevents storage accumulation |
| Manual delete | `delete_token` returned at upload; stored in `localStorage` | No login needed in Phase 1 |
| Auth | None in Phase 1 | Reduces friction; auth comes in Phase 3 |
| Component library | shadcn/ui + Tailwind | Accessible components, no heavy library |
| Fonts | Fraunces (headings) · DM Sans (body) · JetBrains Mono (labels) | Fraunces adds personality; DM Sans handles Hindi well; Mono for labels |
| App name | PrintSafe (working name) | Final branding TBD |

## Rejected Alternatives

- **5 MB file limit** — too restrictive for multi-page scanned PDFs
- **Session cookie for delete** — requires server-side session; overkill for Phase 1
- **Chakra UI / MUI** — opinionated styling fights with custom design
- **Password-protected PDFs** — doesn't solve the "file stays on device" problem

## Cost Budget

| Service | Free Tier | Est. Monthly |
|---------|-----------|-------------|
| Vercel (compute) | 100GB bandwidth | ₹0 |
| Cloudflare R2 (storage) | 10GB free | ₹0–100 |
| Supabase (database) | 500MB, 50K rows | ₹0 |
| Upstash Redis (cache) | 10K commands/day | ₹0–50 |
| Supabase Realtime | Included in free tier | ₹0 |
| **Target** | | **₹0–₹150/month** |

> Auto-delete keeps R2 storage consistently low — documents don't accumulate.

## Monetization (Phase 4)

| Tier | Price | Limits |
|------|-------|--------|
| Free | ₹0/mo | 5 docs/day, 10 MB, 15 min expiry only |
| Pro | ₹99/mo | 50 docs/day, 50 MB, custom expiry, dashboard |
| Shop | ₹499/mo | Unlimited, 100 MB, branded page, API access |

Growth angle: "PrintSafe Certified" badge for shops — dual-sided marketing.
