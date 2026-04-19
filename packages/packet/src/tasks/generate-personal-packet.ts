import { logger, task } from "@trigger.dev/sdk";
import { createGeminiClient, FACTS_ONLY_SYSTEM_PROMPT } from "@hakivo/ai";
import { api, type Id } from "@hakivo/db";
import { createPerplexityClient } from "@hakivo/perplexity";
import { ConvexHttpClient } from "convex/browser";
import { biasCheckPacket } from "./bias-check-packet";

/**
 * Personal-tier packet generator: federal bills + state bills + Perplexity
 * news, woven into one neutral brief. Mirrors generate-packet's shape so
 * the rest of the pipeline (bias check, audio, PDF, email) doesn't have
 * to know it's a personal vs teacher packet.
 *
 * Differences from generate-packet:
 *   - Query is built from teacher.interestTags (not CED unit)
 *   - Adds Perplexity news context per interest tag
 *   - Brief prompt asks for citizen-facing voice (no teacher framing,
 *     no AP-curriculum language)
 *   - primarySources includes news URLs alongside Congress.gov URLs
 */

export type GeneratePersonalPacketPayload = {
  readonly teacherId: Id<"teachers">;
  readonly packetDate?: string;
  readonly forceRegenerate?: boolean;
};

export type GeneratePersonalPacketResult = {
  readonly packetId: string;
  readonly billsConsidered: number;
  readonly newsTagsFetched: number;
  readonly durationMs: number;
};

const DEFAULT_INTERESTS = [
  "broadband and rural connectivity",
  "AI regulation",
  "voting rights",
  "climate and energy policy",
  "civic engagement",
];

const PERSONAL_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline: {
      type: "string",
      description:
        "A 6-12 word topic headline. Concrete and specific (mention an actual policy area or development). No trailing punctuation.",
    },
    teacherBrief: {
      type: "string",
      description:
        "A 400-600 word neutral citizen-facing brief that weaves federal bills, state bills, and current news into one cohesive narrative. Cite bills by ID inline (e.g., 'H.R. 27') and news by source name (e.g., 'per the New York Times'). NO teacher framing — write for a civic-curious adult, not for a classroom. Neutral tone, no loaded adjectives.",
    },
    discussionQuestions: {
      type: "array",
      items: { type: "string" },
      minItems: 5,
      maxItems: 5,
      description:
        "Five open-ended reflective prompts a citizen might ponder. Not for students — for the reader's own thinking.",
    },
    exitTicket: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          minItems: 5,
          maxItems: 5,
          items: {
            type: "object",
            properties: {
              prompt: { type: "string" },
              kind: {
                type: "string",
                enum: ["multiple_choice", "short_answer"],
              },
              choices: { type: "array", items: { type: "string" } },
              answerKey: { type: "string" },
            },
            required: ["prompt", "kind"],
          },
        },
      },
      required: ["questions"],
    },
    primarySources: {
      type: "array",
      items: {
        type: "object",
        properties: {
          label: { type: "string" },
          url: { type: "string" },
          excerpt: { type: "string" },
        },
        required: ["label", "url", "excerpt"],
      },
      description:
        "Sources cited in the brief — must be from the provided context (bills + news URLs). Never invent URLs.",
    },
    standardsAlignment: {
      type: "object",
      properties: {
        c3Dimensions: { type: "array", items: { type: "string" } },
        apCedUnits: {
          anyOf: [
            { type: "array", items: { type: "string" } },
            { type: "null" },
          ],
        },
        stateStandards: { type: "array", items: { type: "string" } },
      },
      required: ["c3Dimensions", "apCedUnits", "stateStandards"],
    },
  },
  required: [
    "headline",
    "teacherBrief",
    "discussionQuestions",
    "exitTicket",
    "primarySources",
    "standardsAlignment",
  ],
};

type GeneratedPersonalPacket = {
  readonly headline: string;
  readonly teacherBrief: string;
  readonly discussionQuestions: readonly string[];
  readonly exitTicket: {
    readonly questions: readonly {
      readonly prompt: string;
      readonly kind: "multiple_choice" | "short_answer";
      readonly choices?: readonly string[];
      readonly answerKey?: string;
    }[];
  };
  readonly primarySources: readonly {
    readonly label: string;
    readonly url: string;
    readonly excerpt: string;
  }[];
  readonly standardsAlignment: {
    readonly c3Dimensions: readonly string[];
    readonly apCedUnits: readonly string[] | null;
    readonly stateStandards: readonly string[];
  };
};

export const generatePersonalPacket = task({
  id: "generate-personal-packet",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
  },
  run: async (
    payload: GeneratePersonalPacketPayload,
  ): Promise<GeneratePersonalPacketResult> => {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const perplexityApiKey = process.env.PERPLEXITY_API_KEY;
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!geminiApiKey) throw new Error("GEMINI_API_KEY not set");
    if (!perplexityApiKey) throw new Error("PERPLEXITY_API_KEY not set");
    if (!convexUrl) throw new Error("CONVEX_URL not set");

    const started = Date.now();
    const gemini = createGeminiClient(geminiApiKey);
    const perplexity = createPerplexityClient(perplexityApiKey);
    const convex = new ConvexHttpClient(convexUrl);

    const teacher = await convex.query(api.teachers.getById, {
      id: payload.teacherId,
    });
    if (!teacher) throw new Error(`Teacher ${payload.teacherId} not found`);

    const packetDate =
      payload.packetDate ?? new Date().toISOString().slice(0, 10);

    if (payload.forceRegenerate) {
      const { deleted: deletedPackets } = await convex.mutation(
        api.packets.deleteForDate,
        { teacherId: payload.teacherId, packetDate },
      );
      const deletedLedger = await convex.mutation(
        api.packetDeliveries.deleteForDate,
        { teacherId: payload.teacherId, localDate: packetDate },
      );
      logger.log(
        `forceRegenerate: deleted ${deletedPackets} packet(s), ledger=${deletedLedger}`,
      );
    }

    const tags =
      teacher.interestTags && teacher.interestTags.length > 0
        ? teacher.interestTags
        : DEFAULT_INTERESTS;
    const personalState = teacher.personalState ?? teacher.state;

    logger.log(
      `Personal packet for ${teacher._id}: ${tags.length} tags, state=${personalState ?? "—"}`,
    );

    // Embed query from interest tags + state hint.
    const embeddingQuery = `Recent legislation and policy developments related to: ${tags.join(", ")}.${personalState ? ` Focus where relevant on ${personalState} state context.` : ""}`;
    logger.log(`Embedding query: ${embeddingQuery.slice(0, 150)}…`);
    const queryEmbedding = await gemini.embed(embeddingQuery, "query");

    // Bills + news in parallel.
    const [billContext, newsByTag] = await Promise.all([
      convex.action(api.graph.buildPacketContext, {
        teacherId: payload.teacherId,
        queryEmbedding: [...queryEmbedding],
        maxBills: 6,
      }),
      Promise.all(
        tags.slice(0, 5).map(async (tag) => ({
          tag,
          news: await perplexity
            .fetchPolicyNews({ topic: tag, recency: "week", maxItems: 3 })
            .catch((err) => {
              logger.warn(`Perplexity failed for "${tag}": ${String(err)}`);
              return null;
            }),
        })),
      ),
    ]);

    const validNews = newsByTag.filter(
      (n): n is { tag: string; news: NonNullable<typeof n.news> } =>
        n.news !== null,
    );
    logger.log(
      `Context: ${billContext.bills.length} bills, ${validNews.length} news topics`,
    );

    // Snapshot bill facts for the bias rubric.
    const billsCitedSnapshot = billContext.bills.map((b) => ({
      billRef: b.billRef,
      title: b.title,
      congressGovUrl: b.state
        ? `https://openstates.org/${b.state.toLowerCase()}/bills/${b.billRef.split("-")[1]}/`
        : `https://www.congress.gov/bill/${b.congressNumber}th-congress/${b.billType === "hr" ? "house-bill" : b.billType === "s" ? "senate-bill" : `${b.billType}-resolution`}/${b.billNumber}`,
      partyBalance: {
        D: b.partyBalance.D,
        R: b.partyBalance.R,
        I: b.partyBalance.I,
        other: b.partyBalance.other,
        total: b.partyBalance.total,
        isBipartisan: b.partyBalance.isBipartisan,
      },
      recentActions: b.recentActions.map((a) => ({
        actionDate: a.actionDate,
        actionText: a.actionText,
        actionType: a.actionType,
      })),
    }));

    const userPrompt = buildPersonalPrompt({
      tags,
      personalState,
      bills: billContext.bills,
      news: validNews,
    });

    const generated = await gemini.generateStructured<GeneratedPersonalPacket>({
      systemPrompt: FACTS_ONLY_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: PERSONAL_RESPONSE_SCHEMA,
      model: "gemini-2.5-pro",
    });

    const packetId = await convex.mutation(api.packets.create, {
      orgId: teacher.orgId,
      teacherId: payload.teacherId,
      packetDate,
      sourceEventIds: [],
      headline: generated.headline,
      audience: "personal",
      teacherBrief: generated.teacherBrief,
      discussionQuestions: [...generated.discussionQuestions],
      exitTicket: {
        questions: generated.exitTicket.questions.map((q) => ({
          prompt: q.prompt,
          kind: q.kind,
          ...(q.choices !== undefined && { choices: [...q.choices] }),
          ...(q.answerKey !== undefined && { answerKey: q.answerKey }),
        })),
      },
      primarySources: generated.primarySources.map((p) => ({
        label: p.label,
        url: p.url,
        excerpt: p.excerpt,
      })),
      billsCitedSnapshot,
      standardsAlignment: {
        c3Dimensions: [...generated.standardsAlignment.c3Dimensions],
        apCedUnits: generated.standardsAlignment.apCedUnits
          ? [...generated.standardsAlignment.apCedUnits]
          : null,
        stateStandards: [...generated.standardsAlignment.stateStandards],
      },
      requestedBy: "auto_schedule",
      qualityChecks: {
        readingLevelOk: true,
        factCheckOk: true,
        biasScoreOk: false,
        biasScore: 0,
        humanReviewed: false,
      },
    });

    await biasCheckPacket.trigger({ packetId });
    logger.log(`Chained bias-check-packet for personal packet ${packetId}`);

    return {
      packetId,
      billsConsidered: billContext.bills.length,
      newsTagsFetched: validNews.length,
      durationMs: Date.now() - started,
    };
  },
});

function buildPersonalPrompt(args: {
  readonly tags: ReadonlyArray<string>;
  readonly personalState: string | undefined;
  readonly bills: ReadonlyArray<unknown>;
  readonly news: ReadonlyArray<{
    readonly tag: string;
    readonly news: {
      readonly summary: string;
      readonly citations: ReadonlyArray<string>;
      readonly sources: ReadonlyArray<{
        readonly title: string;
        readonly url: string;
        readonly date?: string;
      }>;
    };
  }>;
}): string {
  return `Generate today's personal civic brief for a civic-curious adult.

READER PROFILE:
  Interests:    ${args.tags.join(", ")}
  Home state:   ${args.personalState ?? "N/A"}
  Voice:        Citizen-facing, NOT a teacher tone. Write like NPR Up First, not like a lesson plan.

CONTEXT — BILLS (federal + state, retrieved by relevance + recency):
${JSON.stringify(args.bills, null, 2)}

CONTEXT — NEWS (per interest tag, last 7 days, with sources):
${args.news
  .map(
    (n) => `Topic: ${n.tag}
${n.news.summary}
Sources:
${n.news.sources.map((s) => `  - ${s.title} (${s.date ?? "n.d."}) ${s.url}`).join("\n")}`,
  )
  .join("\n\n---\n\n")}

REQUIREMENTS:
- Headline: 6-12 words, concrete and specific
- Brief: 400-600 words, blend bills + news into a single narrative arc.
  Cite bills inline by their identifier (e.g., "H.R. 27", "AB 1206").
  Cite news inline by source name and date when material.
  NO teacher framing — no "discussion questions for your class," no
  "AP CED unit alignment." Write for a citizen who cares about civic life.
- Discussion questions: 5 open-ended prompts a citizen might ponder.
- Exit ticket: 5 reflective questions (mix of MC + short answer) — repurposed
  here as self-check questions, not classroom artifacts.
- Primary sources: combine bill URLs + news URLs that the brief actually
  cites. Never invent a URL. Use the URLs provided in the context.
- Standards alignment: leave C3 / AP CED / state standards empty arrays
  (or nulls for AP CED) — this packet isn't for a classroom.
- Respect the bias-check rules: neutral language, both sides on contested
  policy, no editorial adjectives.`;
}
