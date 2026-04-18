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

export type GeminiClient = {
  readonly embed: (text: string) => Promise<readonly number[]>;
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
    async embed(text) {
      const response = await client.models.embedContent({
        model: EMBEDDING_MODEL,
        contents: text,
        config: {
          outputDimensionality: EMBEDDING_DIM,
          taskType: "RETRIEVAL_DOCUMENT",
        },
      });
      const values = response.embeddings?.[0]?.values;
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
