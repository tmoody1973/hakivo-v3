#!/usr/bin/env bun
/**
 * Pretty-print a packet from Convex.
 *   bun run scripts/show-packet.ts <packetId>
 */
import { api } from "../packages/db/convex/_generated/api";
import { ConvexHttpClient } from "convex/browser";

const packetId = process.argv[2];
if (!packetId) throw new Error("usage: show-packet.ts <packetId>");

const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
if (!url) throw new Error("CONVEX_URL not set");

const convex = new ConvexHttpClient(url);
const packet = await convex.query(api.packets.getById, {
  id: packetId as never,
});

if (!packet) {
  console.error("No packet found");
  process.exit(1);
}

console.log("═══ HAKIVO PACKET ═════════════════════════════════════════════");
console.log(`Date:      ${packet.packetDate}`);
console.log(`Status:    ${packet.status}`);
console.log(`Standards: ${JSON.stringify(packet.standardsAlignment)}`);
console.log();
console.log("─── TEACHER BRIEF ───────────────────────────────────────────────");
console.log(packet.teacherBrief);
console.log();
console.log("─── DISCUSSION QUESTIONS ────────────────────────────────────────");
packet.discussionQuestions.forEach((q: string, i: number) => {
  console.log(`${i + 1}. ${q}`);
});
console.log();
console.log("─── EXIT TICKET ─────────────────────────────────────────────────");
packet.exitTicket.questions.forEach((q: any, i: number) => {
  console.log(`${i + 1}. [${q.kind}] ${q.prompt}`);
  if (q.choices) q.choices.forEach((c: string, j: number) => console.log(`     ${String.fromCharCode(97 + j)}. ${c}`));
  if (q.answerKey) console.log(`     ✓ ${q.answerKey}`);
});
console.log();
console.log("─── PRIMARY SOURCES ─────────────────────────────────────────────");
packet.primarySources.forEach((s: any) => {
  console.log(`• ${s.label}`);
  console.log(`  ${s.url}`);
  console.log(`  "${s.excerpt.slice(0, 120)}${s.excerpt.length > 120 ? "…" : ""}"`);
});
