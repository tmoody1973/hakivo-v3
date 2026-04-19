#!/usr/bin/env bun
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const c = new ConvexHttpClient(url);
const s = await c.query(api.billStats.enrichmentCoverage, {});

console.log(JSON.stringify(s, null, 2));
console.log();
console.log(`Sample of ${s.sampleSize} most-recent bills:`);
console.log(`  enriched:  ${s.sampleEnriched}/${s.sampleSize} (${((s.sampleEnriched / s.sampleSize) * 100).toFixed(1)}%)`);
console.log(`  embedded:  ${s.sampleEmbedded}/${s.sampleSize}`);
console.log(`  full text: ${s.sampleBillText}/${s.sampleSize}`);
console.log(`  summary:   ${s.sampleSummary}/${s.sampleSize}`);
console.log();
console.log(`Extrapolation against 14,995 total bills:`);
console.log(`  estimated enriched:  ~${s.estimatedEnrichedTotal}`);
console.log(`  estimated embedded:  ~${s.estimatedEmbeddedTotal}`);
