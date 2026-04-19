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

/**
 * DEV-ONLY: repoint an existing teacher row to a new orgId. Used during
 * week-2 to fix onboarding rows created before the shared-org convention
 * was locked in. Remove in week-3.
 */
export const repointOrg = mutation({
  args: {
    id: v.id("teachers"),
    orgId: v.string(),
  },
  handler: async (ctx, { id, orgId }) => {
    await ctx.db.patch(id, { orgId });
    return { id, orgId };
  },
});

/**
 * Update a teacher's profile. Only the teacher themselves can call this
 * (verified via ctx.auth). Used by /teacher/settings.
 */
export const updateMe = mutation({
  args: {
    name: v.optional(v.string()),
    school: v.optional(v.string()),
    state: v.optional(v.string()),
    gradesTaught: v.optional(v.array(v.string())),
    courses: v.optional(v.array(v.string())),
    currentUnit: v.optional(v.union(v.string(), v.null())),
    targetReadingLevel: v.optional(v.string()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, patch) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const teacher = await ctx.db
      .query("teachers")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", identity.subject),
      )
      .first();
    if (!teacher) throw new Error("Not onboarded");
    await ctx.db.patch(teacher._id, patch);
    return teacher._id;
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
/**
 * DEV-ONLY: Create a teacher without Clerk auth. Used by
 * scripts/create-test-teacher.ts for week-2 pipeline smoke tests.
 * Production onboarding path is `create` below, which requires
 * ctx.auth.getUserIdentity().
 *
 * TODO(week-3): remove or gate behind an env flag before any real
 * tenant data lands in this deployment.
 */
export const createForTest = mutation({
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
    const existing = await ctx.db
      .query("teachers")
      .withIndex("by_clerkUserId", (q) =>
        q.eq("clerkUserId", `test:${args.email}`),
      )
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("teachers", {
      ...args,
      clerkUserId: `test:${args.email}`,
      clerkOrgId: args.orgId,
      classroomConnected: false,
      classroomRefreshToken: null,
      createdAt: Date.now(),
      status: "trial",
    });
  },
});

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

/**
 * Persist Google Classroom OAuth tokens after the OAuth callback.
 * Called server-side from the /api/google/oauth/callback route after
 * the auth code is exchanged for tokens. Stores only the refresh token
 * (long-lived) — access tokens are exchanged on demand per push.
 */
export const setClassroomTokens = mutation({
  args: {
    teacherId: v.id("teachers"),
    refreshToken: v.string(),
    googleEmail: v.string(),
  },
  handler: async (ctx, { teacherId, refreshToken, googleEmail }) => {
    await ctx.db.patch(teacherId, {
      classroomConnected: true,
      classroomRefreshToken: refreshToken,
      classroomGoogleEmail: googleEmail,
    });
  },
});

/**
 * Set the default Google Classroom course for packet pushes. Picked by
 * the teacher in /teacher/settings/classroom after OAuth completes.
 */
export const setClassroomCourse = mutation({
  args: {
    teacherId: v.id("teachers"),
    courseId: v.string(),
    courseName: v.string(),
  },
  handler: async (ctx, { teacherId, courseId, courseName }) => {
    await ctx.db.patch(teacherId, {
      classroomCourseId: courseId,
      classroomCourseName: courseName,
    });
  },
});

/**
 * Set personal-tier interests + state for the personal-packet generator.
 * Called from /personal/settings (when that UI lands) or directly via
 * a script for now.
 */
export const setPersonalSettings = mutation({
  args: {
    teacherId: v.id("teachers"),
    interestTags: v.array(v.string()),
    personalState: v.optional(v.string()),
  },
  handler: async (ctx, { teacherId, interestTags, personalState }) => {
    await ctx.db.patch(teacherId, {
      interestTags,
      ...(personalState !== undefined && { personalState }),
    });
  },
});

/**
 * Disconnect Google Classroom — wipes refresh token + course settings.
 * Used by the "Disconnect" button in settings. Does NOT revoke the
 * Google-side grant; teachers should also revoke at myaccount.google.com
 * if they want to fully sever access.
 */
export const disconnectClassroom = mutation({
  args: { teacherId: v.id("teachers") },
  handler: async (ctx, { teacherId }) => {
    await ctx.db.patch(teacherId, {
      classroomConnected: false,
      classroomRefreshToken: null,
      classroomCourseId: undefined,
      classroomCourseName: undefined,
      classroomGoogleEmail: undefined,
    });
  },
});
