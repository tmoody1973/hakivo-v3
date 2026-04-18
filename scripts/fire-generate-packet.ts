#!/usr/bin/env bun
/**
 * Fire the generate-packet task for a specific teacher.
 *   bun run scripts/fire-generate-packet.ts <teacherId>
 */
import { tasks } from "@trigger.dev/sdk";
import type { generatePacket } from "@hakivo/packet/tasks";

const teacherId = process.argv[2];
if (!teacherId) {
  throw new Error("usage: fire-generate-packet.ts <teacherId>");
}

const handle = await tasks.trigger<typeof generatePacket>("generate-packet", {
  teacherId: teacherId as never,
});

console.log("Triggered run:", handle.id);
console.log(
  "Dashboard:",
  `https://cloud.trigger.dev/projects/v3/proj_vhoibxepowdwgxtuahqh/runs/${handle.id}`,
);
