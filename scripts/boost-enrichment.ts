#!/usr/bin/env bun
/**
 * Manually drain the unenriched-bills queue to jump-start coverage.
 *   bun run scripts/boost-enrichment.ts [batchCount=10] [perBatch=50]
 *
 * Default: 10 batches × 50 bills = 500 enrichments queued.
 * Congress.gov 5000/hr cap → each enrich = 5 calls → 5000 / 5 = 1000
 * enrichments/hour ceiling. Stay under 800 per ~hour to leave headroom.
 */
import { tasks } from "@trigger.dev/sdk";
import type { enrichBill } from "@hakivo/packet/tasks";
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const batchCount = Number(process.argv[2] ?? "10");
const perBatch = Number(process.argv[3] ?? "50");

const convex = new ConvexHttpClient(url);
let totalQueued = 0;

for (let i = 0; i < batchCount; i++) {
  const candidates = await convex.query(api.bills.listUnenriched, {
    limit: perBatch,
  });
  if (candidates.length === 0) {
    console.log(`Queue drained after ${i} batches.`);
    break;
  }
  const handle = await tasks.batchTrigger<typeof enrichBill>(
    "enrich-bill",
    candidates.map((b) => ({
      payload: {
        congressNumber: b.congressNumber,
        billType: b.billType,
        billNumber: b.billNumber,
        orgId: b.orgId,
      },
    })),
  );
  totalQueued += handle.runCount;
  console.log(
    `Batch ${i + 1}/${batchCount}: ${handle.runCount} queued (batchId=${handle.batchId}). Sleeping 5s.`,
  );
  if (i < batchCount - 1) {
    await new Promise((r) => setTimeout(r, 5_000));
  }
}

console.log(`\nDone. Total queued: ${totalQueued}`);
