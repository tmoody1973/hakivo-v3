#!/usr/bin/env bun
/**
 * Read the 5 most-recent bills from Convex. Proves the ingest actually
 * wrote to the DB (not just that the mutation reported success).
 */
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const convex = new ConvexHttpClient(url);
const bills = await convex.query(api.bills.listRecent, { limit: 5 });

for (const b of bills) {
  console.log(
    `${b.billType.toUpperCase()}${b.billNumber} (Congress ${b.congressNumber}): ${b.title.slice(0, 80)}`,
  );
  console.log(`  latest: ${b.latestAction.slice(0, 100)}`);
}
