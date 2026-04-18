import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

const subjectRecord = v.object({
  orgId: v.string(),
  billRef: v.string(),
  subject: v.string(),
  isPolicyArea: v.boolean(),
});

export const replaceForBill = mutation({
  args: {
    billRef: v.string(),
    subjects: v.array(subjectRecord),
  },
  handler: async (ctx, { billRef, subjects }) => {
    const existing = await ctx.db
      .query("billSubjects")
      .withIndex("by_bill", (q) => q.eq("billRef", billRef))
      .collect();
    for (const row of existing) await ctx.db.delete(row._id);
    for (const s of subjects) await ctx.db.insert("billSubjects", s);
    return { deleted: existing.length, inserted: subjects.length };
  },
});

export const listForBill = query({
  args: { billRef: v.string() },
  handler: async (ctx, { billRef }) => {
    return await ctx.db
      .query("billSubjects")
      .withIndex("by_bill", (q) => q.eq("billRef", billRef))
      .collect();
  },
});
