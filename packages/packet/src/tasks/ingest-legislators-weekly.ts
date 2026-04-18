import { schedules, logger } from "@trigger.dev/sdk";
import { fetchCurrentLegislators } from "@hakivo/congress";
import { api } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";

/**
 * Weekly legislator roster ingest — Sundays at 03:00 UTC.
 *
 * Source: unitedstates/congress-legislators on GitHub. ~535 records per run
 * (535 members of Congress: 435 House + 100 Senate, give or take vacancies).
 * No API key, no rate limit — just a YAML file fetch.
 *
 * Upsert is keyed on bioguideId, so re-runs are idempotent even if the
 * roster hasn't changed. Members who leave office remain in the table with
 * their termEnd in the past; queries filter by termEnd when they care.
 */

const DEFAULT_ORG_ID = "hakivo-v3";
const BATCH_SIZE = 100;

export const ingestLegislatorsWeekly = schedules.task({
  id: "ingest-legislators-weekly",
  cron: "0 3 * * 0",
  maxDuration: 300,
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

    const legislators = await fetchCurrentLegislators();
    logger.log(`Fetched ${legislators.length} legislators from GitHub`);

    const records = legislators.map((l) => ({
      orgId: DEFAULT_ORG_ID,
      bioguideId: l.bioguideId,
      firstName: l.firstName,
      lastName: l.lastName,
      fullName: l.fullName,
      state: l.state,
      chamber: l.chamber,
      district: l.district,
      party: l.party,
      termStart: l.termStart,
      termEnd: l.termEnd,
      photoUrl: l.photoUrl,
      ...(l.officialUrl !== undefined && { officialUrl: l.officialUrl }),
      ...(l.phone !== undefined && { phone: l.phone }),
      ...(l.office !== undefined && { office: l.office }),
      ...(l.wikipediaSlug !== undefined && { wikipediaSlug: l.wikipediaSlug }),
      ...(l.twitter !== undefined && { twitter: l.twitter }),
      ...(l.youtube !== undefined && { youtube: l.youtube }),
      ...(l.facebook !== undefined && { facebook: l.facebook }),
      ...(l.instagram !== undefined && { instagram: l.instagram }),
    }));

    const convex = new ConvexHttpClient(convexUrl);

    let totalInserted = 0;
    let totalUpdated = 0;
    for (let i = 0; i < records.length; i += BATCH_SIZE) {
      const batch = records.slice(i, i + BATCH_SIZE);
      const result = await convex.mutation(api.legislators.upsertBatch, {
        legislators: batch,
      });
      totalInserted += result.inserted;
      totalUpdated += result.updated;
    }

    logger.log("Upsert complete", {
      fetched: records.length,
      inserted: totalInserted,
      updated: totalUpdated,
    });
    return { fetched: records.length, inserted: totalInserted, updated: totalUpdated };
  },
});
