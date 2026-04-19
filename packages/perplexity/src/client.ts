/**
 * Thin Perplexity Sonar client for policy-news fetching.
 *
 * Why Perplexity here: Marissa's interview said "the third source is
 * always the hardest" — finding thoughtful, non-partisan analysis on a
 * topic. Sonar does the synthesis + citation work for us in one call,
 * so each interest tag becomes a packet-ready paragraph + 3-5 cite-able
 * source URLs.
 *
 * Cost is ~$0.005/query (sonar). For a personal packet with 5 interest
 * tags = ~$0.025 per packet. Negligible at v1 scale.
 */

const ENDPOINT = "https://api.perplexity.ai/chat/completions";

export type SearchRecency = "hour" | "day" | "week" | "month" | "year";

export type PolicyNewsItem = {
  /** Synthesized 2-4 sentence summary of the latest developments. */
  readonly summary: string;
  /** Citation URLs ordered as [1], [2], [3] in the summary text. */
  readonly citations: ReadonlyArray<string>;
  /** Richer search results: title, url, date, snippet. */
  readonly sources: ReadonlyArray<{
    readonly title: string;
    readonly url: string;
    readonly date?: string;
    readonly snippet?: string;
  }>;
  readonly costUsd: number;
};

export type FetchPolicyNewsArgs = {
  readonly topic: string;
  readonly recency?: SearchRecency;
  readonly maxItems?: number;
};

export type PerplexityClient = {
  readonly fetchPolicyNews: (
    args: FetchPolicyNewsArgs,
  ) => Promise<PolicyNewsItem>;
};

const SYSTEM_PROMPT = `You are a policy news researcher providing concise, neutral summaries for civic-education contexts.

RULES:
- Cite every claim with [1], [2], [3] etc. linking to the citations array.
- Stay factual. No editorializing, no loaded adjectives, no political judgment.
- If a development is contested, present both sides briefly.
- Keep total response to 3-4 sentences max per item, 2-3 items total.`;

export function createPerplexityClient(apiKey: string): PerplexityClient {
  if (!apiKey) throw new Error("PERPLEXITY_API_KEY required");

  return {
    async fetchPolicyNews({ topic, recency = "week", maxItems = 3 }) {
      const userPrompt = `What are the ${maxItems} most important news developments related to "${topic}" from the past ${recency}? Be concise and cite sources.`;

      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "sonar",
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt },
          ],
          return_citations: true,
          search_recency_filter: recency,
        }),
      });

      if (!res.ok) {
        const detail = await res.text().catch(() => "<no body>");
        throw new Error(
          `Perplexity ${res.status} ${res.statusText}: ${detail.slice(0, 500)}`,
        );
      }

      const json = (await res.json()) as {
        readonly choices?: ReadonlyArray<{
          readonly message?: { readonly content?: string };
        }>;
        readonly citations?: ReadonlyArray<string>;
        readonly search_results?: ReadonlyArray<{
          readonly title?: string;
          readonly url?: string;
          readonly date?: string;
          readonly snippet?: string;
        }>;
        readonly usage?: {
          readonly cost?: { readonly total_cost?: number };
        };
      };

      const summary = json.choices?.[0]?.message?.content?.trim() ?? "";
      const citations = json.citations ?? [];
      const sources = (json.search_results ?? [])
        .filter(
          (s): s is { title: string; url: string; date?: string; snippet?: string } =>
            Boolean(s.title) && Boolean(s.url),
        )
        .map((s) => ({
          title: s.title,
          url: s.url,
          ...(s.date !== undefined && { date: s.date }),
          ...(s.snippet !== undefined && { snippet: s.snippet }),
        }));
      const costUsd = json.usage?.cost?.total_cost ?? 0;

      return { summary, citations, sources, costUsd };
    },
  };
}
