#!/usr/bin/env bun
/**
 * Fire send-packet-email for an existing packet.
 *   bun run scripts/fire-send-email.ts <packetId>
 *
 * Note on sender:
 *   - With no verified hakivo.com domain, Resend's sandbox sender
 *     (onboarding@resend.dev) can ONLY send to the email you signed
 *     up for Resend with. Recipient must match.
 *   - Once hakivo.com DNS is verified, set RESEND_FROM_ADDRESS in env
 *     and you can send to any address.
 */
import { tasks } from "@trigger.dev/sdk";
import type { sendPacketEmail } from "@hakivo/packet/tasks";

const packetId = process.argv[2];
if (!packetId) {
  throw new Error("usage: fire-send-email.ts <packetId>");
}

const handle = await tasks.trigger<typeof sendPacketEmail>(
  "send-packet-email",
  { packetId: packetId as never },
);

console.log("Triggered run:", handle.id);
console.log(
  "Dashboard:",
  `https://cloud.trigger.dev/projects/v3/proj_vhoibxepowdwgxtuahqh/runs/${handle.id}`,
);
