#!/usr/bin/env bun
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const convex = new ConvexHttpClient(url);
const bills = await convex.query(api.bills.listRecent, { limit: 50 });

const real = bills
  .filter((b) => !b.title.startsWith("Reserved for"))
  .slice(0, 5);

for (const b of real) {
  console.log(
    `${b.congressNumber}-${b.billType}-${b.billNumber}: ${b.title.slice(0, 90)}`,
  );
}
