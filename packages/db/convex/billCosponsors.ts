import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const cosponsorRecord = v.object({
  orgId: v.string(),
  billRef: v.string(),
  bioguideId: v.string(),
  party: v.string(),
  state: v.string(),
  sponsorshipDate: v.string(),
  isOriginalCosponsor: v.boolean(),
  isWithdrawn: v.boolean(),
});

export const replaceForBill = mutation({
  args: {
    billRef: v.string(),
    cosponsors: v.array(cosponsorRecord),
  },
  handler: async (ctx, { billRef, cosponsors }) => {
    const existing = await ctx.db
      .query("billCosponsors")
      .withIndex("by_bill", (q) => q.eq("billRef", billRef))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const c of cosponsors) await ctx.db.insert("billCosponsors", c);
    return { deleted: existing.length, inserted: cosponsors.length };
  },
});

export const listForBill = query({
  args: { billRef: v.string() },
  handler: async (ctx, { billRef }) => {
    return await ctx.db
      .query("billCosponsors")
      .withIndex("by_bill", (q) => q.eq("billRef", billRef))
      .collect();
  },
});
