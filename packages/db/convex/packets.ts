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
 * Patch the bias-check result onto a packet. Called by the
 * bias-check-packet Trigger.dev task after Claude/Gemini scores the packet.
 *
 * Pass threshold rule: all 5 sub-criteria must clear their individual
 * thresholds (7/7/8/8/9 per design doc §Bias-Check Rubric). Only the
 * overall score and pass flag are stored on the packet; sub-scores live
 * in the task result and Trigger.dev run logs.
 *
 * On pass: status → "delivered" (week-2; week-3 will gate on PDF + email).
 * On fail: status → "review" for the human review queue.
 */
export const setBiasCheck = mutation({
  args: {
    id: v.id("packets"),
    biasScore: v.number(),
    biasScoreOk: v.boolean(),
  },
  handler: async (ctx, { id, biasScore, biasScoreOk }) => {
    const packet = await ctx.db.get(id);
    if (!packet) throw new Error(`Packet ${id} not found`);
    await ctx.db.patch(id, {
      qualityChecks: {
        ...packet.qualityChecks,
        biasScore,
        biasScoreOk,
      },
      status: biasScoreOk ? "delivered" : "review",
    });
    return { status: biasScoreOk ? "delivered" : "review" };
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
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("packets")
      .withIndex("by_teacher_date", (q) =>
        q.eq("teacherId", args.teacherId).eq("packetDate", args.packetDate),
      )
      .first();
    if (existing) return existing._id;

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
