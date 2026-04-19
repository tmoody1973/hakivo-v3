#!/usr/bin/env bun
/**
 * Fire generate-personal-packet for a teacher / citizen record.
 *   bun run scripts/fire-personal-packet.ts <teacherId> [--force]
 */
import { tasks } from "@trigger.dev/sdk";
import type { generatePersonalPacket } from "@hakivo/packet/tasks";

const teacherId = process.argv[2];
const force = process.argv.includes("--force");
if (!teacherId) {
  throw new Error(
    "usage: fire-personal-packet.ts <teacherId> [--force]",
  );
}

const handle = await tasks.trigger<typeof generatePersonalPacket>(
  "generate-personal-packet",
  {
    teacherId: teacherId as never,
    ...(force && { forceRegenerate: true }),
  },
);
console.log("Triggered run:", handle.id);
console.log(
  "Dashboard:",
  `https://cloud.trigger.dev/projects/v3/proj_vhoibxepowdwgxtuahqh/runs/${handle.id}`,
);
