#!/usr/bin/env bun
/**
 * Fire the deliver-daily-packet task once with a week-1 test payload.
 * Bun auto-loads .env.local, so TRIGGER_SECRET_KEY is picked up automatically.
 *
 *   bun run scripts/fire-daily-packet.ts
 */

import { tasks } from "@trigger.dev/sdk";
import type { deliverDailyPacket } from "@hakivo/packet/tasks";

const handle = await tasks.trigger<typeof deliverDailyPacket>(
  "deliver-daily-packet",
  {
    recipientId: "test-teacher-1",
    localDate: "2026-04-18",
    orgId: "test-org",
  },
);

console.log("Triggered run:", handle.id);
console.log("Public access token:", handle.publicAccessToken);
console.log("Dashboard:", `https://cloud.trigger.dev/projects/v3/proj_vhoibxepowdwgxtuahqh/runs/${handle.id}`);
