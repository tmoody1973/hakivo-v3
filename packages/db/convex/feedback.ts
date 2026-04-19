import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Per-section packet feedback. v3.0 uses this to tune the rubric
 * post-launch (design doc §Bias-Check Rubric — "teacher feedback
 * thumbs-down on a section triggers a bias re-evaluation").
 *
 * Auth-gated: only the teacher who owns the packet can submit feedback.
 */

export const submit = mutation({
  args: {
    packetId: v.id("packets"),
    section: v.string(),
    rating: v.union(v.literal("up"), v.literal("down")),
    note: v.optional(v.string()),
  },
  handler: async (ctx, { packetId, section, rating, note }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const teacher = await ctx.db
      .query("teachers")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .first();
    if (!teacher) throw new Error("Not onboarded");

    const packet = await ctx.db.get(packetId);
    if (!packet) throw new Error("Packet not found");
    if (packet.teacherId !== teacher._id) {
      throw new Error("You can only rate your own packets");
    }

    // One rating per (teacher, packet, section) — update existing if present
    const existing = await ctx.db
      .query("feedback")
      .withIndex("by_packet", (q) => q.eq("packetId", packetId))
      .filter((q) =>
        q.and(
          q.eq(q.field("teacherId"), teacher._id),
          q.eq(q.field("section"), section),
        ),
      )
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        rating,
        note: note ?? null,
      });
      return existing._id;
    }

    return await ctx.db.insert("feedback", {
      orgId: teacher.orgId,
      packetId,
      teacherId: teacher._id,
      section,
      rating,
      note: note ?? null,
      createdAt: Date.now(),
    });
  },
});

export const listForPacket = query({
  args: { packetId: v.id("packets") },
  handler: async (ctx, { packetId }) => {
    return await ctx.db
      .query("feedback")
      .withIndex("by_packet", (q) => q.eq("packetId", packetId))
      .collect();
  },
});

export const getMineForPacket = query({
  args: { packetId: v.id("packets") },
  handler: async (ctx, { packetId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const teacher = await ctx.db
      .query("teachers")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .first();
    if (!teacher) return [];
    return await ctx.db
      .query("feedback")
      .withIndex("by_packet", (q) => q.eq("packetId", packetId))
      .filter((q) => q.eq(q.field("teacherId"), teacher._id))
      .collect();
  },
});
