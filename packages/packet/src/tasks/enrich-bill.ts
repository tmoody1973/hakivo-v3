import { logger, task } from "@trigger.dev/sdk";
import { createCongressClient, type BillType } from "@hakivo/congress";
import { createGeminiClient } from "@hakivo/ai";
import { api } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";

/**
 * Enrich one bill with its P0 Congress.gov data + a Gemini embedding.
 *
 *   1. Fetch actions, cosponsors, subjects, summaries, text in parallel
 *   2. Replace billActions/billCosponsors/billSubjects rows
 *   3. Pick the latest CRS summary (or fall back to the bill title)
 *   4. Truncate billText to fit in Convex (<=900KB inline, else R2 — for
 *      now we just truncate; R2 fallback lands in a later phase)
 *   5. Generate a 768-dim embedding from (title + summary + first 5K of text)
 *   6. Patch the bills row with text + summary + embedding + enrichedAt
 *
 * Payload: { congressNumber, billType, billNumber, orgId? }
 *
 * Called from ingestCongressDaily after bills.upsertBatch completes. Can
 * also be triggered manually for a single bill (see scripts/fire-enrich.ts).
 */

const DEFAULT_ORG_ID = "hakivo-v3";
const MAX_INLINE_TEXT_BYTES = 900_000;
const EMBEDDING_TEXT_CHARS = 5_000;

export type EnrichBillPayload = {
  readonly congressNumber: number;
  readonly billType: string;
  readonly billNumber: number;
  readonly orgId?: string;
};

export type EnrichBillResult = {
  readonly billRef: string;
  readonly status: "enriched" | "skipped_no_text" | "failed";
  readonly actions: number;
  readonly cosponsors: number;
  readonly subjects: number;
  readonly hasText: boolean;
  readonly textBytes: number;
  readonly hasEmbedding: boolean;
};

export const enrichBill = task({
  id: "enrich-bill",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
    randomize: true,
  },
  run: async (payload: EnrichBillPayload): Promise<EnrichBillResult> => {
    const orgId = payload.orgId ?? DEFAULT_ORG_ID;
    const billRef = `${payload.congressNumber}-${payload.billType}-${payload.billNumber}`;

    const congressApiKey = process.env.CONGRESS_API_KEY;
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!congressApiKey) throw new Error("CONGRESS_API_KEY not set");
    if (!geminiApiKey) throw new Error("GEMINI_API_KEY not set");
    if (!convexUrl) throw new Error("CONVEX_URL not set");

    const congress = createCongressClient(congressApiKey);
    const gemini = createGeminiClient(geminiApiKey);
    const convex = new ConvexHttpClient(convexUrl);

    const args = {
      congress: payload.congressNumber,
      type: payload.billType as BillType,
      number: payload.billNumber,
    };

    logger.log(`Enriching ${billRef}`);
    const [actionsRaw, cosponsorsRaw, subjectsRaw, summariesRaw, textResult] =
      await Promise.all([
        congress.getBillActions(args),
        congress.getBillCosponsors(args),
        congress.getBillSubjects(args),
        congress.getBillSummaries(args),
        congress.getLatestBillText(args).catch((err) => {
          logger.warn(`text fetch failed for ${billRef}: ${String(err)}`);
          return null;
        }),
      ]);

    const actions = actionsRaw.map((a) => ({
      orgId,
      billRef,
      actionDate: Date.parse(a.actionDate),
      actionType: a.type ?? "Unknown",
      actionText: a.text,
      ...(a.actionCode !== undefined && { actionCode: a.actionCode }),
    }));

    const cosponsors = cosponsorsRaw.map((c) => ({
      orgId,
      billRef,
      bioguideId: c.bioguideId,
      party: c.party,
      state: c.state,
      sponsorshipDate: c.sponsorshipDate,
      isOriginalCosponsor: c.isOriginalCosponsor ?? false,
      isWithdrawn: c.sponsorshipWithdrawnDate !== undefined,
    }));

    const subjects: {
      orgId: string;
      billRef: string;
      subject: string;
      isPolicyArea: boolean;
    }[] = [];
    if (subjectsRaw.policyArea) {
      subjects.push({
        orgId,
        billRef,
        subject: subjectsRaw.policyArea.name,
        isPolicyArea: true,
      });
    }
    for (const s of subjectsRaw.legislativeSubjects) {
      subjects.push({
        orgId,
        billRef,
        subject: s.name,
        isPolicyArea: false,
      });
    }

    await Promise.all([
      convex.mutation(api.billActions.replaceForBill, { billRef, actions }),
      convex.mutation(api.billCosponsors.replaceForBill, {
        billRef,
        cosponsors,
      }),
      convex.mutation(api.billSubjects.replaceForBill, { billRef, subjects }),
    ]);

    const latestSummary = summariesRaw[summariesRaw.length - 1];
    const summary = latestSummary?.text
      ? stripHtml(latestSummary.text)
      : undefined;

    const fullText = textResult?.text ?? "";
    const textBytes = new TextEncoder().encode(fullText).length;
    const inlineText =
      textBytes > 0 && textBytes <= MAX_INLINE_TEXT_BYTES
        ? fullText
        : undefined;
    const textSource = textResult?.source;

    const embeddingSource = [
      `Title: ${billRef}`,
      summary ? `Summary: ${summary}` : "",
      fullText ? `Text excerpt: ${fullText.slice(0, EMBEDDING_TEXT_CHARS)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    let embedding: readonly number[] | undefined;
    try {
      embedding = await gemini.embed(embeddingSource);
    } catch (err) {
      logger.warn(`embedding failed for ${billRef}: ${String(err)}`);
    }

    const policyTopics = subjectsRaw.policyArea?.name
      ? [subjectsRaw.policyArea.name]
      : [];

    await convex.mutation(api.bills.enrichOne, {
      congressNumber: payload.congressNumber,
      billType: payload.billType,
      billNumber: payload.billNumber,
      topics: policyTopics,
      ...(inlineText !== undefined && { billText: inlineText }),
      ...(textSource !== undefined && { billTextSource: textSource }),
      ...(summary !== undefined && { summary }),
      ...(embedding !== undefined && { embedding: [...embedding] }),
    });

    return {
      billRef,
      status: fullText ? "enriched" : "skipped_no_text",
      actions: actions.length,
      cosponsors: cosponsors.length,
      subjects: subjects.length,
      hasText: Boolean(inlineText),
      textBytes,
      hasEmbedding: embedding !== undefined,
    };
  },
});

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}
