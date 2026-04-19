import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Laws data-access layer. Enacted public and private laws from the
 * Congress.gov /law endpoint. Each row links back to its originating
 * bill via originBillRef ("congress-billType-billNumber" format).
 */

const lawRecord = v.object({
  orgId: v.string(),
  congressNumber: v.number(),
  lawType: v.union(v.literal("pub"), v.literal("priv")),
  lawNumber: v.number(),
  title: v.string(),
  signedDate: v.string(),
  originBillRef: v.optional(v.string()),
  billType: v.optional(v.string()),
  billNumber: v.optional(v.number()),
  text: v.optional(v.string()),
  textUrl: v.optional(v.string()),
  summary: v.optional(v.string()),
  topics: v.array(v.string()),
});

export const upsertBatch = mutation({
  args: { laws: v.array(lawRecord) },
  handler: async (ctx, { laws }) => {
    let inserted = 0;
    let updated = 0;
    for (const law of laws) {
      const existing = await ctx.db
        .query("laws")
        .withIndex("by_congress_type_number", (q) =>
          q
            .eq("congressNumber", law.congressNumber)
            .eq("lawType", law.lawType)
            .eq("lawNumber", law.lawNumber),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, law);
        updated += 1;
      } else {
        await ctx.db.insert("laws", law);
        inserted += 1;
      }
    }
    return { inserted, updated, total: laws.length };
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("laws")
      .withIndex("by_signedDate")
      .order("desc")
      .take(limit ?? 20);
  },
});

export const getById = query({
  args: { id: v.id("laws") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const getByBill = query({
  args: { originBillRef: v.string() },
  handler: async (ctx, { originBillRef }) => {
    return await ctx.db
      .query("laws")
      .withIndex("by_originBill", (q) =>
        q.eq("originBillRef", originBillRef),
      )
      .first();
  },
});
