# Setup & Environment

## Bootstrap (first time)

```bash
npx create-next-app@latest printsafe --typescript --tailwind --app --src-dir --import-alias '@/*'
npm install @supabase/supabase-js @upstash/redis @aws-sdk/client-s3 qrcode
npm install -D @types/node eslint-config-next prettier
npx shadcn@latest init
npx shadcn@latest add button badge dialog toast
```

## Environment Variables

File: `.env.local` (project root) — **never commit. Add to `.gitignore`.**

| Variable | Where to find it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role ⚠ private |
| `R2_ACCOUNT_ID` | Cloudflare → R2 overview → right panel |
| `R2_ACCESS_KEY_ID` | Cloudflare → R2 → Manage API Tokens |
| `R2_SECRET_ACCESS_KEY` | Cloudflare → R2 → Manage API Tokens |
| `R2_BUCKET_NAME` | The bucket name you created |
| `R2_ENDPOINT` | `https://{R2_ACCOUNT_ID}.r2.cloudflarestorage.com` |
| `UPSTASH_REDIS_REST_URL` | Upstash → your database → REST URL |
| `UPSTASH_REDIS_REST_TOKEN` | Upstash → your database → REST Token |
| `RESEND_API_KEY` | Resend → API Keys (Phase 2 — create now, use later) |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally; production domain in Vercel |
| `CRON_SECRET` | Random 32-char string — protects the cron endpoint |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | Cloudflare → Turnstile → your widget → Site Key (public, browser-safe) |
| `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile → your widget → Secret Key ⚠ private |

> **Rule:** Any `NEXT_PUBLIC_` variable is visible in the browser. Never prefix R2 keys, Supabase service role, or Upstash token with `NEXT_PUBLIC_`.

## R2 Bucket Configuration

- Set CORS: allow GET, PUT from your domain (required for pre-signed URL uploads)
- **No public access** — objects reachable only via pre-signed URLs from API routes
- Set lifecycle rule: delete objects older than 25 hours (last-resort safety net)
- Test locally: upload a file, read it back, delete it before writing any app code

## Vercel Deployment

1. Push the repo to GitHub and import it in the Vercel dashboard.
2. Copy all env vars from `.env.local` to Vercel → Project → Settings → Environment Variables, with these changes:
   - `NEXT_PUBLIC_APP_URL` → set to your production domain (e.g. `https://printsafe.in`)
   - `CRON_SECRET` → same random 32-char string used locally
   - `NEXT_PUBLIC_TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` → from Cloudflare Turnstile dashboard
3. `vercel.json` already configures the hourly cron job for `/api/cron/cleanup`. Vercel automatically includes `Authorization: Bearer <CRON_SECRET>` in cron requests when the env var is set.
4. After deploy, verify: Vercel dashboard → Project → Cron Jobs tab → trigger manually → check Supabase for deleted rows.

> **Note:** Turnstile widget is only shown in production (when `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set). Local dev works without CAPTCHA keys.

---

## Supabase Region

Use `ap-south-1` (Mumbai) for lowest latency for Indian users.
