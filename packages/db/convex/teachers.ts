import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Lookup a teacher by their Clerk user id. Returns null if not onboarded.
 */
export const getById = query({
  args: { id: v.id("teachers") },
  handler: async (ctx, { id }) => {
    return await ctx.db.get(id);
  },
});

export const getByClerkUserId = query({
  args: { clerkUserId: v.string() },
  handler: async (ctx, { clerkUserId }) => {
    return await ctx.db
      .query("teachers")
      .withIndex("by_clerkUserId", (q) => q.eq("clerkUserId", clerkUserId))
      .first();
  },
});

/**
 * Fetch the current signed-in user's teacher record (auth-gated).
 * Returns null if the user is not signed in or not yet onboarded.
 */
export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    return await ctx.db
      .query("teachers")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .first();
  },
});

/**
 * Create a teacher row from onboarding. Idempotent per Clerk user — a
 * second call for the same clerkUserId returns the existing row.
 *
 * Trust boundary: this mutation verifies the caller's Clerk identity via
 * `ctx.auth`. The server action that invokes it passes a Clerk-issued
 * JWT (template "convex") so `identity.subject` is the verified user id.
 */
export const create = mutation({
  args: {
    orgId: v.string(),
    role: v.union(v.literal("teacher"), v.literal("individual")),
    email: v.string(),
    name: v.string(),
    school: v.optional(v.string()),
    state: v.optional(v.string()),
    gradesTaught: v.array(v.string()),
    courses: v.array(v.string()),
    currentUnit: v.union(v.string(), v.null()),
    targetReadingLevel: v.optional(v.string()),
    timezone: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated — onboarding requires a signed-in user");
    }

    const existing = await ctx.db
      .query("teachers")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .first();
    if (existing) return existing._id;

    const id = await ctx.db.insert("teachers", {
      ...args,
      clerkUserId: identity.subject,
      clerkOrgId: args.orgId,
      classroomConnected: false,
      classroomRefreshToken: null,
      createdAt: Date.now(),
      status: "trial",
    });
    return id;
  },
});
