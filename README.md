# PrintSafe

Self-destructing document sharing. Upload a sensitive document (Aadhaar,
bank statement, visa docs), get a one-time encrypted link — the document
auto-deletes after viewing. Encryption is 100% client-side (AES-256-GCM via
the Web Crypto API); the server only ever holds ciphertext.

Start here: [`CLAUDE.md`](CLAUDE.md) for the project overview and phase
status, [`docs/architecture.md`](docs/architecture.md) for the route map and
project structure, [`docs/setup.md`](docs/setup.md) for environment
variables and bootstrap, [`docs/security.md`](docs/security.md) for the
security model, and [`tasks/state.md`](tasks/state.md) for what was last
worked on.

## Development

```bash
npm install
npm run dev       # http://localhost:3000
npm run build
npm run lint
```

Requires `.env.local` — see [`docs/setup.md`](docs/setup.md) for the full
list of variables (Supabase, Cloudflare R2, Upstash Redis, Turnstile, etc.)
and where to find each one.

## Stack

Next.js (App Router) · Supabase (Postgres) · Cloudflare R2 · Upstash Redis ·
Web Crypto API · Vercel.
