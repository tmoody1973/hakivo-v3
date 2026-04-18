#!/usr/bin/env bun
import { query } from "../packages/db/convex/_generated/server";
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const convex = new ConvexHttpClient(url);
const bills = await convex.query(api.bills.listRecent, { limit: 1000 });

console.log(`Total bills in DB: ${bills.length}`);

const buckets: Record<string, number> = {};
for (const b of bills) {
  const month = new Date(b.latestActionDate).toISOString().slice(0, 7);
  buckets[month] = (buckets[month] ?? 0) + 1;
}
console.log("\nBy month:");
for (const [month, count] of Object.entries(buckets).sort()) {
  console.log(`  ${month}: ${count}`);
}
