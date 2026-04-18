#!/usr/bin/env bun
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const convex = new ConvexHttpClient(url);
const bills = await convex.query(api.bills.listRecent, { limit: 50 });

const sorted = [...bills].sort((a, b) => b.latestActionDate - a.latestActionDate);

console.log("Newest 5:");
for (const b of sorted.slice(0, 5)) {
  const d = new Date(b.latestActionDate).toISOString().slice(0, 10);
  console.log(`  ${d} · ${b.billType.toUpperCase()}${b.billNumber} · ${b.title.slice(0, 80)}`);
}
console.log("\nOldest 5:");
for (const b of sorted.slice(-5)) {
  const d = new Date(b.latestActionDate).toISOString().slice(0, 10);
  console.log(`  ${d} · ${b.billType.toUpperCase()}${b.billNumber} · ${b.title.slice(0, 80)}`);
}
