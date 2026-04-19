#!/usr/bin/env bun
import { tasks } from "@trigger.dev/sdk";
import type { backfillCongressLaws } from "@hakivo/packet/tasks";

const congressStr = process.argv[2] ?? "119";
const handle = await tasks.trigger<typeof backfillCongressLaws>(
  "backfill-congress-laws",
  { congressNumber: Number(congressStr) },
);
console.log("Backfill laws run:", handle.id);
