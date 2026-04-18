import { query } from "./_generated/server";

/**
 * DEV-ONLY: list all teachers + their latest packet. For diagnosing
 * onboarding state and packet availability during week-2 testing.
 *
 * TODO(week-3): remove or gate behind env flag before production.
 */
export const listAllTeachers = query({
  args: {},
  handler: async (ctx) => {
    const teachers = await ctx.db.query("teachers").take(100);
    return teachers.map((t) => ({
      _id: t._id,
      clerkUserId: t.clerkUserId,
      name: t.name,
      email: t.email,
      school: t.school,
      state: t.state,
      currentUnit: t.currentUnit,
      createdAt: new Date(t.createdAt).toISOString(),
      status: t.status,
    }));
  },
});
