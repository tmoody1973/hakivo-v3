#!/usr/bin/env bun
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const convex = new ConvexHttpClient(url);
const bills = await convex.query(api.bills.listRecent, { limit: 1000 });

let withEmbedding = 0;
let withText = 0;
let withSummary = 0;
const byMonth: Record<string, { total: number; enriched: number }> = {};

for (const b of bills) {
  const month = new Date(b.latestActionDate).toISOString().slice(0, 7);
  byMonth[month] ??= { total: 0, enriched: 0 };
  byMonth[month].total += 1;
  if ((b as any).embedding) {
    withEmbedding += 1;
    byMonth[month].enriched += 1;
  }
  if ((b as any).billText) withText += 1;
  if ((b as any).summary) withSummary += 1;
}

console.log(`Total bills: ${bills.length}`);
console.log(`  with embedding: ${withEmbedding}`);
console.log(`  with billText:  ${withText}`);
console.log(`  with summary:   ${withSummary}`);
console.log("\nEnrichment coverage by month:");
for (const [m, counts] of Object.entries(byMonth).sort()) {
  console.log(`  ${m}: ${counts.enriched}/${counts.total}`);
}
