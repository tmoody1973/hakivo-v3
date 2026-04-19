#!/usr/bin/env bun
/**
 * Fire generate-packet-pdf for an existing packet.
 *   bun run scripts/fire-generate-pdf.ts <packetId>
 *
 * Requires R2_* env vars in root .env.local (same set as audio).
 */
import { tasks } from "@trigger.dev/sdk";
import type { generatePacketPdf } from "@hakivo/packet/tasks";

const packetId = process.argv[2];
if (!packetId) {
  throw new Error("usage: fire-generate-pdf.ts <packetId>");
}

const handle = await tasks.trigger<typeof generatePacketPdf>(
  "generate-packet-pdf",
  { packetId: packetId as never },
);

console.log("Triggered run:", handle.id);
console.log(
  "Dashboard:",
  `https://cloud.trigger.dev/projects/v3/proj_vhoibxepowdwgxtuahqh/runs/${handle.id}`,
);
