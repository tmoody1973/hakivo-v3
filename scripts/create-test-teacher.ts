#!/usr/bin/env bun
/**
 * Create a week-2 test teacher directly in Convex (bypasses Clerk).
 * Prints the teacher id to stdout — feed into fire-generate-packet.
 *
 * NOTE: Uses an unauthenticated mutation that's only tolerable because
 * our dev Convex deployment is sandboxed. The production onboarding path
 * through Clerk + fetchMutation is the real one (see apps/teacher).
 */
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const convex = new ConvexHttpClient(url);

// Direct insert via a throwaway mutation — bypasses teachers.create
// which requires ctx.auth. We call a dev-only mutation instead.
// For week-1, cheat: use the existing Convex dashboard to manually
// insert a teacher row, OR expose a dev-only teachers.createForTest
// mutation. Adding the latter here.

console.error(
  "usage: after adding teachers.createForTest mutation,\n" +
    "       bun run scripts/create-test-teacher.ts",
);
const id = await convex.mutation(api.teachers.createForTest, {
  orgId: "hakivo-v3",
  role: "teacher",
  email: "mrs.johnson+test@hakivo.com",
  name: "Mrs. Johnson",
  school: "Milwaukee Riverside High",
  state: "WI",
  gradesTaught: ["10", "11", "12"],
  courses: ["US Government", "AP US Gov"],
  currentUnit: "unit_3",
  targetReadingLevel: "10th grade",
  timezone: "America/Chicago",
});

console.log("Teacher id:", id);
