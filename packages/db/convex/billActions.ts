import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const actionRecord = v.object({
  orgId: v.string(),
  billRef: v.string(),
  actionDate: v.number(),
  actionType: v.string(),
  actionText: v.string(),
  chamber: v.optional(v.union(v.literal("house"), v.literal("senate"))),
  actionCode: v.optional(v.string()),
});

/**
 * Replace all actions for a bill. Congress.gov returns the complete
 * action history on every call, so upsert-semantics = delete-then-insert.
 * Keeps the log pure and avoids append drift.
 */
export const replaceForBill = mutation({
  args: {
    billRef: v.string(),
    actions: v.array(actionRecord),
  },
  handler: async (ctx, { billRef, actions }) => {
    const existing = await ctx.db
      .query("billActions")
      .withIndex("by_bill_date", (q) => q.eq("billRef", billRef))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const a of actions) await ctx.db.insert("billActions", a);
    return { deleted: existing.length, inserted: actions.length };
  },
});

export const listForBill = query({
  args: { billRef: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { billRef, limit }) => {
    return await ctx.db
      .query("billActions")
      .withIndex("by_bill_date", (q) => q.eq("billRef", billRef))
      .order("desc")
      .take(limit ?? 50);
  },
});
