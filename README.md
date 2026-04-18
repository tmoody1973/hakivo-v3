# Hakivo v3

Civic intelligence platform. Daily packet of US Congressional activity — teacher tier (standards-aligned, Google Classroom push) and consumer tier (parent/citizen brief).

Greenfield rebuild following v2 hackathon win. See `~/.gstack/projects/hakivo-v3/` for approved design doc and mockups. See [`CLAUDE.md`](./CLAUDE.md) for project conventions.

## Quick start

```bash
bun install
bun dev
```

## Workspace

- `apps/teacher` — Next.js 16 App Router
- `packages/@hakivo/*` — 7 domain packages (db, ai, congress, packet, standards, billing, referral)

## Stack

Next.js 16 · Bun · Turborepo · Convex · Clerk · Trigger.dev v3 · Vercel AI Gateway · Cloudflare R2 · Hybiscus · Resend · Stripe
