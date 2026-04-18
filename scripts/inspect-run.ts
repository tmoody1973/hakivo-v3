#!/usr/bin/env bun
/**
 * Inspect a trigger.dev run by id. Prints status + output.
 *   bun run scripts/inspect-run.ts run_<id>
 */
import { runs } from "@trigger.dev/sdk";

const runId = process.argv[2];
if (!runId) throw new Error("usage: bun run scripts/inspect-run.ts <runId>");

const run = await runs.retrieve(runId);
console.log(JSON.stringify({
  id: run.id,
  status: run.status,
  taskIdentifier: run.taskIdentifier,
  durationMs: run.durationMs,
  output: run.output,
  error: run.error,
}, null, 2));
