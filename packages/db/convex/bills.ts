import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Bills data-access layer.
 *
 * upsertBatch is called from the ingest-congress-daily Trigger.dev task.
 * No Clerk identity on this path — Trigger.dev runs in the Convex org's
 * trust boundary. A week-2 httpAction + bearer-token guard will formalize
 * this; for now the mutation is trusted by proximity (only our deploy
 * deploys Trigger.dev tasks against our Convex deployment).
 */

const billRecord = v.object({
  orgId: v.string(),
  congressNumber: v.number(),
  billType: v.string(),
  billNumber: v.number(),
  title: v.string(),
  introducedDate: v.number(),
  latestAction: v.string(),
  latestActionDate: v.number(),
  topics: v.array(v.string()),
  summary: v.optional(v.string()),
  billText: v.optional(v.string()),
});

export const upsertBatch = mutation({
  args: { bills: v.array(billRecord) },
  handler: async (ctx, { bills }) => {
    let inserted = 0;
    let updated = 0;
    for (const bill of bills) {
      const existing = await ctx.db
        .query("bills")
        .withIndex("by_congress", (q) =>
          q
            .eq("congressNumber", bill.congressNumber)
            .eq("billType", bill.billType)
            .eq("billNumber", bill.billNumber),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, bill);
        updated += 1;
      } else {
        await ctx.db.insert("bills", bill);
        inserted += 1;
      }
    }
    return { inserted, updated, total: bills.length };
  },
});

export const listRecent = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, { limit }) => {
    return await ctx.db
      .query("bills")
      .withIndex("by_latestAction")
      .order("desc")
      .take(limit ?? 20);
  },
});

/**
 * Patch a single bill with enrichment data. Called by the enrichBill
 * Trigger.dev task after fetching text + summary + generating embedding.
 *
 * The bill row must already exist (inserted by ingestCongressDaily).
 * Errors if bill is missing — enrichBill should skip nonexistent refs.
 */
export const enrichOne = mutation({
  args: {
    congressNumber: v.number(),
    billType: v.string(),
    billNumber: v.number(),
    billText: v.optional(v.string()),
    billTextUrl: v.optional(v.string()),
    billTextSource: v.optional(v.string()),
    summary: v.optional(v.string()),
    topics: v.optional(v.array(v.string())),
    embedding: v.optional(v.array(v.float64())),
  },
  handler: async (ctx, args) => {
    const { congressNumber, billType, billNumber, ...patch } = args;
    const existing = await ctx.db
      .query("bills")
      .withIndex("by_congress", (q) =>
        q
          .eq("congressNumber", congressNumber)
          .eq("billType", billType)
          .eq("billNumber", billNumber),
      )
      .first();
    if (!existing) {
      throw new Error(
        `enrichOne: bill ${congressNumber}-${billType}-${billNumber} not found — run ingestCongressDaily first`,
      );
    }
    await ctx.db.patch(existing._id, {
      ...patch,
      ...(patch.billText !== undefined && { billTextFetchedAt: Date.now() }),
      enrichedAt: Date.now(),
    });
    return existing._id;
  },
});
