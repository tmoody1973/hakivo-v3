# Hakivo v3 — Project Conventions

Civic intelligence platform. Teacher-first, consumer-second. Daily packet delivered at 5am teacher-local via Trigger.dev. See `~/.gstack/projects/hakivo-v3/tarikmoody-main-design-20260418-052526.md` for the approved design doc (source of truth).

## Monorepo layout

```
apps/
  teacher/         # Next.js 16 App Router — serves teacher + consumer roles
packages/
  @hakivo/db        # Convex schema + queries + mutations
  @hakivo/ai        # AI SDK wrappers, model matrix, prompts (facts-only anti-hallucination)
  @hakivo/congress  # Congress.gov client (ported from v2)
  @hakivo/packet    # Packet generation pipeline + Hybiscus + quality gates + idempotency
  @hakivo/standards # C3 + AP CED + top-10 state standards alignment
  @hakivo/billing   # Stripe (teacher + consumer products)
  @hakivo/referral  # Parent-referral + advocate attribution
```

Single `apps/teacher` app. Consumer tier lives at `/consumer/*` routes gated by Clerk role. Do NOT add a second app for consumer.

## Package manager

Bun. Commit `bun.lockb`. Do not use npm, pnpm, or yarn commands.

## TypeScript

Strict mode across the monorepo — see `tsconfig.base.json`. Key flags: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`. Every package extends the base.

## Scheduler rule (non-negotiable)

**Trigger.dev v3 is the SOLE scheduler for packet delivery.** Never duplicate with Convex crons. Convex is a state store + light ingestion cron only. Every packet send goes through a per-recipient Trigger.dev scheduled task with idempotency key `packet:${recipientId}:${yyyy-mm-dd}`. See `packages/packet/src/idempotency.ts`.

## Political neutrality (non-negotiable)

- Never use red, blue, purple, indigo, or violet anywhere in the UI
- Never use partisan imagery, photos of politicians, flags, or "one side" iconography
- Accent colors are muted teal (`#3B5B5C`) or warm olive (`#6B6F3B`) only
- Bias-check rubric in `packages/ai` blocks any generated packet that fails

## AI / anti-hallucination

All fact-bearing AI prompts must import `FACTS_ONLY_SYSTEM_PROMPT` from `@hakivo/ai/prompts/facts-only`. Facts come from the Convex DB (bills, congressEvents) only — never from model training data. v2 pattern was battle-tested on 100 Laws podcast; same rules apply here.

## Model matrix

Defined once in `@hakivo/ai`. Default provider chain via Vercel AI Gateway (Gemini 3.1 Pro → Claude 4.7 Opus fallback). Do NOT hand-wire `@ai-sdk/anthropic` or `@ai-sdk/google` directly — use plain `provider/model` strings through the gateway.

## Design tokens (v3.0)

- Base: cream `#FAF9F5`
- Text: deep charcoal `#1A1A1A`
- Accent: muted teal `#3B5B5C`
- Display font: Source Serif Pro (OFL, via `next/font/google`)
- Body font: Inter (OFL, via `next/font/google`)
- Border radius: 4-6px inputs, 8px buttons/cards. No bubbly rounds.

## Multi-tenant shape

Every Convex table has `orgId` even when only teacher-level access exists today. Preserves v3.1 institutional tier migration without re-sharding.

## What NOT to do this phase

- Create accounts (Convex, Clerk, Trigger.dev, Vercel, GCP, Stripe, Hybiscus, Resend) — requires user login
- Ship real API integrations — no keys in scope yet
- Add Studio, chat, 250 Laws, student pathway — all deferred to v3.1+
- Ship AI SDK v6 streaming UI components — they ship with chat, which is deferred
