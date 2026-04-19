import { logger, task } from "@trigger.dev/sdk";
import { createCongressClient, type BillType } from "@hakivo/congress";
import { api } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";

/**
 * One-time backfill: paginate every bill type in a given Congress and
 * upsert them into Convex with no enrichment.
 *
 * Run manually (not scheduled). After it finishes, enrichBillsBackground
 * drains the unenriched queue over ~1-2 days on a 50-per-hour pace.
 *
 * Why not enrich inline: 15K bills × 5 Congress.gov calls + Gemini embed
 * each = 15-20 hours of throughput-limited work. Splitting backfill from
 * enrichment lets the corpus be searchable fast while deep context
 * arrives over time.
 */

export type BackfillCongressBillsPayload = {
  readonly congressNumber: number;
  readonly orgId?: string;
  readonly billTypes?: readonly BillType[];
};

const ALL_TYPES: readonly BillType[] = [
  "hr",
  "s",
  "hjres",
  "sjres",
  "hconres",
  "sconres",
  "hres",
  "sres",
];
const PAGE_SIZE = 250;
const DEFAULT_ORG_ID = "hakivo-v3";

export const backfillCongressBills = task({
  id: "backfill-congress-bills",
  maxDuration: 3_600,
  retry: {
    maxAttempts: 2,
    factor: 2,
    minTimeoutInMs: 10_000,
    maxTimeoutInMs: 120_000,
    randomize: true,
  },
  run: async (payload: BackfillCongressBillsPayload) => {
    const congressApiKey = process.env.CONGRESS_API_KEY;
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!congressApiKey) throw new Error("CONGRESS_API_KEY not set");
    if (!convexUrl) throw new Error("CONVEX_URL not set");

    const orgId = payload.orgId ?? DEFAULT_ORG_ID;
    const types = payload.billTypes ?? ALL_TYPES;
    const congress = createCongressClient(congressApiKey);
    const convex = new ConvexHttpClient(convexUrl);

    let totalFetched = 0;
    let totalInserted = 0;
    let totalUpdated = 0;

    // Paginate the whole congress at once via /bill/{congress} sorted by
    // updateDate. Cap at ~20 pages × 250 = 5000 bills per type? Actually
    // just use the unified endpoint which returns all types in one list.
    let offset = 0;
    while (true) {
      const bills = await congress.listRecentBills({
        congress: payload.congressNumber,
        limit: PAGE_SIZE,
        offset,
      });
      if (bills.length === 0) break;

      const records = bills.map((b) => ({
        orgId,
        congressNumber: Number(b.congress),
        billType: b.type.toLowerCase(),
        billNumber: Number(b.number),
        title: b.title,
        introducedDate: b.introducedDate
          ? Date.parse(b.introducedDate)
          : Date.now(),
        latestAction: b.latestAction?.text ?? "",
        latestActionDate: b.latestAction?.actionDate
          ? Date.parse(b.latestAction.actionDate)
          : Date.now(),
        topics: [] as string[],
      }));

      const result = await convex.mutation(api.bills.upsertBatch, {
        bills: records,
      });
      totalFetched += bills.length;
      totalInserted += result.inserted;
      totalUpdated += result.updated;
      offset += bills.length;

      logger.log(
        `Backfill progress: ${totalFetched} fetched, ${totalInserted} inserted, ${totalUpdated} updated`,
      );

      if (bills.length < PAGE_SIZE) break;
    }

    return {
      congressNumber: payload.congressNumber,
      types: [...types],
      fetched: totalFetched,
      inserted: totalInserted,
      updated: totalUpdated,
    };
  },
});
