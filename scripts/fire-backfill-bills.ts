#!/usr/bin/env bun
import { tasks } from "@trigger.dev/sdk";
import type { backfillCongressBills } from "@hakivo/packet/tasks";

const congressStr = process.argv[2] ?? "119";
const handle = await tasks.trigger<typeof backfillCongressBills>(
  "backfill-congress-bills",
  { congressNumber: Number(congressStr) },
);
console.log("Backfill bills run:", handle.id);
