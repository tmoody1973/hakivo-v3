#!/usr/bin/env bun
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const convex = new ConvexHttpClient(url);
const teachers = await convex.query(api.diagnostics.listAllTeachers, {});

console.log(`Total teachers: ${teachers.length}\n`);
for (const t of teachers) {
  console.log(`  ${t.name.padEnd(25)} · ${t.clerkUserId.slice(0, 40).padEnd(40)} · ${t.state ?? "—"} · unit=${t.currentUnit ?? "—"}`);
  console.log(`  id: ${t._id}`);
  console.log();
}
