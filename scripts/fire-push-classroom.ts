#!/usr/bin/env bun
/**
 * Manually fire push-to-classroom for a (teacherId, packetId) pair.
 *   bun run scripts/fire-push-classroom.ts <teacherId> <packetId>
 *
 * Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI
 * in root .env.local plus the teacher having connected via the OAuth
 * flow (so classroomRefreshToken + classroomCourseId are set).
 */
import { tasks } from "@trigger.dev/sdk";
import type { pushToClassroom } from "@hakivo/packet/tasks";

const teacherId = process.argv[2];
const packetId = process.argv[3];
if (!teacherId || !packetId) {
  throw new Error("usage: fire-push-classroom.ts <teacherId> <packetId>");
}

const handle = await tasks.trigger<typeof pushToClassroom>(
  "push-to-classroom",
  {
    teacherId: teacherId as never,
    packetId: packetId as never,
  },
);

console.log("Triggered run:", handle.id);
console.log(
  "Dashboard:",
  `https://cloud.trigger.dev/projects/v3/proj_vhoibxepowdwgxtuahqh/runs/${handle.id}`,
);
