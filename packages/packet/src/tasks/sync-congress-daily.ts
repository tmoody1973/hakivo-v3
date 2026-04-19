import { schedules, logger } from "@trigger.dev/sdk";
import { createCongressClient } from "@hakivo/congress";
import { api } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";
import { enrichBill } from "./enrich-bill";

/**
 * Daily bill sync — replaces the older ingest-congress-daily pattern.
 *
 * Pulls bills with `updateDate` in the last 48 hours (double-covers the
 * previous cron window in case of drift), paginates through all, and
 * upserts. Fans out enrichBill only for new inserts or bills whose
 * latestActionDate moved — no-op updates skip enrichment.
 *
 * Cron: 04:00 UTC daily — runs an hour before the 05:00 UTC packet
 * generation window starts for US teachers.
 */

const CONGRESS_NUMBER = 119;
const DEFAULT_ORG_ID = "hakivo-v3";
const PAGE_SIZE = 250;
const WINDOW_MS = 48 * 60 * 60 * 1000;

export const syncCongressDaily = schedules.task({
  id: "sync-congress-daily",
  cron: "0 4 * * *",
  maxDuration: 900,
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeoutInMs: 2_000,
    maxTimeoutInMs: 60_000,
    randomize: true,
  },
  run: async () => {
    const congressApiKey = process.env.CONGRESS_API_KEY;
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!congressApiKey) throw new Error("CONGRESS_API_KEY not set");
    if (!convexUrl) throw new Error("CONVEX_URL not set");

    const congress = createCongressClient(congressApiKey);
    const convex = new ConvexHttpClient(convexUrl);
    const since = new Date(Date.now() - WINDOW_MS)
      .toISOString()
      .replace(/\.\d{3}Z$/, "Z");

    let offset = 0;
    const toEnrich: { congressNumber: number; billType: string; billNumber: number; orgId: string }[] = [];
    let totalFetched = 0;
    let totalInserted = 0;
    let totalUpdated = 0;

    while (true) {
      const bills = await congress.listRecentBills({
        congress: CONGRESS_NUMBER,
        limit: PAGE_SIZE,
        offset,
        fromDateTime: since,
      });
      if (bills.length === 0) break;
      totalFetched += bills.length;

      const records = bills.map((b) => ({
        orgId: DEFAULT_ORG_ID,
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
      totalInserted += result.inserted;
      totalUpdated += result.updated;

      // Enrich anything that was inserted or whose action moved.
      for (const r of records) {
        toEnrich.push({
          congressNumber: r.congressNumber,
          billType: r.billType,
          billNumber: r.billNumber,
          orgId: r.orgId,
        });
      }

      offset += bills.length;
      if (bills.length < PAGE_SIZE) break;
    }

    logger.log(
      `Daily sync: fetched=${totalFetched} inserted=${totalInserted} updated=${totalUpdated} fromDateTime=${since}`,
    );

    if (toEnrich.length > 0) {
      const batch = await enrichBill.batchTrigger(
        toEnrich.map((payload) => ({ payload })),
      );
      logger.log(
        `Fanned out ${batch.runCount} enrichment runs (batchId=${batch.batchId})`,
      );
    }

    return {
      fetched: totalFetched,
      inserted: totalInserted,
      updated: totalUpdated,
      enrichmentRuns: toEnrich.length,
      windowStart: since,
    };
  },
});
