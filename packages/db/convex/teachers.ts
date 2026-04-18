import { query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Lookup a teacher by their Clerk user id. Returns null if not onboarded.
 *
 * Week-1 stub — real RLS, orgId scoping, and read auth land in week 2
 * alongside the Clerk identity-verification wiring.
 */
export const getByClerkUserId = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    return await ctx.db
      .query("teachers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .first();
  },
});
