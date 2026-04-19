import { logger, task } from "@trigger.dev/sdk";
import { api } from "@hakivo/db";
import {
  billIdentifierToRef,
  createOpenStatesClient,
  type OpenStatesBill,
} from "@hakivo/openstates";
import { ConvexHttpClient } from "convex/browser";

/**
 * Backfill state bills from OpenStates into the shared `bills` table.
 *
 * Default scope: Wisconsin, current session, bills with action in the
 * last 60 days (~few hundred bills, runs in 1-3 min vs hours for the
 * full 12k-bill session backfill). Can be re-fired with different
 * args to widen scope.
 *
 * Mirrors the federal backfill-congress-bills shape so the rest of
 * the pipeline (enrichment, retrieval, packet generation) treats state
 * bills the same way as federal once they're in the table.
 */

export type BackfillStateBillsPayload = {
  /** State code, e.g., "wi". */
  readonly state: string;
  /** Session string, e.g., "2025". */
  readonly session: string;
  /** Days back to filter bills with recent action. Default 60. */
  readonly daysBack?: number;
  /** Hard cap on bills per run (safety valve). Default 500. */
  readonly maxBills?: number;
};

export type BackfillStateBillsResult = {
  readonly state: string;
  readonly session: string;
  readonly streamed: number;
  readonly upserted: number;
  readonly skipped: number;
  readonly durationMs: number;
};

export const backfillStateBills = task({
  id: "backfill-state-bills",
  maxDuration: 1800, // 30 min
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (
    payload: BackfillStateBillsPayload,
  ): Promise<BackfillStateBillsResult> => {
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    const apiKey = process.env.OPENSTATES_API_KEY;
    if (!convexUrl) throw new Error("CONVEX_URL not set");
    if (!apiKey) throw new Error("OPENSTATES_API_KEY not set");

    const started = Date.now();
    const convex = new ConvexHttpClient(convexUrl);
    const client = createOpenStatesClient(apiKey);

    const daysBack = payload.daysBack ?? 60;
    const maxBills = payload.maxBills ?? 500;
    const updatedSince = new Date(Date.now() - daysBack * 86_400_000);
    const sessionStartYear = parseInt(payload.session.split("-")[0]!, 10);
    const stateUpper = payload.state.toUpperCase();
    const jurisdiction = `us-${payload.state.toLowerCase()}`;

    let streamed = 0;
    let upserted = 0;
    let skipped = 0;

    logger.log(
      `Backfilling ${stateUpper} bills (session ${payload.session}), ` +
        `updated since ${updatedSince.toISOString().slice(0, 10)}, ` +
        `cap ${maxBills}`,
    );

    for await (const raw of client.streamBills({
      jurisdiction: payload.state,
      session: payload.session,
      updatedSince,
    })) {
      streamed += 1;
      if (streamed % 25 === 0) {
        logger.log(
          `Progress: streamed=${streamed}, upserted=${upserted}, skipped=${skipped}`,
        );
      }
      if (upserted >= maxBills) {
        logger.warn(`Hit maxBills cap (${maxBills}), stopping`);
        break;
      }

      const ref = billIdentifierToRef({
        state: payload.state.toLowerCase(),
        session: payload.session,
        identifier: raw.identifier,
      });
      if (!ref) {
        logger.warn(`Could not parse identifier "${raw.identifier}" — skip`);
        skipped += 1;
        continue;
      }

      try {
        await convex.mutation(api.bills.upsertStateBill, {
          orgId: "hakivo-v3",
          jurisdiction,
          state: stateUpper,
          openStatesId: raw.id,
          session: payload.session,
          congressNumber: sessionStartYear,
          billType: ref.billType,
          billNumber: ref.billNumber,
          title: raw.title,
          introducedDate: raw.first_action_date
            ? Date.parse(raw.first_action_date)
            : Date.now(),
          latestAction: raw.latest_action_description ?? "Introduced",
          latestActionDate: raw.latest_action_date
            ? Date.parse(raw.latest_action_date)
            : Date.now(),
          topics: pickTopics(raw),
          ...(raw.abstracts[0]?.abstract && {
            summary: raw.abstracts[0].abstract,
          }),
        });
        upserted += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Upsert failed for ${raw.identifier}: ${message}`);
        skipped += 1;
      }
    }

    const durationMs = Date.now() - started;
    logger.log(
      `Done: streamed=${streamed}, upserted=${upserted}, skipped=${skipped}, ${(durationMs / 1000).toFixed(1)}s`,
    );

    return {
      state: stateUpper,
      session: payload.session,
      streamed,
      upserted,
      skipped,
      durationMs,
    };
  },
});

/**
 * Heuristic topic extraction. OpenStates' `subject` field is sparse for
 * many bills, so we fall back to status keywords from `extras.status`
 * (e.g., "Status: A - Colleges and Universities") which often holds
 * the committee referral that's the best topic signal we have.
 */
function pickTopics(bill: OpenStatesBill): string[] {
  const subjects = bill.subject.filter(Boolean);
  if (subjects.length > 0) return subjects.slice(0, 5);
  const statusExtra =
    typeof bill.extras?.status === "string" ? bill.extras.status : "";
  const match = statusExtra.match(/Status:\s*[A-Z]?\s*-\s*(.+)$/);
  if (match?.[1]) return [match[1].trim()];
  return [];
}
