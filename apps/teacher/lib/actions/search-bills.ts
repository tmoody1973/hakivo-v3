"use server";

import { api, type Doc } from "@hakivo/db";
import { createGeminiClient } from "@hakivo/ai";
import { fetchAction, fetchQuery } from "convex/nextjs";

export type BillSearchHit = {
  readonly bill: Doc<"bills">;
  readonly score?: number;
};

export type BillSearchResult = {
  readonly hits: readonly BillSearchHit[];
  readonly mode: "keyword" | "semantic";
};

/**
 * Default to semantic for queries with 3+ words (likely topical),
 * keyword for shorter queries (likely a bill ID or specific term).
 */
function inferMode(query: string, override?: "keyword" | "semantic"): "keyword" | "semantic" {
  if (override) return override;
  return query.trim().split(/\s+/).length >= 3 ? "semantic" : "keyword";
}

export async function searchBills(
  query: string,
  options?: {
    mode?: "keyword" | "semantic";
    limit?: number;
    /** "federal" | "state" | a state code like "WI" | undefined (all). */
    jurisdiction?: string;
  },
): Promise<BillSearchResult> {
  const text = query.trim();
  if (!text) return { hits: [], mode: "keyword" };

  const mode = inferMode(text, options?.mode);
  const limit = options?.limit ?? 25;
  const jurisdiction = options?.jurisdiction;

  if (mode === "keyword") {
    const bills = await fetchQuery(api.bills.searchByKeyword, {
      text,
      limit,
      ...(jurisdiction && { jurisdiction }),
    });
    return {
      hits: bills.map((bill) => ({ bill })),
      mode: "keyword",
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not set — semantic search needs Gemini");
  }
  const gemini = createGeminiClient(apiKey);
  const embedding = await gemini.embed(text, "query");

  const hits = await fetchAction(api.bills.searchBySimilarity, {
    queryEmbedding: [...embedding],
    orgId: "hakivo-v3",
    limit: jurisdiction ? limit * 3 : limit,
  });

  const filtered = jurisdiction
    ? hits.filter((h) => {
        if (jurisdiction === "federal") return !h.bill.state;
        if (jurisdiction === "state") return Boolean(h.bill.state);
        return h.bill.state === jurisdiction;
      })
    : hits;

  return {
    hits: filtered.slice(0, limit).map((h) => ({ bill: h.bill, score: h.score })),
    mode: "semantic",
  };
}
