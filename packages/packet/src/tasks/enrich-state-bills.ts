import { logger, task } from "@trigger.dev/sdk";
import { createGeminiClient } from "@hakivo/ai";
import { api } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";

/**
 * Generate Gemini embeddings for state bills so they show up in
 * semantic search alongside federal bills.
 *
 * Lighter than enrich-bill (federal): no external fetches, no child
 * table writes, just an embedding from the data we already have on the
 * bill row (title + summary + topics + latest action). State legislature
 * APIs vary wildly per state — keeping the enrichment path API-free
 * means we can plug in any new state without writing an integration.
 *
 * Runs in batches; ~200 WI bills enrich in 2-3 minutes (rate-limited
 * to ~5 req/sec on Gemini Embedding-001 free tier).
 */

const DEFAULT_ORG_ID = "hakivo-v3";
const BATCH_SIZE = 5;

export type EnrichStateBillsPayload = {
  /** State code, e.g., "WI". */
  readonly state: string;
  /** Hard cap on bills per run. Default 200. */
  readonly maxBills?: number;
};

export type EnrichStateBillsResult = {
  readonly state: string;
  readonly enriched: number;
  readonly failed: number;
  readonly remaining: number;
  readonly durationMs: number;
};

export const enrichStateBills = task({
  id: "enrich-state-bills",
  maxDuration: 900, // 15 min
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (
    payload: EnrichStateBillsPayload,
  ): Promise<EnrichStateBillsResult> => {
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!convexUrl) throw new Error("CONVEX_URL not set");
    if (!geminiApiKey) throw new Error("GEMINI_API_KEY not set");

    const started = Date.now();
    const convex = new ConvexHttpClient(convexUrl);
    const gemini = createGeminiClient(geminiApiKey);

    const maxBills = payload.maxBills ?? 200;
    const state = payload.state.toUpperCase();

    const bills = await convex.query(api.bills.listStateUnembedded, {
      state,
      limit: maxBills,
    });

    logger.log(
      `Enriching ${bills.length} ${state} bills (cap ${maxBills})`,
    );

    let enriched = 0;
    let failed = 0;

    for (let i = 0; i < bills.length; i += BATCH_SIZE) {
      const batch = bills.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (bill) => {
          const embeddingText = buildEmbeddingText(bill);
          try {
            const embedding = await gemini.embed(embeddingText, "document");
            await convex.mutation(api.bills.enrichOne, {
              congressNumber: bill.congressNumber,
              billType: bill.billType,
              billNumber: bill.billNumber,
              embedding: [...embedding],
            });
            enriched += 1;
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.warn(`enrich failed for ${bill.billType} ${bill.billNumber}: ${message}`);
            failed += 1;
          }
        }),
      );
      if ((i + BATCH_SIZE) % 25 === 0 || i + BATCH_SIZE >= bills.length) {
        logger.log(
          `Progress: ${Math.min(i + BATCH_SIZE, bills.length)} / ${bills.length}`,
        );
      }
    }

    const durationMs = Date.now() - started;
    logger.log(
      `Done: ${enriched} enriched, ${failed} failed in ${(durationMs / 1000).toFixed(1)}s`,
    );

    return {
      state,
      enriched,
      failed,
      remaining: bills.length - enriched - failed,
      durationMs,
    };
  },
});

/**
 * Build the text that gets embedded. Title is most signal-rich. Topics
 * give policy-area grounding. Summary fills in when present (often
 * sparse for state bills). Latest action gives a recency anchor.
 */
function buildEmbeddingText(bill: {
  readonly title: string;
  readonly summary?: string;
  readonly topics: ReadonlyArray<string>;
  readonly latestAction: string;
  readonly state?: string;
}): string {
  const parts = [
    `State bill (${bill.state ?? "US"}): ${bill.title}`,
    bill.topics.length > 0
      ? `Subject areas: ${bill.topics.join(", ")}`
      : "",
    bill.summary ? `Summary: ${bill.summary}` : "",
    `Latest legislative action: ${bill.latestAction}`,
  ];
  return parts.filter(Boolean).join("\n\n");
}
