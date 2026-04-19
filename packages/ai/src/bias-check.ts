/**
 * Bias-check rubric — run after generatePacket, before any delivery path
 * touches the packet. Per design doc §Bias-Check Rubric, civic-ed tools
 * sold to public schools must be demonstrably nonpartisan; this is the
 * programmatic gate.
 *
 * Primary provider: Claude Sonnet 4.6 (design doc §Model Matrix).
 * Fallback: Gemini 2.5 Pro when ANTHROPIC_API_KEY is missing.
 *
 * Rubric (0-10 per criterion, with per-criterion thresholds):
 *   1. Factual claims only               ≥7
 *   2. Multiple perspectives on contested ≥7
 *   3. Discussion questions open-ended   ≥8
 *   4. Language neutrality               ≥8
 *   5. Primary source attribution        ≥9  ← lowest tolerance
 *
 * Passed = all 5 above their thresholds. Overall = min across criteria.
 */

import Anthropic from "@anthropic-ai/sdk";
import { createGeminiClient } from "./gemini";

export type BiasCheckInput = {
  readonly teacherBrief: string;
  readonly discussionQuestions: readonly string[];
  readonly exitTicketQuestions: readonly { readonly prompt: string }[];
  readonly primarySources: readonly {
    readonly label: string;
    readonly url: string;
    readonly excerpt: string;
  }[];
  /**
   * Authoritative bill facts the generator pulled from Congress.gov via
   * Convex. The rubric treats these as primary-source data — claims in
   * the brief that match these tallies / cosponsor breakdowns / actions
   * are considered fully attributed.
   */
  readonly billFacts?: ReadonlyArray<{
    readonly billRef: string;
    readonly title: string;
    readonly congressGovUrl: string;
    readonly partyBalance: {
      readonly D: number;
      readonly R: number;
      readonly I: number;
      readonly other: number;
      readonly total: number;
      readonly isBipartisan: boolean;
    };
    readonly recentActions: ReadonlyArray<{
      readonly actionDate: number;
      readonly actionText: string;
      readonly actionType: string;
    }>;
  }>;
};

export type BiasCheckResult = {
  readonly factualClaimsOnly: number;
  readonly multiplePerspectives: number;
  readonly openEndedQuestions: number;
  readonly languageNeutrality: number;
  readonly primarySourceAttribution: number;
  readonly overallScore: number;
  readonly passed: boolean;
  readonly reviewNotes: string;
  readonly provider: "claude" | "gemini-fallback";
};

const CRITERIA_THRESHOLDS = {
  factualClaimsOnly: 7,
  multiplePerspectives: 7,
  openEndedQuestions: 8,
  languageNeutrality: 8,
  primarySourceAttribution: 9,
} as const;

const RUBRIC_SCHEMA = {
  type: "object",
  properties: {
    factualClaimsOnly: {
      type: "integer",
      minimum: 0,
      maximum: 10,
      description:
        "Score 0-10. Does the brief state facts or interpretations? Below 7 fails.",
    },
    multiplePerspectives: {
      type: "integer",
      minimum: 0,
      maximum: 10,
      description:
        "Score 0-10. Where a bill is politically contested, does the brief present pro/con with equal language quality? Below 7 fails.",
    },
    openEndedQuestions: {
      type: "integer",
      minimum: 0,
      maximum: 10,
      description:
        "Score 0-10. Do discussion questions invite student thinking vs. lead toward a conclusion? Below 8 fails.",
    },
    languageNeutrality: {
      type: "integer",
      minimum: 0,
      maximum: 10,
      description:
        "Score 0-10. Does the text use loaded adjectives, politically-coded terms, or partisan framings? Below 8 fails.",
    },
    primarySourceAttribution: {
      type: "integer",
      minimum: 0,
      maximum: 10,
      description:
        "Score 0-10. Are claims traceable to cited sources? Below 9 fails — this is the tightest criterion.",
    },
    reviewNotes: {
      type: "string",
      description:
        "Brief justification for any criterion scoring below its threshold. Empty if all pass.",
    },
  },
  required: [
    "factualClaimsOnly",
    "multiplePerspectives",
    "openEndedQuestions",
    "languageNeutrality",
    "primarySourceAttribution",
    "reviewNotes",
  ],
};

const SYSTEM_PROMPT = `You are a bias reviewer for Hakivo, a civic education platform delivered to high school US Government teachers. Your job is to score a generated teacher packet against a 5-criterion neutrality rubric.

Civic-ed tools sold to public schools MUST be demonstrably nonpartisan. Score strictly. A single loaded adjective in a 400-word brief is enough to drop the language-neutrality score.

Scoring rules:
- Score each criterion 0-10 as an integer
- Below-threshold scores MUST be justified in reviewNotes (max 3 sentences total across all failed criteria)
- If all 5 criteria pass their thresholds, reviewNotes is empty
- Be honest — this is a quality gate, not a rubber stamp

The 5 criteria and thresholds:
1. factualClaimsOnly (≥7): facts vs interpretations
2. multiplePerspectives (≥7): pro/con balance on contested issues
3. openEndedQuestions (≥8): open-ended vs leading
4. languageNeutrality (≥8): loaded adjectives, partisan framings
5. primarySourceAttribution (≥9): claims traceable to cited sources

PRIMARY SOURCE DATA NOTE:
Each packet ships with two source layers — short PRIMARY SOURCES
(label, url, 200-char excerpt) and a richer BILL FACTS section
(authoritative party tallies, cosponsor counts, action history pulled
directly from Congress.gov via the Convex bill records). When scoring
primarySourceAttribution, treat BILL FACTS as fully attributable
primary-source data: claims in the brief that match the tallies,
party breakdown, or recent actions in BILL FACTS are sourced.
A claim does NOT need to appear verbatim in a primarySource excerpt
to be attributed — the BILL FACTS row for that bill is itself the
Congress.gov-traceable source.`;

function formatBillFacts(
  facts: NonNullable<BiasCheckInput["billFacts"]>,
): string {
  return facts
    .map((b) => {
      const recent = b.recentActions
        .slice(0, 5)
        .map((a) => {
          const date = new Date(a.actionDate).toISOString().slice(0, 10);
          return `    ${date} [${a.actionType}] ${a.actionText}`;
        })
        .join("\n");
      const pb = b.partyBalance;
      return [
        `${b.billRef} — ${b.title}`,
        `  Source: ${b.congressGovUrl}`,
        `  Cosponsors: ${pb.D}D / ${pb.R}R / ${pb.I}I / ${pb.other} other (total ${pb.total}, bipartisan=${pb.isBipartisan})`,
        `  Recent actions:\n${recent || "    (none recorded)"}`,
      ].join("\n");
    })
    .join("\n\n");
}

function buildUserPrompt(input: BiasCheckInput): string {
  const billFactsSection =
    input.billFacts && input.billFacts.length > 0
      ? `\n=== BILL FACTS (Congress.gov primary-source data) ===\n${formatBillFacts(input.billFacts)}\n`
      : "";

  return `Packet to review:

=== TEACHER BRIEF ===
${input.teacherBrief}

=== DISCUSSION QUESTIONS ===
${input.discussionQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}

=== EXIT TICKET ===
${input.exitTicketQuestions.map((q, i) => `${i + 1}. ${q.prompt}`).join("\n")}

=== PRIMARY SOURCES ===
${input.primarySources.map((s) => `- ${s.label} (${s.url}): "${s.excerpt.slice(0, 200)}"`).join("\n")}
${billFactsSection}
Score this packet against the 5 criteria and return JSON matching the schema.`;
}

function computeResult(
  scores: {
    factualClaimsOnly: number;
    multiplePerspectives: number;
    openEndedQuestions: number;
    languageNeutrality: number;
    primarySourceAttribution: number;
    reviewNotes: string;
  },
  provider: "claude" | "gemini-fallback",
): BiasCheckResult {
  const overallScore = Math.min(
    scores.factualClaimsOnly,
    scores.multiplePerspectives,
    scores.openEndedQuestions,
    scores.languageNeutrality,
    scores.primarySourceAttribution,
  );
  const passed =
    scores.factualClaimsOnly >= CRITERIA_THRESHOLDS.factualClaimsOnly &&
    scores.multiplePerspectives >= CRITERIA_THRESHOLDS.multiplePerspectives &&
    scores.openEndedQuestions >= CRITERIA_THRESHOLDS.openEndedQuestions &&
    scores.languageNeutrality >= CRITERIA_THRESHOLDS.languageNeutrality &&
    scores.primarySourceAttribution >=
      CRITERIA_THRESHOLDS.primarySourceAttribution;

  return { ...scores, overallScore, passed, provider };
}

async function checkWithClaude(
  input: BiasCheckInput,
  apiKey: string,
): Promise<BiasCheckResult> {
  const client = new Anthropic({ apiKey });
  const response = await client.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserPrompt(input) }],
    tool_choice: { type: "tool", name: "score_packet" },
    tools: [
      {
        name: "score_packet",
        description: "Score the packet on the 5-criterion bias rubric",
        input_schema: RUBRIC_SCHEMA as never,
      },
    ],
  });
  const toolUse = response.content.find((b) => b.type === "tool_use");
  if (!toolUse || toolUse.type !== "tool_use") {
    throw new Error("Claude did not return a score_packet tool-use block");
  }
  return computeResult(
    toolUse.input as Parameters<typeof computeResult>[0],
    "claude",
  );
}

async function checkWithGemini(
  input: BiasCheckInput,
  apiKey: string,
): Promise<BiasCheckResult> {
  const gemini = createGeminiClient(apiKey);
  const scores = await gemini.generateStructured<{
    factualClaimsOnly: number;
    multiplePerspectives: number;
    openEndedQuestions: number;
    languageNeutrality: number;
    primarySourceAttribution: number;
    reviewNotes: string;
  }>({
    systemPrompt: SYSTEM_PROMPT,
    userPrompt: buildUserPrompt(input),
    responseSchema: RUBRIC_SCHEMA,
    model: "gemini-2.5-pro",
  });
  return computeResult(scores, "gemini-fallback");
}

export async function checkPacketBias(
  input: BiasCheckInput,
  keys: { readonly anthropic?: string | undefined; readonly gemini?: string | undefined },
): Promise<BiasCheckResult> {
  if (keys.anthropic) {
    try {
      return await checkWithClaude(input, keys.anthropic);
    } catch (err) {
      if (!keys.gemini) throw err;
      // Fall through to Gemini
    }
  }
  if (!keys.gemini) {
    throw new Error(
      "Neither ANTHROPIC_API_KEY nor GEMINI_API_KEY is available for bias check",
    );
  }
  return checkWithGemini(input, keys.gemini);
}
