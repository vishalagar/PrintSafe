# PrintSafe — CLAUDE.md

> ⚠️ **File length rule: keep this file under 200 lines.** Move details to `docs/`. Reference, don't repeat.
> **Session start:** read `tasks/state.md` first — it tells you what was last done and what's next.

## Project Overview
Self-destructing document sharing for print shops. Users upload sensitive documents (Aadhaar, bank statements, visa docs), get a one-time encrypted link, share with a print shop — document auto-deletes after printing.

Two modes: **Personal** (no auth, individual use) and **Commercial** (shop registration, live dashboard, real-time customer sync).

---

## Commands

```bash
# Development
npm run dev          # Start Next.js dev server (http://localhost:3000)
npm run build        # Production build
npm run lint         # Run ESLint

# Database (Supabase CLI)
supabase start       # Start local Supabase
supabase db push     # Push schema migrations
supabase gen types typescript --local > src/lib/database.types.ts

```

---

## Available Skills

| Task | Skill |
|------|-------|
| Build UI components / pages | `/frontend-design:frontend-design` |
| End-to-end feature development | `/backend-development:feature-development` |
| API design or review | `/backend-development:api-design-principles` |
| Architecture decisions | `/backend-development:architecture-patterns` |
| Security audit | `/backend-development:security-auditor` |
| Code review | `/code-review:code-review` |
| Plan a task from Notion | `/Notion:tasks:plan` |
| Build a task from Notion | `/Notion:tasks:build` |
| Document a code change in Notion | `/Notion:tasks:explain-diff` |
| Update CLAUDE.md after session | `/claude-md-management:revise-claude-md` |
| Improve CLAUDE.md quality | `/claude-md-management:claude-md-improver` |
| Create or improve skills | `/skill-creator:skill-creator` |
| Scaffold a new secure API route | `/printsafe:new-api-route` |

> Custom PrintSafe skills live in `.claude/skills/printsafe/` — project-scoped, auto-discovered by Claude Code.

---

## Tech Stack

| Layer | Tool |
|-------|------|
| Frontend | Next.js 16 App Router, React, Tailwind CSS |
| Backend | Next.js API Routes (serverless — no separate server) |
| Database | Supabase (PostgreSQL + Auth + Realtime) |
| File Storage | Cloudflare R2 (encrypted blobs, zero egress) |
| Cache / TTL | Upstash Redis (TTL + Pub/Sub) |
| Encryption | Web Crypto API — AES-256-GCM, **client-side only** |
| Auth | Supabase Auth (Google OAuth + email OTP) — commercial mode only |
| Deploy | Vercel |

→ Architecture, project structure, API map: [`docs/architecture.md`](docs/architecture.md)
→ Database schema SQL: [`docs/schema.md`](docs/schema.md)
→ Env vars & bootstrap: [`docs/setup.md`](docs/setup.md)
→ Design system & UI screens: [`docs/design.md`](docs/design.md)
→ Locked decisions & cost budget: [`docs/decisions.md`](docs/decisions.md)

---

## ⚠️ Critical Security Rules — NEVER VIOLATE

1. **NEVER log or store decryption keys** — keys only live in URL fragments (`#key`)
2. **NEVER send the encryption key to the server** — all crypto is 100% client-side
3. **NEVER store document contents** — server only holds ciphertext blobs in R2
4. R2 object keys must be **opaque UUIDs** — never expose original filenames in storage paths
5. All commercial mode API routes **MUST** verify `Authorization: Bearer <supabase-jwt>` header
6. Personal mode `/api/upload` **MUST** be rate-limited by IP via Upstash
7. R2 bucket must have **no public access** — pre-signed URLs only; 25-hour lifecycle rule as safety net

---

## Document Status Lifecycle

```
pending → viewed → deleted
                 ↘ expired  (never opened, after 24hr TTL)
```

| Status | Meaning |
|--------|---------|
| `pending` | Uploaded, not yet opened |
| `viewed` | Opened — deletes after `ttl_after_view` seconds |
| `deleted` | Blob permanently purged from R2 |
| `expired` | TTL exceeded — cron triggers deletion |

---

## Development Phases

- **Phase 1** ✅ COMPLETE: Personal Mode MVP. Upload · encrypt · one-time link · view · auto-delete. No auth.
- **Phase 2** ← **current**: Security hardening — rate limits, CAPTCHA, cron cleanup
- **Phase 3**: Commercial Mode — shop auth, branded pages, live dashboard, WebSocket/SSE
- **Phase 4**: Polish & scale

**Don't build Phase 2/3 features while working on Phase 1.**

→ Locked Phase 1 decisions: [`docs/decisions.md`](docs/decisions.md)
→ Session state & what's next: [`tasks/state.md`](tasks/state.md)

---

## Core Principles

- **Simplicity First** — Minimal change, minimal impact. Don't over-engineer.
- **No Laziness** — Find root causes. No temporary fixes. Senior engineer standards.
- **Security by Default** — When in doubt: encrypt it, delete it, don't store it.
- **File Length Rule** — This file stays under 200 lines. Details live in `docs/`.

→ Full workflow & task rules: [`docs/workflow.md`](docs/workflow.md)
