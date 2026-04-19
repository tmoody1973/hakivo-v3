import { schedules, logger } from "@trigger.dev/sdk";
import { createCongressClient } from "@hakivo/congress";
import { api } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";

/**
 * Daily sync for newly-enacted laws. Runs at 05:00 UTC, an hour after
 * sync-congress-daily, so law upserts can reference the bills that
 * just got ingested.
 *
 * Tiny volume — Congress enacts a handful of public laws per month.
 * A single page is enough on any given day.
 */

const CONGRESS_NUMBER = 119;
const DEFAULT_ORG_ID = "hakivo-v3";
const WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function parseLawNumber(raw: string): number {
  const parts = raw.split("-");
  const last = parts[parts.length - 1];
  return last ? Number(last) : 0;
}

export const syncLawsDaily = schedules.task({
  id: "sync-laws-daily",
  cron: "0 5 * * *",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
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

    const laws = await congress.listLaws({
      congress: CONGRESS_NUMBER,
      limit: 250,
      fromDateTime: since,
    });

    if (laws.length === 0) {
      logger.log(`No law updates since ${since}`);
      return { fetched: 0, inserted: 0, updated: 0 };
    }

    const records = laws.map((l) => {
      const lawType: "pub" | "priv" = l.type === "private" ? "priv" : "pub";
      const lawNumber = parseLawNumber(l.number);
      return {
        orgId: DEFAULT_ORG_ID,
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
    logger.log(
      `Daily law sync: fetched=${laws.length} inserted=${result.inserted} updated=${result.updated} since=${since}`,
    );

    return { fetched: laws.length, ...result, windowStart: since };
  },
});
