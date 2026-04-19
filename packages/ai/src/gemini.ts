/**
 * Gemini client wrapper for Hakivo v3.0.
 *
 * Used for two things in week-2:
 *   1. Embeddings — gemini-embedding-001 at 768 dims (matches Convex vector
 *      index on bills.embedding)
 *   2. Structured text generation — gemini-2.5-pro for packet briefs with
 *      FACTS_ONLY_SYSTEM_PROMPT (see ./prompts/facts-only.ts)
 *
 * Design doc says Vercel AI Gateway is the canonical routing layer; this
 * module stays compatible with that by taking an explicit apiKey arg, so
 * when AI Gateway is wired the factory just swaps to the gateway key and
 * the provider "google/" prefix.
 */

import { GoogleGenAI } from "@google/genai";

export type EmbedMode = "document" | "query";

export type GeminiClient = {
  /**
   * Embed text for vector search. `mode` MUST be asymmetric — corpus
   * documents use "document" (RETRIEVAL_DOCUMENT), user queries use
   * "query" (RETRIEVAL_QUERY). Using DOCUMENT for both degrades retrieval
   * by ~34% per Gemini's own A/B tests — the pattern is required, not
   * optional, for embedding-001 + gemini-embedding-2.
   */
  readonly embed: (text: string, mode?: EmbedMode) => Promise<readonly number[]>;
  readonly generateStructured: <T>(args: {
    readonly systemPrompt: string;
    readonly userPrompt: string;
    readonly responseSchema: unknown;
    readonly model?: "gemini-2.5-pro" | "gemini-2.5-flash" | "gemini-flash-latest";
    readonly thinkingBudget?: number;
  }) => Promise<T>;
};

const EMBEDDING_MODEL = "gemini-embedding-001";
const EMBEDDING_DIM = 768;

export function createGeminiClient(apiKey: string): GeminiClient {
  if (!apiKey) throw new Error("GEMINI_API_KEY is required");
  const client = new GoogleGenAI({ apiKey });

  return {
    async embed(text, mode = "document") {
      // Direct REST call with x-goog-api-key header — the production-grade
      // auth path per Google docs. We had a session where the @google/genai
      // SDK silently accepted a stale shell-exported GEMINI_API_KEY (Next
      // .env.local doesn't override system env vars), so this code path
      // is also more transparent for debugging.
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
          "User-Agent": "hakivo-v3/1.0",
        },
        body: JSON.stringify({
          model: `models/${EMBEDDING_MODEL}`,
          content: { parts: [{ text }] },
          taskType:
            mode === "query" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
          outputDimensionality: EMBEDDING_DIM,
        }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(
          `Gemini embed failed: ${res.status} ${res.statusText} — ${body.slice(0, 300)}`,
        );
      }
      const data = (await res.json()) as {
        embedding?: { values?: readonly number[] };
      };
      const values = data.embedding?.values;
      if (!values) throw new Error("Gemini returned no embedding values");
      return values;
    },

    async generateStructured<T>({
      systemPrompt,
      userPrompt,
      responseSchema,
      model = "gemini-2.5-pro",
      thinkingBudget,
    }: {
      systemPrompt: string;
      userPrompt: string;
      responseSchema: unknown;
      model?: "gemini-2.5-pro" | "gemini-2.5-flash" | "gemini-flash-latest";
      thinkingBudget?: number;
    }): Promise<T> {
      const response = await client.models.generateContent({
        model,
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: "application/json",
          responseSchema: responseSchema as never,
          ...(thinkingBudget !== undefined && {
            thinkingConfig: { thinkingBudget },
          }),
        },
      });
      const text = response.text;
      if (!text) throw new Error("Gemini returned empty response");
      return JSON.parse(text) as T;
    },
  };
}
