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

File: `src/.env.local` — **never commit. Add to `.gitignore`.**

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

> **Rule:** Any `NEXT_PUBLIC_` variable is visible in the browser. Never prefix R2 keys, Supabase service role, or Upstash token with `NEXT_PUBLIC_`.

## R2 Bucket Configuration

- Set CORS: allow GET, PUT from your domain (required for pre-signed URL uploads)
- **No public access** — objects reachable only via pre-signed URLs from API routes
- Set lifecycle rule: delete objects older than 25 hours (last-resort safety net)
- Test locally: upload a file, read it back, delete it before writing any app code

## Supabase Region

Use `ap-south-1` (Mumbai) for lowest latency for Indian users.
