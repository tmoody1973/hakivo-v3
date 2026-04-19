import { logger, task } from "@trigger.dev/sdk";
import {
  createPerplexityClient,
  type PolicyNewsItem,
} from "@hakivo/perplexity";

/**
 * Fetch policy news for a list of interest tags via Perplexity Sonar.
 *
 * Returns one PolicyNewsItem per tag. Used by generate-personal-packet
 * (B3) to feed the brief generator with current-events context per the
 * user's interests.
 *
 * Cost ~$0.005/tag at sonar tier. A typical personal packet with 5
 * interest tags = ~$0.025/packet — basically free at v1 scale.
 */

export type FetchPolicyNewsPayload = {
  /** Interest tags to fetch news for, e.g. ["broadband", "voting rights"] */
  readonly tags: ReadonlyArray<string>;
  /** How far back the search recency window stretches. Default "week". */
  readonly recency?: "hour" | "day" | "week" | "month" | "year";
  /** Items per tag. Default 3. */
  readonly maxItemsPerTag?: number;
};

export type FetchPolicyNewsResult = {
  readonly items: ReadonlyArray<{
    readonly tag: string;
    readonly news: PolicyNewsItem;
  }>;
  readonly totalCostUsd: number;
  readonly durationMs: number;
};

export const fetchPolicyNews = task({
  id: "fetch-policy-news",
  maxDuration: 120,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 3_000,
    maxTimeoutInMs: 30_000,
  },
  run: async (
    payload: FetchPolicyNewsPayload,
  ): Promise<FetchPolicyNewsResult> => {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) throw new Error("PERPLEXITY_API_KEY not set");
    if (payload.tags.length === 0) {
      return { items: [], totalCostUsd: 0, durationMs: 0 };
    }

    const started = Date.now();
    const client = createPerplexityClient(apiKey);
    const recency = payload.recency ?? "week";
    const maxItemsPerTag = payload.maxItemsPerTag ?? 3;

    logger.log(
      `Fetching news for ${payload.tags.length} tags, recency=${recency}`,
    );

    // Sequential to be polite to Perplexity rate limits. Each call is
    // ~1-2s so total time = N * 2s. For 5 tags: ~10s.
    const items: { tag: string; news: PolicyNewsItem }[] = [];
    let totalCost = 0;
    for (const tag of payload.tags) {
      try {
        const news = await client.fetchPolicyNews({
          topic: tag,
          recency,
          maxItems: maxItemsPerTag,
        });
        items.push({ tag, news });
        totalCost += news.costUsd;
        logger.log(
          `  ${tag} → ${news.sources.length} sources, $${news.costUsd.toFixed(4)}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.warn(`fetch failed for "${tag}": ${message}`);
      }
    }

    const durationMs = Date.now() - started;
    logger.log(
      `Done: ${items.length} / ${payload.tags.length} tags, $${totalCost.toFixed(4)} total, ${(durationMs / 1000).toFixed(1)}s`,
    );

    return { items, totalCostUsd: totalCost, durationMs };
  },
});
