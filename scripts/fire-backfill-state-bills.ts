#!/usr/bin/env bun
/**
 * Fire backfill-state-bills.
 *   bun run scripts/fire-backfill-state-bills.ts <state> <session> [daysBack] [maxBills]
 *
 * Examples:
 *   bun run scripts/fire-backfill-state-bills.ts wi 2025
 *   bun run scripts/fire-backfill-state-bills.ts wi 2025 60 500
 */
import { tasks } from "@trigger.dev/sdk";
import type { backfillStateBills } from "@hakivo/packet/tasks";

const state = process.argv[2];
const session = process.argv[3];
const daysBack = process.argv[4] ? parseInt(process.argv[4], 10) : 60;
const maxBills = process.argv[5] ? parseInt(process.argv[5], 10) : 500;

if (!state || !session) {
  throw new Error(
    "usage: fire-backfill-state-bills.ts <state> <session> [daysBack] [maxBills]",
  );
}

const handle = await tasks.trigger<typeof backfillStateBills>(
  "backfill-state-bills",
  { state, session, daysBack, maxBills },
);
console.log("Triggered run:", handle.id);
console.log(
  "Dashboard:",
  `https://cloud.trigger.dev/projects/v3/proj_vhoibxepowdwgxtuahqh/runs/${handle.id}`,
);
