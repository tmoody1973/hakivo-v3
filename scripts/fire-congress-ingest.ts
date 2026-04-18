#!/usr/bin/env bun
/**
 * Manually fire the scheduled ingest-congress-daily task once.
 * Bun auto-loads .env.local for TRIGGER_SECRET_KEY.
 */
import { tasks } from "@trigger.dev/sdk";
import type { ingestCongressDaily } from "@hakivo/packet/tasks";

const handle = await tasks.trigger<typeof ingestCongressDaily>(
  "ingest-congress-daily",
  undefined,
);

console.log("Triggered run:", handle.id);
console.log(
  "Dashboard:",
  `https://cloud.trigger.dev/projects/v3/proj_vhoibxepowdwgxtuahqh/runs/${handle.id}`,
);
