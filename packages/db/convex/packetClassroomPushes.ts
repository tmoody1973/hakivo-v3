import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * Google Classroom push ledger. Idempotency key: (teacherId, packetId).
 * Same lifecycle pattern as packetDeliveries: startPush → markPushed
 * (success) | markFailed (retry).
 */

export const startPush = mutation({
  args: {
    orgId: v.string(),
    teacherId: v.id("teachers"),
    packetId: v.id("packets"),
    courseId: v.string(),
  },
  handler: async (
    ctx,
    { orgId, teacherId, packetId, courseId },
  ): Promise<{
    readonly existed: boolean;
    readonly id: Id<"packetClassroomPushes">;
    readonly status: "pending" | "pushed" | "failed";
  }> => {
    const existing = await ctx.db
      .query("packetClassroomPushes")
      .withIndex("by_teacher_packet", (q) =>
        q.eq("teacherId", teacherId).eq("packetId", packetId),
      )
      .first();
    if (existing) {
      return {
        existed: true,
        id: existing._id,
        status: existing.status,
      };
    }
    const id = await ctx.db.insert("packetClassroomPushes", {
      orgId,
      teacherId,
      packetId,
      courseId,
      status: "pending",
      classroomAnnouncementId: null,
      classroomAlternateLink: null,
      attempts: 1,
      lastError: null,
      pushedAt: null,
      requestedAt: Date.now(),
    });
    return { existed: false, id, status: "pending" };
  },
});

export const markPushed = mutation({
  args: {
    id: v.id("packetClassroomPushes"),
    classroomAnnouncementId: v.string(),
    classroomAlternateLink: v.string(),
  },
  handler: async (
    ctx,
    { id, classroomAnnouncementId, classroomAlternateLink },
  ) => {
    await ctx.db.patch(id, {
      status: "pushed",
      classroomAnnouncementId,
      classroomAlternateLink,
      pushedAt: Date.now(),
    });
  },
});

export const markFailed = mutation({
  args: { id: v.id("packetClassroomPushes"), error: v.string() },
  handler: async (ctx, { id, error }) => {
    const row = await ctx.db.get(id);
    await ctx.db.patch(id, {
      status: "failed",
      attempts: (row?.attempts ?? 0) + 1,
      lastError: error,
    });
  },
});

export const listForTeacher = query({
  args: { teacherId: v.id("teachers"), limit: v.optional(v.number()) },
  handler: async (ctx, { teacherId, limit }) => {
    return await ctx.db
      .query("packetClassroomPushes")
      .withIndex("by_teacher_pushed", (q) => q.eq("teacherId", teacherId))
      .order("desc")
      .take(limit ?? 30);
  },
});

export const getForPacket = query({
  args: { teacherId: v.id("teachers"), packetId: v.id("packets") },
  handler: async (ctx, { teacherId, packetId }) => {
    return await ctx.db
      .query("packetClassroomPushes")
      .withIndex("by_teacher_packet", (q) =>
        q.eq("teacherId", teacherId).eq("packetId", packetId),
      )
      .first();
  },
});
