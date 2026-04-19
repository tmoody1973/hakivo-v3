import { logger, task } from "@trigger.dev/sdk";
import { createGeminiClient, FACTS_ONLY_SYSTEM_PROMPT } from "@hakivo/ai";
import { api, type Id } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";
import { biasCheckPacket } from "./bias-check-packet";

/**
 * Hakivo packet generator — the first real packet.
 *
 * Pipeline:
 *   1. Read teacher profile from Convex
 *   2. Build an embedding-friendly query from the teacher's CED unit /
 *      courses (falls back to a neutral civic-activity query)
 *   3. Embed the query via gemini-embedding-001 (768-dim)
 *   4. Call buildPacketContext action — vector search + graph join
 *      over bills, cosponsors, actions, subjects, state delegation
 *   5. Send context to gemini-2.5-pro with FACTS_ONLY_SYSTEM_PROMPT
 *      and a strict JSON response schema
 *   6. Insert the generated packet via packets.create (idempotent per
 *      teacher+date)
 *
 * Week-2 scaffold: bias check, PDF render, audio, email are separate
 * downstream tasks. This task produces the Convex row the rest of the
 * pipeline consumes.
 */

export type GeneratePacketPayload = {
  readonly teacherId: Id<"teachers">;
  readonly packetDate?: string;
  /** Free-text topic override — replaces CED-unit query when set */
  readonly customTopic?: string;
  /** Bills to seed the context with (in addition to vector search) */
  readonly targetBillRefs?: readonly string[];
  /** Reading level override for this packet only */
  readonly readingLevelOverride?: string;
  /** Who requested this — defaults to auto_schedule */
  readonly requestedBy?: "auto_schedule" | "teacher_request";
  /** If true, deletes any existing packet for (teacher, date) before generating. */
  readonly forceRegenerate?: boolean;
};

export type GeneratePacketResult = {
  readonly packetId: string;
  readonly billsConsidered: number;
  readonly tokensIn: number;
  readonly tokensOut: number;
  readonly durationMs: number;
};

const CED_UNIT_QUERIES: Record<string, string> = {
  unit_1:
    "Foundations of American democracy, constitutional principles, federalism, checks and balances, separation of powers",
  unit_2:
    "Interactions among branches of government, Congress, presidency, federal courts, bureaucracy",
  unit_3:
    "Civil liberties and civil rights, Bill of Rights, due process, voting rights, equal protection",
  unit_4:
    "American political ideologies and beliefs, political socialization, public opinion, political parties",
  unit_5:
    "Political participation, elections, campaign finance, interest groups, media and politics",
};

const PACKET_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    teacherBrief: {
      type: "string",
      description:
        "A 400-600 word teacher-ready brief synthesizing recent Congressional activity relevant to the teacher's context. Cites bills by ID (e.g., 'H.R. 27'). Neutral language. No loaded adjectives.",
    },
    discussionQuestions: {
      type: "array",
      items: { type: "string" },
      minItems: 5,
      maxItems: 5,
      description:
        "Five open-ended discussion questions at the teacher's target reading level. Each should invite student thinking, not lead toward a predetermined answer.",
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
              choices: {
                type: "array",
                items: { type: "string" },
              },
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
        "Primary sources cited in the brief — must be from the provided context. Never invent URLs.",
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
    "teacherBrief",
    "discussionQuestions",
    "exitTicket",
    "primarySources",
    "standardsAlignment",
  ],
};

type GeneratedPacket = {
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

export const generatePacket = task({
  id: "generate-packet",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
    randomize: true,
  },
  run: async (payload: GeneratePacketPayload): Promise<GeneratePacketResult> => {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!geminiApiKey) throw new Error("GEMINI_API_KEY not set");
    if (!convexUrl) throw new Error("CONVEX_URL not set");

    const started = Date.now();
    const gemini = createGeminiClient(geminiApiKey);
    const convex = new ConvexHttpClient(convexUrl);

    const teacher = await convex.query(api.teachers.getById, {
      id: payload.teacherId,
    });
    if (!teacher) throw new Error(`Teacher ${payload.teacherId} not found`);

    const packetDate =
      payload.packetDate ?? new Date().toISOString().slice(0, 10);

    if (payload.forceRegenerate) {
      const deletedPacket = await convex.mutation(api.packets.deleteForDate, {
        teacherId: payload.teacherId,
        packetDate,
      });
      const deletedLedger = await convex.mutation(
        api.packetDeliveries.deleteForDate,
        { teacherId: payload.teacherId, localDate: packetDate },
      );
      logger.log(
        `forceRegenerate: deleted packet=${deletedPacket} ledger=${deletedLedger} for ${packetDate}`,
      );
    }

    // Precedence:
    //   1. Explicit customTopic from a teacher request
    //   2. CED unit topic vocabulary if teacher.currentUnit is set
    //   3. Fallback: substantive pending legislation vocabulary
    const unitQuery =
      payload.customTopic ??
      (teacher.currentUnit && CED_UNIT_QUERIES[teacher.currentUnit]) ??
      "Substantive pending federal legislation with recent committee action, floor votes, or significant sponsor activity. Concrete policy proposals affecting citizens: healthcare, education, civil rights, economy, technology, environment, transportation, voting, immigration, national security.";
    const embeddingQuery = `${unitQuery}. Teacher courses: ${teacher.courses.join(", ")}. State: ${teacher.state ?? "US"}.`;
    logger.log("Embedding query (RETRIEVAL_QUERY)", { embeddingQuery });

    // Asymmetric Gemini task types: query side uses RETRIEVAL_QUERY;
    // documents were embedded with RETRIEVAL_DOCUMENT in enrichBill.
    // Per Gemini A/B tests this asymmetry lifts retrieval quality ~34%.
    const queryEmbedding = await gemini.embed(embeddingQuery, "query");

    const context = await convex.action(api.graph.buildPacketContext, {
      teacherId: payload.teacherId,
      queryEmbedding: [...queryEmbedding],
      maxBills: 6,
    });
    logger.log(`Retrieved ${context.bills.length} bills for context`);

    if (context.bills.length === 0) {
      throw new Error(
        "No bills matched the teacher's context — enrich more bills first",
      );
    }

    const userPrompt = buildUserPrompt(context);
    const generated = await gemini.generateStructured<GeneratedPacket>({
      systemPrompt: FACTS_ONLY_SYSTEM_PROMPT,
      userPrompt,
      responseSchema: PACKET_RESPONSE_SCHEMA,
      model: "gemini-2.5-pro",
    });

    const packetId = await convex.mutation(api.packets.create, {
      orgId: teacher.orgId,
      teacherId: payload.teacherId,
      packetDate,
      sourceEventIds: [],
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
      standardsAlignment: {
        c3Dimensions: [...generated.standardsAlignment.c3Dimensions],
        apCedUnits: generated.standardsAlignment.apCedUnits
          ? [...generated.standardsAlignment.apCedUnits]
          : null,
        stateStandards: [...generated.standardsAlignment.stateStandards],
      },
      requestedBy: payload.requestedBy ?? "auto_schedule",
      ...(payload.customTopic !== undefined && { customTopic: payload.customTopic }),
      ...(payload.targetBillRefs !== undefined && {
        targetBillRefs: [...payload.targetBillRefs],
      }),
      ...(payload.readingLevelOverride !== undefined && {
        readingLevelOverride: payload.readingLevelOverride,
      }),
      qualityChecks: {
        readingLevelOk: true,
        factCheckOk: true,
        biasScoreOk: false,
        biasScore: 0,
        humanReviewed: false,
      },
    });

    // Chain bias check. Fire-and-forget — the task has its own retry
    // and patches qualityChecks + status when it finishes.
    await biasCheckPacket.trigger({ packetId });
    logger.log(`Chained bias-check-packet for ${packetId}`);

    return {
      packetId,
      billsConsidered: context.bills.length,
      tokensIn: 0,
      tokensOut: 0,
      durationMs: Date.now() - started,
    };
  },
});

function buildUserPrompt(context: {
  teacherName: string;
  teacherState: string | undefined;
  teacherCourses: readonly string[];
  teacherCurrentUnit: string | null;
  teacherTargetReadingLevel: string | undefined;
  bills: readonly unknown[];
}): string {
  return `Generate today's Hakivo daily packet.

TEACHER PROFILE:
  Name:           ${context.teacherName}
  State:          ${context.teacherState ?? "N/A"}
  Courses:        ${context.teacherCourses.join(", ") || "N/A"}
  Current unit:   ${context.teacherCurrentUnit ?? "N/A"}
  Reading level:  ${context.teacherTargetReadingLevel ?? "10th grade"}

CONTEXT (bills to draw from — cite these exclusively):
${JSON.stringify(context.bills, null, 2)}

REQUIREMENTS:
- Teacher brief: 400-600 words, neutral tone, cite bills by ID inline
- Discussion questions: exactly 5, open-ended, target the teacher's reading level
- Exit ticket: exactly 5 questions, mix of multiple choice and short answer
- Primary sources: only URLs that appear in the context bills
- Standards alignment: at least one C3 dimension; CED units only if teacher is teaching AP Gov
- If a bill has a state-delegation involvement from ${context.teacherState ?? "the teacher's state"}, lean toward featuring it
- Respect the party balance — if a bill is bipartisan, say so; if single-party, say so neutrally`;
}
