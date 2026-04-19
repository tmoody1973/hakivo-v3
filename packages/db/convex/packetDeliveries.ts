import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

/**
 * Packet delivery ledger. Idempotency key: (recipientId, localDate).
 *
 * The lifecycle:
 *   startSend  → row created in "sending" state (or returns existing)
 *   markDelivered → success terminal state
 *   markFailed → fail state, attempts++, lastError stored
 *
 * Trigger.dev's retry config wraps markFailed — failed rows can be
 * re-attempted by re-firing sendPacketEmail with the same packetId.
 */

export const startSend = mutation({
  args: {
    orgId: v.string(),
    recipientId: v.id("teachers"),
    packetId: v.id("packets"),
    localDate: v.string(),
  },
  handler: async (
    ctx,
    { orgId, recipientId, packetId, localDate },
  ): Promise<{
    readonly existed: boolean;
    readonly id: Id<"packetDeliveries">;
    readonly status: string;
  }> => {
    const existing = await ctx.db
      .query("packetDeliveries")
      .withIndex("by_recipient_date", (q) =>
        q.eq("recipientId", recipientId).eq("localDate", localDate),
      )
      .first();
    if (existing) {
      return { existed: true, id: existing._id, status: existing.status };
    }
    const idempotencyKey = `packet:${recipientId}:${localDate}`;
    const id = await ctx.db.insert("packetDeliveries", {
      orgId,
      recipientId,
      packetId,
      localDate,
      idempotencyKey,
      status: "sending",
      attempts: 1,
      lastError: null,
      scheduledFor: Date.now(),
      deliveredAt: null,
    });
    return { existed: false, id, status: "sending" };
  },
});

export const markDelivered = mutation({
  args: { id: v.id("packetDeliveries") },
  handler: async (ctx, { id }) => {
    await ctx.db.patch(id, {
      status: "delivered",
      deliveredAt: Date.now(),
    });
  },
});

export const markFailed = mutation({
  args: { id: v.id("packetDeliveries"), error: v.string() },
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
      .query("packetDeliveries")
      .withIndex("by_recipient_date", (q) => q.eq("recipientId", teacherId))
      .order("desc")
      .take(limit ?? 50);
  },
});
