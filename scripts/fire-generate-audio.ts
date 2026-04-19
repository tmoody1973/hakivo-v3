#!/usr/bin/env bun
/**
 * Fire generate-packet-audio for an existing packet.
 *   bun run scripts/fire-generate-audio.ts <packetId>
 *
 * Requires R2_* env vars in root .env.local. Without them the upload
 * step throws and the packet still ships email-only.
 */
import { tasks } from "@trigger.dev/sdk";
import type { generatePacketAudio } from "@hakivo/packet/tasks";

const packetId = process.argv[2];
if (!packetId) {
  throw new Error("usage: fire-generate-audio.ts <packetId>");
}

const handle = await tasks.trigger<typeof generatePacketAudio>(
  "generate-packet-audio",
  { packetId: packetId as never },
);

console.log("Triggered run:", handle.id);
console.log(
  "Dashboard:",
  `https://cloud.trigger.dev/projects/v3/proj_vhoibxepowdwgxtuahqh/runs/${handle.id}`,
);
