#!/usr/bin/env bun
import { tasks } from "@trigger.dev/sdk";
import type { ingestLegislatorsWeekly } from "@hakivo/packet/tasks";

const handle = await tasks.trigger<typeof ingestLegislatorsWeekly>(
  "ingest-legislators-weekly",
  undefined,
);

console.log("Triggered run:", handle.id);
