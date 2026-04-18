import { logger, task } from "@trigger.dev/sdk";
import { checkPacketBias } from "@hakivo/ai";
import { api, type Id } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";

/**
 * Run the 5-criterion bias rubric on a packet. See design doc
 * §Bias-Check Rubric. Primary provider Claude Sonnet; falls back to
 * Gemini 2.5 Pro when ANTHROPIC_API_KEY is missing.
 *
 * Called from generatePacket immediately after packets.create; passes
 * the new packetId. Failure routes the packet to the human-review queue.
 */

export type BiasCheckPacketPayload = {
  readonly packetId: Id<"packets">;
};

export type BiasCheckPacketResult = {
  readonly packetId: string;
  readonly provider: "claude" | "gemini-fallback";
  readonly overallScore: number;
  readonly passed: boolean;
  readonly reviewNotes: string;
  readonly subScores: {
    readonly factualClaimsOnly: number;
    readonly multiplePerspectives: number;
    readonly openEndedQuestions: number;
    readonly languageNeutrality: number;
    readonly primarySourceAttribution: number;
  };
};

export const biasCheckPacket = task({
  id: "bias-check-packet",
  maxDuration: 120,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 3_000,
    maxTimeoutInMs: 30_000,
    randomize: true,
  },
  run: async (
    payload: BiasCheckPacketPayload,
  ): Promise<BiasCheckPacketResult> => {
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) throw new Error("CONVEX_URL not set");
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!anthropicKey && !geminiKey) {
      throw new Error(
        "ANTHROPIC_API_KEY or GEMINI_API_KEY required for bias check",
      );
    }

    const convex = new ConvexHttpClient(convexUrl);
    const packet = await convex.query(api.packets.getById, {
      id: payload.packetId,
    });
    if (!packet) throw new Error(`Packet ${payload.packetId} not found`);

    const result = await checkPacketBias(
      {
        teacherBrief: packet.teacherBrief,
        discussionQuestions: packet.discussionQuestions,
        exitTicketQuestions: packet.exitTicket.questions,
        primarySources: packet.primarySources,
      },
      {
        ...(anthropicKey !== undefined && { anthropic: anthropicKey }),
        ...(geminiKey !== undefined && { gemini: geminiKey }),
      },
    );

    logger.log(
      `Bias check ${result.passed ? "PASSED" : "FAILED"} (overall=${result.overallScore}) via ${result.provider}`,
    );
    if (!result.passed) logger.warn(`Review notes: ${result.reviewNotes}`);

    await convex.mutation(api.packets.setBiasCheck, {
      id: payload.packetId,
      biasScore: result.overallScore,
      biasScoreOk: result.passed,
      biasSubScores: {
        factualClaimsOnly: result.factualClaimsOnly,
        multiplePerspectives: result.multiplePerspectives,
        openEndedQuestions: result.openEndedQuestions,
        languageNeutrality: result.languageNeutrality,
        primarySourceAttribution: result.primarySourceAttribution,
      },
      biasReviewNotes: result.reviewNotes,
      biasProvider: result.provider,
    });

    return {
      packetId: payload.packetId,
      provider: result.provider,
      overallScore: result.overallScore,
      passed: result.passed,
      reviewNotes: result.reviewNotes,
      subScores: {
        factualClaimsOnly: result.factualClaimsOnly,
        multiplePerspectives: result.multiplePerspectives,
        openEndedQuestions: result.openEndedQuestions,
        languageNeutrality: result.languageNeutrality,
        primarySourceAttribution: result.primarySourceAttribution,
      },
    };
  },
});
