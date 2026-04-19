#!/usr/bin/env bun
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const c = new ConvexHttpClient(url);
const s = await c.query(api.billStats.enrichmentCoverage, {});
console.log(JSON.stringify(s, null, 2));
console.log();
console.log(`Enrichment: ${s.withEmbedding}/${s.total} embedded (${((s.withEmbedding / s.total) * 100).toFixed(1)}%)`);
console.log(`Full text:  ${s.withBillText}/${s.total} have text (${((s.withBillText / s.total) * 100).toFixed(1)}%)`);
console.log(`CRS summary: ${s.withSummary}/${s.total} (${((s.withSummary / s.total) * 100).toFixed(1)}%)`);
console.log(`Ceremonial (skipped): ~${s.ceremonial}`);
