import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api } from "@hakivo/db";
import { NextResponse } from "next/server";
import {
  listCourses,
  loadGoogleOAuthCredsFromEnv,
  refreshAccessToken,
} from "@hakivo/packet/integrations/google-classroom";

/**
 * GET /api/google/courses
 *
 * Returns the signed-in teacher's active Google Classroom courses,
 * used to populate the course-picker dropdown after OAuth completes.
 * Refreshes the access token on every call (cheap, ~150ms) so we
 * don't have to persist it.
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const { userId, getToken } = await auth();
  if (!userId) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const convexToken = await getToken({ template: "convex" });
  if (!convexToken) {
    return NextResponse.json({ error: "no_convex_token" }, { status: 401 });
  }

  const teacher = await fetchQuery(
    api.teachers.getMe,
    {},
    { token: convexToken },
  );
  if (!teacher) {
    return NextResponse.json({ error: "not_onboarded" }, { status: 404 });
  }
  if (!teacher.classroomRefreshToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }

  try {
    const creds = loadGoogleOAuthCredsFromEnv();
    const { accessToken } = await refreshAccessToken(
      creds,
      teacher.classroomRefreshToken,
    );
    const courses = await listCourses(accessToken);
    return NextResponse.json({ courses });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
