#!/usr/bin/env bun
import { createCongressClient } from "../packages/congress/src";

const key = process.env.CONGRESS_API_KEY;
if (!key) throw new Error("CONGRESS_API_KEY not set");

const c = createCongressClient(key);
const bills = await c.listRecentBills({ congress: 119, limit: 3 });
for (const b of bills) {
  console.log(`${b.type}${b.number} · latestAction=${b.latestAction?.actionDate ?? "?"} · ${b.title.slice(0, 60)}`);
}
