import { schedules, logger } from "@trigger.dev/sdk";
import { api } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";
import { enrichBill } from "./enrich-bill";

/**
 * Background enrichment drain. Runs every hour, picks 50 oldest
 * unenriched non-ceremonial bills, fires enrichBill.batchTrigger.
 *
 * Given a fresh 15K bill backfill, this catches up in ~12 days at
 * 50/hour. Pauses automatically when the unenriched queue empties.
 */

const BATCH_SIZE = 50;

export const enrichBillsBackground = schedules.task({
  id: "enrich-bills-background",
  cron: "0 * * * *",
  maxDuration: 120,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
    randomize: true,
  },
  run: async () => {
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) throw new Error("CONVEX_URL not set");
    const convex = new ConvexHttpClient(convexUrl);

    const unenriched = await convex.query(api.bills.listUnenriched, {
      limit: BATCH_SIZE,
    });
    if (unenriched.length === 0) {
      logger.log("No unenriched bills — queue drained");
      return { enriched: 0, remaining: 0 };
    }

    const batch = await enrichBill.batchTrigger(
      unenriched.map((b) => ({
        payload: {
          congressNumber: b.congressNumber,
          billType: b.billType,
          billNumber: b.billNumber,
          orgId: b.orgId,
        },
      })),
    );

    logger.log(
      `Fanned out ${batch.runCount} enrichment runs (batchId=${batch.batchId})`,
    );

    return {
      enriched: unenriched.length,
      batchId: batch.batchId,
    };
  },
});
