import { logger, task } from "@trigger.dev/sdk";
import { createCongressClient } from "@hakivo/congress";
import { api } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";

/**
 * One-time backfill of enacted laws from Congress.gov /law/{congress}.
 * Public laws accumulate slowly (~200-400 per 2-year Congress) so one
 * paginated sweep is fast.
 *
 * Each law's `laws[]` attribute links back to the originating bill —
 * stored as `originBillRef` for join-by-string against the bills table.
 */

export type BackfillCongressLawsPayload = {
  readonly congressNumber: number;
  readonly orgId?: string;
};

const DEFAULT_ORG_ID = "hakivo-v3";
const PAGE_SIZE = 250;

function parseLawNumber(raw: string): number {
  // Congress.gov returns law numbers like "119-27" or just "27"
  const parts = raw.split("-");
  const last = parts[parts.length - 1];
  return last ? Number(last) : 0;
}

export const backfillCongressLaws = task({
  id: "backfill-congress-laws",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
    randomize: true,
  },
  run: async (payload: BackfillCongressLawsPayload) => {
    const congressApiKey = process.env.CONGRESS_API_KEY;
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!congressApiKey) throw new Error("CONGRESS_API_KEY not set");
    if (!convexUrl) throw new Error("CONVEX_URL not set");

    const orgId = payload.orgId ?? DEFAULT_ORG_ID;
    const congress = createCongressClient(congressApiKey);
    const convex = new ConvexHttpClient(convexUrl);

    let offset = 0;
    let totalFetched = 0;
    let totalInserted = 0;
    let totalUpdated = 0;

    while (true) {
      const laws = await congress.listLaws({
        congress: payload.congressNumber,
        limit: PAGE_SIZE,
        offset,
      });
      if (laws.length === 0) break;
      totalFetched += laws.length;

      const records = laws.map((l) => {
        // The /law endpoint returns bill records; the `laws` array on each
        // shows the law number. Use "type" on the law item if present.
        const lawType: "pub" | "priv" =
          l.type === "private" ? "priv" : "pub";
        const lawNumber = parseLawNumber(l.number);
        return {
          orgId,
          congressNumber: Number(l.congress),
          lawType,
          lawNumber,
          title: l.title,
          signedDate: l.updateDate,
          topics: [] as string[],
        };
      });

      const result = await convex.mutation(api.laws.upsertBatch, {
        laws: records,
      });
      totalInserted += result.inserted;
      totalUpdated += result.updated;

      logger.log(
        `Law backfill progress: ${totalFetched} fetched, ${totalInserted} inserted, ${totalUpdated} updated`,
      );

      offset += laws.length;
      if (laws.length < PAGE_SIZE) break;
    }

    return {
      congressNumber: payload.congressNumber,
      fetched: totalFetched,
      inserted: totalInserted,
      updated: totalUpdated,
    };
  },
});
