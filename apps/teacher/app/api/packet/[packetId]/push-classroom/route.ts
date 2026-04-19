import { auth } from "@clerk/nextjs/server";
import { fetchQuery } from "convex/nextjs";
import { api, type Id } from "@hakivo/db";
import { tasks } from "@trigger.dev/sdk";
import type { pushToClassroom } from "@hakivo/packet/tasks";
import { NextResponse, type NextRequest } from "next/server";

/**
 * POST /api/packet/[packetId]/push-classroom
 *
 * Fires the push-to-classroom Trigger task for the signed-in teacher's
 * default course. Validates that the packet belongs to the same teacher
 * (you can only push your own packets) and that they have Classroom
 * connected with a default course set.
 */

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  ctx: { params: Promise<{ packetId: string }> },
) {
  const { packetId } = await ctx.params;
  const { userId, getToken } = await auth();
  if (!userId) return NextResponse.json({ error: "unauth" }, { status: 401 });

  const convexToken = await getToken({ template: "convex" });
  if (!convexToken) {
    return NextResponse.json({ error: "no_convex_token" }, { status: 401 });
  }

  const [teacher, packet] = await Promise.all([
    fetchQuery(api.teachers.getMe, {}, { token: convexToken }),
    fetchQuery(api.packets.getById, { id: packetId as Id<"packets"> }),
  ]);
  if (!teacher) {
    return NextResponse.json({ error: "not_onboarded" }, { status: 404 });
  }
  if (!packet) {
    return NextResponse.json({ error: "packet_not_found" }, { status: 404 });
  }
  if (packet.teacherId !== teacher._id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!teacher.classroomConnected || !teacher.classroomRefreshToken) {
    return NextResponse.json({ error: "not_connected" }, { status: 400 });
  }
  if (!teacher.classroomCourseId) {
    return NextResponse.json({ error: "no_default_course" }, { status: 400 });
  }

  const handle = await tasks.trigger<typeof pushToClassroom>(
    "push-to-classroom",
    { packetId: packet._id, teacherId: teacher._id },
  );

  return NextResponse.json({ runId: handle.id });
}
