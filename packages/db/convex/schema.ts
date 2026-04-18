import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/**
 * Hakivo v3 Convex schema.
 *
 * Every table carries orgId — even though v3.0 only uses teacher-level
 * access, this preserves the v3.1 institutional tier migration without
 * re-sharding. See CLAUDE.md ("Multi-tenant shape").
 *
 * Trigger.dev is the sole packet-delivery scheduler. `packetDeliveries` is
 * the idempotency ledger that prevents duplicate sends — the unique index
 * on (recipientId, localDate) is the structural guarantee.
 */
export default defineSchema({
  teachers: defineTable({
    orgId: v.string(),
    clerkUserId: v.string(),
    clerkOrgId: v.string(),
    role: v.union(v.literal("teacher"), v.literal("individual")),
    email: v.string(),
    name: v.string(),
    school: v.optional(v.string()),
    state: v.optional(v.string()),
    gradesTaught: v.array(v.string()),
    courses: v.array(v.string()),
    currentUnit: v.union(v.string(), v.null()),
    targetReadingLevel: v.optional(v.string()),
    timezone: v.string(),
    classroomConnected: v.boolean(),
    classroomRefreshToken: v.union(v.string(), v.null()),
    createdAt: v.number(),
    status: v.union(
      v.literal("trial"),
      v.literal("paid"),
      v.literal("churned"),
    ),
  })
    .index("by_clerkUserId", ["clerkUserId"])
    .index("by_orgId", ["orgId"])
    .index("by_status", ["status"]),

  bills: defineTable({
    orgId: v.string(),
    congressNumber: v.number(),
    billType: v.string(),
    billNumber: v.number(),
    title: v.string(),
    introducedDate: v.number(),
    latestAction: v.string(),
    latestActionDate: v.number(),
    billText: v.optional(v.string()),
    summary: v.optional(v.string()),
    aiSummary: v.optional(v.string()),
    aiSummaryGeneratedAt: v.optional(v.number()),
    topics: v.array(v.string()),
  })
    .index("by_congress", ["congressNumber", "billType", "billNumber"])
    .index("by_latestAction", ["latestActionDate"]),

  congressEvents: defineTable({
    orgId: v.string(),
    date: v.string(),
    chamber: v.union(v.literal("house"), v.literal("senate")),
    eventType: v.union(
      v.literal("vote"),
      v.literal("bill_introduced"),
      v.literal("bill_passed"),
      v.literal("committee_action"),
      v.literal("floor_speech"),
    ),
    billIds: v.array(v.id("bills")),
    summary: v.string(),
  })
    .index("by_date", ["date"])
    .index("by_chamber_date", ["chamber", "date"]),

  packets: defineTable({
    orgId: v.string(),
    teacherId: v.id("teachers"),
    packetDate: v.string(),
    status: v.union(
      v.literal("queued"),
      v.literal("generating"),
      v.literal("review"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    sourceEventIds: v.array(v.id("congressEvents")),
    teacherBrief: v.string(),
    discussionQuestions: v.array(v.string()),
    exitTicket: v.object({
      questions: v.array(
        v.object({
          prompt: v.string(),
          kind: v.union(v.literal("multiple_choice"), v.literal("short_answer")),
          choices: v.optional(v.array(v.string())),
          answerKey: v.optional(v.string()),
        }),
      ),
    }),
    primarySources: v.array(
      v.object({
        label: v.string(),
        url: v.string(),
        excerpt: v.string(),
      }),
    ),
    audioUrl: v.union(v.string(), v.null()),
    pdfUrl: v.union(v.string(), v.null()),
    standardsAlignment: v.object({
      c3Dimensions: v.array(v.string()),
      apCedUnits: v.union(v.array(v.string()), v.null()),
      stateStandards: v.array(v.string()),
    }),
    qualityChecks: v.object({
      readingLevelOk: v.boolean(),
      factCheckOk: v.boolean(),
      biasScoreOk: v.boolean(),
      biasScore: v.number(),
      humanReviewed: v.boolean(),
    }),
    generatedAt: v.number(),
    deliveredAt: v.union(v.number(), v.null()),
  })
    .index("by_teacher_date", ["teacherId", "packetDate"])
    .index("by_status", ["status"])
    .index("by_orgId_date", ["orgId", "packetDate"]),

  /**
   * Idempotency ledger for packet delivery.
   *
   * Trigger.dev's per-recipient scheduled task inserts a row before sending
   * email. The unique index on (recipientId, localDate) prevents duplicate
   * sends structurally — if the index insert fails, the send short-circuits.
   */
  packetDeliveries: defineTable({
    orgId: v.string(),
    recipientId: v.id("teachers"),
    packetId: v.id("packets"),
    localDate: v.string(),
    idempotencyKey: v.string(),
    status: v.union(
      v.literal("scheduled"),
      v.literal("sending"),
      v.literal("delivered"),
      v.literal("failed"),
    ),
    attempts: v.number(),
    lastError: v.union(v.string(), v.null()),
    scheduledFor: v.number(),
    deliveredAt: v.union(v.number(), v.null()),
  })
    .index("by_recipient_date", ["recipientId", "localDate"])
    .index("by_status_scheduledFor", ["status", "scheduledFor"]),

  feedback: defineTable({
    orgId: v.string(),
    packetId: v.id("packets"),
    teacherId: v.id("teachers"),
    section: v.string(),
    rating: v.union(v.literal("up"), v.literal("down")),
    note: v.union(v.string(), v.null()),
    createdAt: v.number(),
  })
    .index("by_packet", ["packetId"])
    .index("by_teacher", ["teacherId"]),

  costLedger: defineTable({
    orgId: v.string(),
    date: v.string(),
    teacherId: v.union(v.id("teachers"), v.null()),
    packetId: v.union(v.id("packets"), v.null()),
    model: v.string(),
    tokensIn: v.number(),
    tokensOut: v.number(),
    costUsd: v.number(),
  })
    .index("by_date", ["date"])
    .index("by_orgId_date", ["orgId", "date"]),

  /**
   * House + Senate roster, sourced from unitedstates/congress-legislators
   * on GitHub. Ingested weekly — roster changes are rare (resignations,
   * special elections, deaths) so daily refresh wastes quota.
   *
   * Stores only the CURRENT term per legislator. Historical terms are
   * accessible from the same GitHub repo if a future feature needs them.
   */
  legislators: defineTable({
    orgId: v.string(),
    bioguideId: v.string(),
    firstName: v.string(),
    lastName: v.string(),
    fullName: v.string(),
    state: v.string(),
    chamber: v.union(v.literal("house"), v.literal("senate")),
    district: v.union(v.number(), v.null()),
    party: v.string(),
    termStart: v.string(),
    termEnd: v.string(),
    officialUrl: v.optional(v.string()),
    phone: v.optional(v.string()),
    office: v.optional(v.string()),
    photoUrl: v.optional(v.string()),
    wikipediaSlug: v.optional(v.string()),
    twitter: v.optional(v.string()),
    youtube: v.optional(v.string()),
    facebook: v.optional(v.string()),
    instagram: v.optional(v.string()),
    fecIds: v.optional(v.array(v.string())),
    opensecretsId: v.optional(v.string()),
  })
    .index("by_bioguideId", ["bioguideId"])
    .index("by_state_chamber", ["state", "chamber"])
    .index("by_chamber_state", ["chamber", "state"])
    .index("by_orgId", ["orgId"]),
});
