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

const totalTarget = Number(process.argv[2] ?? "500");
const perBatch = Number(process.argv[3] ?? "50");

const convex = new ConvexHttpClient(url);

// One big query — guarantees uniqueness across batches. Split client-side.
console.log(`Querying ${totalTarget} unenriched bills…`);
const all = await convex.query(api.bills.listUnenriched, {
  limit: totalTarget,
});
console.log(`Got ${all.length} unique unenriched bills.`);

let totalQueued = 0;
for (let i = 0; i < all.length; i += perBatch) {
  const slice = all.slice(i, i + perBatch);
  const handle = await tasks.batchTrigger<typeof enrichBill>(
    "enrich-bill",
    slice.map((b) => ({
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
    `Batch ${Math.floor(i / perBatch) + 1}: ${handle.runCount} queued (batchId=${handle.batchId})`,
  );
  if (i + perBatch < all.length) {
    await new Promise((r) => setTimeout(r, 3_000));
  }
}

console.log(`\nDone. Total unique queued: ${totalQueued}`);
