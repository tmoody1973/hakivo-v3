import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Fetch a teacher's packet history, newest first.
 */
export const listByTeacher = query({
  args: { teacherId: v.id("teachers"), limit: v.optional(v.number()) },
  handler: async (ctx, { teacherId, limit }) => {
    const take = limit ?? 30;
    return await ctx.db
      .query("packets")
      .withIndex("by_teacher_date", (q) => q.eq("teacherId", teacherId))
      .order("desc")
      .take(take);
  },
});

export const getById = query({
  args: { id: v.id("packets") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

/**
 * Count teacher-requested packets today. Supports the 5/day quota
 * enforced by the /teacher/create server action.
 *
 * Today is defined as the teacher's UTC packetDate — teachers in very
 * late-evening timezones may hit quota boundaries slightly earlier than
 * their local-day rollover. Good enough for v3.0.
 */
export const countTeacherRequestsToday = query({
  args: { teacherId: v.id("teachers"), date: v.string() },
  handler: async (ctx, { teacherId, date }) => {
    const rows = await ctx.db
      .query("packets")
      .withIndex("by_teacher_date", (q) =>
        q.eq("teacherId", teacherId).eq("packetDate", date),
      )
      .filter((q) => q.eq(q.field("requestedBy"), "teacher_request"))
      .collect();
    return rows.length;
  },
});

/**
 * Patch the full bias-check result onto a packet. Called by the
 * bias-check-packet Trigger.dev task after Claude/Gemini scores the packet.
 *
 * Pass threshold rule: all 5 sub-criteria must clear their individual
 * thresholds (7/7/8/8/9 per design doc §Bias-Check Rubric). Overall,
 * per-criterion scores, provider, notes, and timestamp all persist.
 *
 * On pass: status → "delivered" (week-2; week-3 will gate on PDF + email).
 * On fail: status → "review" for the human review queue.
 */
export const setBiasCheck = mutation({
  args: {
    id: v.id("packets"),
    biasScore: v.number(),
    biasScoreOk: v.boolean(),
    biasSubScores: v.object({
      factualClaimsOnly: v.number(),
      multiplePerspectives: v.number(),
      openEndedQuestions: v.number(),
      languageNeutrality: v.number(),
      primarySourceAttribution: v.number(),
    }),
    biasReviewNotes: v.string(),
    biasProvider: v.union(v.literal("claude"), v.literal("gemini-fallback")),
  },
  handler: async (
    ctx,
    {
      id,
      biasScore,
      biasScoreOk,
      biasSubScores,
      biasReviewNotes,
      biasProvider,
    },
  ) => {
    const packet = await ctx.db.get(id);
    if (!packet) throw new Error(`Packet ${id} not found`);
    await ctx.db.patch(id, {
      qualityChecks: {
        ...packet.qualityChecks,
        biasScore,
        biasScoreOk,
        biasSubScores,
        biasReviewNotes,
        biasProvider,
        biasCheckedAt: Date.now(),
      },
      status: biasScoreOk ? "delivered" : "review",
    });
    return { status: biasScoreOk ? "delivered" : "review" };
  },
});

/**
 * Mark a packet as actually delivered (email sent). Called by the
 * sendPacketEmail task after Resend confirms the send.
 */
export const markDelivered = mutation({
  args: { id: v.id("packets") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, { deliveredAt: Date.now() });
  },
});

/**
 * Persist audio briefing URL after Trigger task uploads to R2. Called
 * by generatePacketAudio. audioDurationSec is integer seconds for the
 * UI to render a "(3:42)" badge without re-fetching the file.
 */
export const setAudio = mutation({
  args: {
    id: v.id("packets"),
    audioUrl: v.string(),
    audioDurationSec: v.number(),
  },
  handler: async (ctx, { id, audioUrl, audioDurationSec }) => {
    await ctx.db.patch(id, { audioUrl, audioDurationSec });
  },
});

/**
 * Persist PDF handout URL after Trigger task uploads to R2. Called by
 * generatePacketPdf.
 */
export const setPdf = mutation({
  args: {
    id: v.id("packets"),
    pdfUrl: v.string(),
  },
  handler: async (ctx, { id, pdfUrl }) => {
    await ctx.db.patch(id, { pdfUrl });
  },
});

/**
 * Founder-queue operation: approve or reject a packet that the auto
 * bias check flagged. On approve, status advances to delivered. On reject,
 * status lands at failed so the packet never ships.
 *
 * reviewerId is expected to be the Clerk user id of the founder. The
 * admin UI server action fetches this from Clerk auth and passes it
 * through; the mutation does not re-verify identity — auth is the
 * server action's job.
 */
export const humanReview = mutation({
  args: {
    id: v.id("packets"),
    decision: v.union(v.literal("approve"), v.literal("reject")),
    reviewerId: v.string(),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { id, decision, reviewerId, note }) => {
    const packet = await ctx.db.get(id);
    if (!packet) throw new Error(`Packet ${id} not found`);
    await ctx.db.patch(id, {
      qualityChecks: {
        ...packet.qualityChecks,
        humanReviewed: true,
        humanReviewDecision: decision,
        ...(note !== undefined && { humanReviewNote: note }),
        humanReviewerId: reviewerId,
        humanReviewedAt: Date.now(),
      },
      status: decision === "approve" ? "delivered" : "failed",
    });
    return { status: decision === "approve" ? "delivered" : "failed" };
  },
});

/**
 * List packets needing founder review. Today's rule: status=review AND
 * humanReviewed is not yet true. Ordered by generatedAt desc so the
 * newest ones are at the top of the queue.
 */
export const listPendingReview = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    const rows = await ctx.db
      .query("packets")
      .withIndex("by_status", (q) => q.eq("status", "review"))
      .order("desc")
      .take(limit ?? 50);
    return rows.filter((p) => !p.qualityChecks.humanReviewed);
  },
});

/**
 * Create a generated packet row. Called by the generatePacket task
 * after Gemini produces structured output.
 *
 * Idempotent per (teacherId, packetDate) — a second call for the same
 * day returns the existing packet id rather than creating a duplicate.
 */
export const create = mutation({
  args: {
    orgId: v.string(),
    teacherId: v.id("teachers"),
    packetDate: v.string(),
    sourceEventIds: v.array(v.id("congressEvents")),
    teacherBrief: v.string(),
    discussionQuestions: v.array(v.string()),
    exitTicket: v.object({
      questions: v.array(
        v.object({
          prompt: v.string(),
          kind: v.union(
            v.literal("multiple_choice"),
            v.literal("short_answer"),
          ),
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
    requestedBy: v.optional(
      v.union(v.literal("auto_schedule"), v.literal("teacher_request")),
    ),
    customTopic: v.optional(v.string()),
    targetBillRefs: v.optional(v.array(v.string())),
    readingLevelOverride: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    // Auto-scheduled packets idempotent per (teacher, date) — cron
    // retry returns the existing row. Teacher-requested packets skip
    // this check so repeated /teacher/create submissions create new rows.
    if (args.requestedBy !== "teacher_request") {
      const existing = await ctx.db
        .query("packets")
        .withIndex("by_teacher_date", (q) =>
          q.eq("teacherId", args.teacherId).eq("packetDate", args.packetDate),
        )
        .first();
      if (existing) return existing._id;
    }

    const id = await ctx.db.insert("packets", {
      ...args,
      status: "review",
      audioUrl: null,
      pdfUrl: null,
      generatedAt: Date.now(),
      deliveredAt: null,
    });
    return id;
  },
});

/**
 * Delete the packet for (teacher, date), if any. Returns the deleted id
 * or null if no row existed. Used by the forceRegenerate path of the
 * generator and by /admin/review when a packet needs to be re-rolled.
 */
export const deleteForDate = mutation({
  args: { teacherId: v.id("teachers"), packetDate: v.string() },
  handler: async (ctx, { teacherId, packetDate }) => {
    const existing = await ctx.db
      .query("packets")
      .withIndex("by_teacher_date", (q) =>
        q.eq("teacherId", teacherId).eq("packetDate", packetDate),
      )
      .first();
    if (!existing) return null;
    await ctx.db.delete(existing._id);
    return existing._id;
  },
});
