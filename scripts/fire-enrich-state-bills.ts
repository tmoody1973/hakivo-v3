#!/usr/bin/env bun
/**
 * Fire enrich-state-bills.
 *   bun run scripts/fire-enrich-state-bills.ts <state> [maxBills]
 *
 * Examples:
 *   bun run scripts/fire-enrich-state-bills.ts WI
 *   bun run scripts/fire-enrich-state-bills.ts WI 200
 */
import { tasks } from "@trigger.dev/sdk";
import type { enrichStateBills } from "@hakivo/packet/tasks";

const state = process.argv[2];
const maxBills = process.argv[3] ? parseInt(process.argv[3], 10) : 200;

if (!state) {
  throw new Error("usage: fire-enrich-state-bills.ts <state> [maxBills]");
}

const handle = await tasks.trigger<typeof enrichStateBills>(
  "enrich-state-bills",
  { state, maxBills },
);
console.log("Triggered run:", handle.id);
console.log(
  "Dashboard:",
  `https://cloud.trigger.dev/projects/v3/proj_vhoibxepowdwgxtuahqh/runs/${handle.id}`,
);
