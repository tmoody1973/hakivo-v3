/**
 * GraphRAG traversal layer.
 *
 * Pure Convex queries over the existing tables. No graph database,
 * no external dep — just typed traversal that the packet generator
 * (or a future MCP server) can call to assemble a packet context.
 *
 * Design principle: each function is independently testable, composes
 * over the others, and returns data the LLM can cite verbatim.
 */

import { v } from "convex/values";
import { query, action } from "./_generated/server";
import { api } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";

/* ---------- party balance ---------- */

type PartyBreakdown = {
  D: number;
  R: number;
  I: number;
  other: number;
  total: number;
  isBipartisan: boolean;
};

function tallyParties(
  cosponsors: readonly Pick<Doc<"billCosponsors">, "party">[],
): PartyBreakdown {
  const b = { D: 0, R: 0, I: 0, other: 0, total: cosponsors.length };
  for (const c of cosponsors) {
    if (c.party === "D") b.D += 1;
    else if (c.party === "R") b.R += 1;
    else if (c.party === "I") b.I += 1;
    else b.other += 1;
  }
  return { ...b, isBipartisan: b.D > 0 && b.R > 0 };
}

export const partyBalanceForBill = query({
  args: { billRef: v.string() },
  handler: async (ctx, { billRef }) => {
    const cosponsors = await ctx.db
      .query("billCosponsors")
      .withIndex("by_bill", (q) => q.eq("billRef", billRef))
      .collect();
    return tallyParties(cosponsors);
  },
});

/* ---------- cosponsors with legislator join ---------- */

export const cosponsorsForBillWithLegislators = query({
  args: { billRef: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { billRef, limit }) => {
    const cosponsors = await ctx.db
      .query("billCosponsors")
      .withIndex("by_bill", (q) => q.eq("billRef", billRef))
      .collect();
    const cap = limit ?? 25;
    const enriched = await Promise.all(
      cosponsors.slice(0, cap).map(async (c) => {
        const leg = await ctx.db
          .query("legislators")
          .withIndex("by_bioguideId", (q) =>
            q.eq("bioguideId", c.bioguideId),
          )
          .first();
        return {
          bioguideId: c.bioguideId,
          party: c.party,
          state: c.state,
          sponsorshipDate: c.sponsorshipDate,
          isOriginalCosponsor: c.isOriginalCosponsor,
          isWithdrawn: c.isWithdrawn,
          name: leg?.fullName ?? null,
          photoUrl: leg?.photoUrl ?? null,
          chamber: leg?.chamber ?? null,
          officialUrl: leg?.officialUrl ?? null,
        };
      }),
    );
    return enriched;
  },
});

/* ---------- state-delegation involvement ---------- */

export const stateDelegationForBill = query({
  args: { billRef: v.string(), state: v.string() },
  handler: async (ctx, { billRef, state }) => {
    const cosponsors = await ctx.db
      .query("billCosponsors")
      .withIndex("by_bill", (q) => q.eq("billRef", billRef))
      .collect();
    const inState = cosponsors.filter((c) => c.state === state);
    return {
      state,
      cosponsorCount: inState.length,
      members: inState.map((c) => ({
        bioguideId: c.bioguideId,
        party: c.party,
        sponsorshipDate: c.sponsorshipDate,
      })),
    };
  },
});

/* ---------- recent actions ---------- */

export const actionsForBill = query({
  args: { billRef: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { billRef, limit }) => {
    return await ctx.db
      .query("billActions")
      .withIndex("by_bill_date", (q) => q.eq("billRef", billRef))
      .order("desc")
      .take(limit ?? 10);
  },
});

/* ---------- subjects ---------- */

export const subjectsForBill = query({
  args: { billRef: v.string() },
  handler: async (ctx, { billRef }) => {
    return await ctx.db
      .query("billSubjects")
      .withIndex("by_bill", (q) => q.eq("billRef", billRef))
      .collect();
  },
});

/* ---------- sponsored bills per member ---------- */

export const billsSponsoredByMember = query({
  args: {
    bioguideId: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { bioguideId, limit }) => {
    const sponsorships = await ctx.db
      .query("billCosponsors")
      .withIndex("by_member", (q) => q.eq("bioguideId", bioguideId))
      .collect();
    const isOriginal = sponsorships.filter((s) => s.isOriginalCosponsor);
    const cap = limit ?? 20;
    return isOriginal.slice(0, cap).map((s) => ({
      billRef: s.billRef,
      sponsorshipDate: s.sponsorshipDate,
    }));
  },
});

/* ---------- packet context orchestrator ---------- */

type PacketContextBill = {
  readonly billRef: string;
  readonly congressNumber: number;
  readonly billType: string;
  readonly billNumber: number;
  readonly title: string;
  readonly summary: string | null;
  readonly latestAction: string;
  readonly latestActionDate: number;
  readonly topics: readonly string[];
  readonly partyBalance: PartyBreakdown;
  readonly stateDelegation: {
    readonly state: string;
    readonly cosponsorCount: number;
  } | null;
  readonly recentActions: readonly {
    readonly actionDate: number;
    readonly actionText: string;
    readonly actionType: string;
  }[];
  readonly subjects: readonly string[];
  readonly policyArea: string | null;
  readonly relevanceScore: number;
};

export type PacketContext = {
  readonly teacherName: string;
  readonly teacherState: string | undefined;
  readonly teacherCourses: readonly string[];
  readonly teacherCurrentUnit: string | null;
  readonly teacherTargetReadingLevel: string | undefined;
  readonly bills: readonly PacketContextBill[];
  readonly generatedAt: number;
};

export const buildPacketContext = action({
  args: {
    teacherId: v.id("teachers"),
    queryEmbedding: v.array(v.float64()),
    maxBills: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<PacketContext> => {
    const teacher = await ctx.runQuery(api.teachers.getById, {
      id: args.teacherId,
    });
    if (!teacher) throw new Error(`Teacher ${args.teacherId} not found`);

    const finalCount = args.maxBills ?? 6;
    // Hybrid retrieval — 2026 RAG canonical pattern:
    //   retrieve wide via vector (recall) → re-rank with recency decay → top-K
    // Convex vectorIndex filterFields only support equality, so recency
    // lives in the re-rank stage rather than the retrieval filter.
    const wideLimit = Math.max(24, finalCount * 4);
    const vectorResults = await ctx.vectorSearch("bills", "by_embedding", {
      vector: args.queryEmbedding,
      limit: wideLimit,
      filter: (q) => q.eq("orgId", teacher.orgId),
    });
    const retrieved = (
      await Promise.all(
        vectorResults.map(async (r) => {
          const bill = await ctx.runQuery(api.bills.getById, { id: r._id });
          return bill ? { bill, score: r._score } : null;
        }),
      )
    ).filter((b): b is NonNullable<typeof b> => b !== null);

    // Re-rank: final = vector_score × exp(-age_days / 30).
    // 30-day half-life matches civic-tech intuition — a bill with action
    // today is worth ~2x a bill untouched for 30 days, ~7x vs 90 days.
    const now = Date.now();
    const DAY_MS = 86_400_000;
    const DECAY_DAYS = 30;
    const bills = retrieved
      .map((r) => {
        const ageDays = Math.max(0, (now - r.bill.latestActionDate) / DAY_MS);
        const recencyFactor = Math.exp(-ageDays / DECAY_DAYS);
        return { bill: r.bill, score: r.score * recencyFactor };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, finalCount);

    const enriched: PacketContextBill[] = await Promise.all(
      bills.map(async ({ bill, score }) => {
        const billRef = `${bill.congressNumber}-${bill.billType}-${bill.billNumber}`;
        const [partyBalance, stateDelegation, recentActions, subjectRows] =
          await Promise.all([
            ctx.runQuery(api.graph.partyBalanceForBill, { billRef }),
            teacher.state
              ? ctx.runQuery(api.graph.stateDelegationForBill, {
                  billRef,
                  state: teacher.state,
                })
              : Promise.resolve(null),
            ctx.runQuery(api.graph.actionsForBill, { billRef, limit: 10 }),
            ctx.runQuery(api.graph.subjectsForBill, { billRef }),
          ]);
        const subjects = subjectRows
          .filter((s) => !s.isPolicyArea)
          .map((s) => s.subject);
        const policyArea =
          subjectRows.find((s) => s.isPolicyArea)?.subject ?? null;
        return {
          billRef,
          congressNumber: bill.congressNumber,
          billType: bill.billType,
          billNumber: bill.billNumber,
          title: bill.title,
          summary: bill.summary ?? null,
          latestAction: bill.latestAction,
          latestActionDate: bill.latestActionDate,
          topics: bill.topics,
          partyBalance,
          stateDelegation: stateDelegation
            ? {
                state: stateDelegation.state,
                cosponsorCount: stateDelegation.cosponsorCount,
              }
            : null,
          recentActions: recentActions.map((a) => ({
            actionDate: a.actionDate,
            actionText: a.actionText,
            actionType: a.actionType,
          })),
          subjects,
          policyArea,
          relevanceScore: score,
        };
      }),
    );

    return {
      teacherName: teacher.name,
      teacherState: teacher.state,
      teacherCourses: teacher.courses,
      teacherCurrentUnit: teacher.currentUnit,
      teacherTargetReadingLevel: teacher.targetReadingLevel,
      bills: enriched,
      generatedAt: Date.now(),
    };
  },
});
