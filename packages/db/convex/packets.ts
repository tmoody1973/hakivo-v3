import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Fetch a teacher's packet history, newest first.
 *
 * Week-1 stub — pagination and orgId scoping land in week 2.
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
