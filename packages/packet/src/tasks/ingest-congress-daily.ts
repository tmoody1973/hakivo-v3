import { schedules, logger } from "@trigger.dev/sdk";
import { createCongressClient } from "@hakivo/congress";
import { api } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";

/**
 * Daily Congress.gov ingest — runs at 04:30 UTC (just before the 5am-local
 * packet send window starts for US teachers). Pulls recent bills from the
 * current Congress, normalizes them, and upserts into Convex.
 *
 * Week-1 scope: bills only. Votes, committee actions, and floor speeches
 * arrive in week 2 once the packet generator actually consumes them.
 *
 * Auth boundary: this task writes directly to Convex via ConvexHttpClient
 * without a user JWT. Trust is proximity-based (our deploy, our Convex
 * deployment). Week 2 replaces this with a Convex httpAction + bearer
 * token guard so the ingest endpoint is auditable.
 */

const CONGRESS_NUMBER = 119;
const DEFAULT_ORG_ID = "hakivo-v3";

export const ingestCongressDaily = schedules.task({
  id: "ingest-congress-daily",
  cron: "30 4 * * *",
  maxDuration: 600,
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 60_000,
    randomize: true,
  },
  run: async () => {
    const congressApiKey = process.env.CONGRESS_API_KEY;
    const convexUrl = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!congressApiKey) throw new Error("CONGRESS_API_KEY not set");
    if (!convexUrl) throw new Error("CONVEX_URL not set");

    const congress = createCongressClient(congressApiKey);
    const convex = new ConvexHttpClient(convexUrl);

    const bills = await congress.listRecentBills({
      congress: CONGRESS_NUMBER,
      limit: 50,
    });
    logger.log(`Fetched ${bills.length} bills from Congress ${CONGRESS_NUMBER}`);

    const records = bills.map((b) => {
      const introduced = b.introducedDate
        ? Date.parse(b.introducedDate)
        : Date.now();
      const latest = b.latestAction?.actionDate
        ? Date.parse(b.latestAction.actionDate)
        : introduced;
      return {
        orgId: DEFAULT_ORG_ID,
        congressNumber: Number(b.congress),
        billType: b.type.toLowerCase(),
        billNumber: Number(b.number),
        title: b.title,
        introducedDate: introduced,
        latestAction: b.latestAction?.text ?? "",
        latestActionDate: latest,
        topics: [] as string[],
      };
    });

    const result = await convex.mutation(api.bills.upsertBatch, {
      bills: records,
    });

    logger.log("Upsert complete", result);
    return { fetched: bills.length, ...result };
  },
});
