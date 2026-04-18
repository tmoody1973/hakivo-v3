#!/usr/bin/env bun
/**
 * Fire enrich-bill for one bill.
 *   bun run scripts/fire-enrich.ts 119 hr 144
 */
import { tasks } from "@trigger.dev/sdk";
import type { enrichBill } from "@hakivo/packet/tasks";

const [cStr, type, numStr] = process.argv.slice(2);
if (!cStr || !type || !numStr) {
  throw new Error("usage: fire-enrich.ts <congress> <billType> <billNumber>");
}

const handle = await tasks.trigger<typeof enrichBill>("enrich-bill", {
  congressNumber: Number(cStr),
  billType: type,
  billNumber: Number(numStr),
});

console.log("Triggered run:", handle.id);
