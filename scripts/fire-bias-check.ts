#!/usr/bin/env bun
/**
 * Fire bias-check-packet for a packet id.
 *   bun run scripts/fire-bias-check.ts <packetId>
 */
import { tasks } from "@trigger.dev/sdk";
import type { biasCheckPacket } from "@hakivo/packet/tasks";

const packetId = process.argv[2];
if (!packetId) throw new Error("usage: fire-bias-check.ts <packetId>");

const handle = await tasks.trigger<typeof biasCheckPacket>(
  "bias-check-packet",
  { packetId: packetId as never },
);
console.log("Triggered run:", handle.id);
