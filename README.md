# Hakivo v3

> Civic intelligence platform. Daily packet of US Congressional activity — teacher tier (standards-aligned, soon-to-Google-Classroom) and consumer tier (parent / citizen brief).

Greenfield rebuild following v2 hackathon win. See [`CLAUDE.md`](./CLAUDE.md) for project conventions and the approved design doc reference.

---

## Overview

Every morning, each registered teacher receives a personalized civic packet built from real Congress.gov bill activity:

- **Teacher brief** — 400–600 word neutral summary of bills moving in their wheelhouse, written for AP US Government / APUSH context
- **5 discussion questions** — open-ended, at the teacher's reading level
- **5-question exit ticket** — multiple-choice + short-answer, ready to print
- **Two-host audio briefing** — ~3 min NPR-style dialogue (Maya + Jordan) for prep on the commute
- **Print-ready PDF handout** — US-Letter, room for student writing on the exit ticket
- **Standards alignment** — C3, AP CED, top-10 state standards

A 5-criterion **bias-check rubric** (Claude Sonnet primary, Gemini 2.5 Pro fallback) gates every packet. Failures route to a founder-review queue at `/admin/review`.

---

## Tech stack

| Layer | Tool |
|---|---|
| Runtime / monorepo | Bun 1.3 + Turborepo |
| App | Next.js 16 App Router (Turbopack) |
| Database | Convex (reactive, vector + full-text) |
| Auth | Clerk |
| Background jobs | Trigger.dev v4 (sole packet scheduler) |
| AI — generation | Gemini 2.5 Pro (brief), Gemini 2.5 Flash (audio script) |
| AI — bias check | Claude Sonnet 4.6 (Anthropic) |
| AI — embeddings | Gemini Embedding-001 (768-dim, asymmetric retrieval) |
| AI — TTS | Gemini 3.1 Flash TTS (multi-speaker) |
| Email | Resend (verified `updates.hakivo.com` sender) |
| Audio + PDF storage | Cloudflare R2 (S3-compatible) |
| PDF rendering | `@react-pdf/renderer` |
| Bill data | Congress.gov v3 API + custom Convex ingest |

---

## Quick start

### Prerequisites

- Bun 1.3+ (`curl -fsSL https://bun.sh/install | bash`)
- Node 20+ (only for the Trigger.dev CLI)
- A Convex account, a Clerk app, a Trigger.dev project, an Anthropic key, a Google AI key, a Resend domain, and a Cloudflare R2 bucket

### Install

```bash
git clone https://github.com/tmoody1973/hakivo-v3.git
cd hakivo-v3
bun install
cp .env.local.example .env.local      # then fill in the keys
bunx convex dev --once                 # writes CONVEX_URL into .env.local
```

### Run

```bash
# Convex dev (real-time schema + function deploy)
bunx convex dev

# Trigger.dev worker (in a separate terminal)
bunx trigger.dev@latest dev

# Next.js teacher app
bun dev
```

Visit `http://localhost:3000`.

---

## Workspace

```
apps/
  teacher/                # Next.js 16 — serves teacher AND consumer roles
packages/
  ai/                     # Gemini + Claude wrappers, prompts, bias rubric, TTS
  billing/                # Stripe (deferred)
  congress/               # Congress.gov v3 client (ported from v2)
  db/                     # Convex schema, queries, mutations
  packet/                 # Generation pipeline, audio, PDF, email, R2 client
  referral/               # Parent-referral attribution (deferred)
  standards/              # C3 + AP CED + state standards alignment
```

---

## The packet pipeline

```
Cron (Trigger.dev, 5am teacher-local)
   │
   ▼
generate-packet
   │   • Build asymmetric query embedding (RETRIEVAL_QUERY)
   │   • Vector search bills + recency re-rank (30-day half-life)
   │   • Graph join: cosponsors, party balance, recent actions, state delegation
   │   • Gemini 2.5 Pro generates structured packet with FACTS_ONLY system prompt
   │   • Snapshot bill facts onto packets.billsCitedSnapshot for audit
   │
   ▼
bias-check-packet
   │   • Claude Sonnet 4.6 scores 5 criteria (0–10 each)
   │   • Threshold gates: factual ≥7, perspectives ≥7, openEnded ≥8,
   │     neutrality ≥8, sourceAttribution ≥9
   │   • Pass → continue. Fail → /admin/review queue
   │
   ▼
generate-packet-audio  (~30s)
   │   • Gemini 2.5 Flash rewrites brief → Maya/Jordan dialogue script
   │   • Gemini 3.1 Flash TTS synthesizes 24kHz/16-bit PCM
   │   • Wrap as WAV, upload to R2, patch packet.audioUrl
   │
   ▼
generate-packet-pdf  (~5s)
   │   • @react-pdf/renderer builds 2-page US-Letter handout
   │   • Upload to R2, patch packet.pdfUrl
   │
   ▼
send-packet-email
       • Idempotency: ledger keyed (recipientId, localDate)
       • Resend send with Listen + Print buttons + Gmail bulk-sender headers
       • Mark packets.deliveredAt + ledger row delivered
```

Total ~90s end-to-end per teacher.

---

## Environment variables

The full annotated set lives in [`.env.local.example`](./.env.local.example). The minimum to run the working pipeline today:

| Variable | Purpose |
|---|---|
| `CONVEX_URL` / `NEXT_PUBLIC_CONVEX_URL` | Convex deployment (auto-written by `convex dev`) |
| `CLERK_SECRET_KEY` / `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Auth |
| `CLERK_JWT_ISSUER_DOMAIN` | Set on Convex via `bunx convex env set` |
| `TRIGGER_SECRET_KEY` | Trigger.dev (auto-written by `trigger.dev init`) |
| `ANTHROPIC_API_KEY` | Bias check (Claude Sonnet 4.6) |
| `GEMINI_API_KEY` | Generation, embedding, audio script, TTS |
| `CONGRESS_API_KEY` | Congress.gov bill ingest |
| `RESEND_API_KEY` + `RESEND_FROM_ADDRESS` | Transactional email |
| `R2_ACCOUNT_ID` / `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` / `R2_BUCKET_NAME` / `R2_PUBLIC_BASE_URL` | Audio + PDF storage |
| `ADMIN_USER_IDS` | Comma-separated Clerk user ids allowed into `/admin/review` |

---

## Operational scripts

`scripts/` contains shell-friendly tools for ingest, generation, and inspection. All assume `.env.local` is loaded.

```bash
# Ingest / enrichment
bun run scripts/fire-backfill-bills.ts          # backfill 119th Congress bills
bun run scripts/fire-congress-ingest.ts         # delta sync (daily cron also runs this)
bun run scripts/fire-enrich.ts                  # enrich bill text + embeddings
bun run scripts/boost-enrichment.ts             # parallel enrichment boost

# Packet pipeline
bun run scripts/fire-generate-packet.ts <teacherId> [--force]
bun run scripts/fire-generate-audio.ts <packetId>
bun run scripts/fire-generate-pdf.ts <packetId>
bun run scripts/fire-send-email.ts <packetId>
bun run scripts/fire-bias-check.ts <packetId>

# Inspection
bun run scripts/list-bills.ts
bun run scripts/list-teachers.ts
bun run scripts/show-packet.ts <packetId>
bun run scripts/inspect-run.ts <triggerRunId>
bun run scripts/embedding-coverage.ts
bun run scripts/bill-stats.ts
```

---

## Non-negotiables (from `CLAUDE.md`)

- **Trigger.dev is the SOLE scheduler.** Never duplicate with Convex crons.
- **Political neutrality.** No red/blue/purple/indigo/violet colors anywhere. No partisan imagery. Bias-check gates every packet.
- **Anti-hallucination.** Every fact-bearing AI prompt imports `FACTS_ONLY_SYSTEM_PROMPT` from `@hakivo/ai/prompts/facts-only`. Facts come from Convex bill records, never from model training.
- **Multi-tenant by construction.** Every Convex table has `orgId` even when teacher-only access exists today.

---

## Status

| Phase | Status |
|---|---|
| Convex schema + ingest | shipped |
| Bills + cosponsors + actions backfill (119th) | shipped (~1000 indexed, 954 embedded) |
| Asymmetric Gemini retrieval + recency re-rank | shipped |
| Packet generation (Gemini 2.5 Pro) | shipped |
| Bias-check rubric (5 criteria, Claude primary) | shipped |
| Audio briefings (Gemini 3.1 TTS, two-host) | shipped |
| PDF handout (`@react-pdf/renderer`) | shipped |
| Email delivery (Resend, verified domain) | shipped |
| Founder review queue (`/admin/review`) | shipped |
| Google Classroom push | OAuth verification pending |
| Stripe billing | deferred to v3.1 |
| Consumer tier (`/consumer/*`) | deferred to v3.1 |
| Local-government coverage | scoped post-interview |

---

## License

Private — all rights reserved.
