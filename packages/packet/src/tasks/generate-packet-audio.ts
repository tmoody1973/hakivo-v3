import { logger, task } from "@trigger.dev/sdk";
import { synthesizeSpeech, DEFAULT_HAKIVO_SPEAKERS } from "@hakivo/ai";
import { api, type Id } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";
import { buildAudioScript } from "../audio/build-audio-script";
import {
  createR2Uploader,
  loadR2ConfigFromEnv,
} from "../audio/r2-client";
import { generatePacketPdf } from "./generate-packet-pdf";

/**
 * Generate the audio briefing for a packet, upload to R2, patch the
 * packet row with audioUrl, then chain send-packet-email so the email
 * carries the audio link.
 *
 * Pipeline position:
 *   bias-check (pass) → generate-packet-audio → generate-packet-pdf
 *     → send-packet-email
 *
 * Failure semantics: if TTS fails, we still chain generate-packet-pdf
 * (audio is supplementary, not blocking — Marissa's interview was clear
 * the email + brief is the primary deliverable). We log the error and
 * leave audioUrl null. Trigger.dev's retry config wraps the TTS call
 * itself but we eat the final failure so the chain always advances.
 */

export type GeneratePacketAudioPayload = {
  readonly packetId: Id<"packets">;
};

export type GeneratePacketAudioResult = {
  readonly packetId: string;
  readonly status: "uploaded" | "skipped_existing" | "failed";
  readonly audioUrl?: string;
  readonly durationSec?: number;
  readonly bytes?: number;
  readonly error?: string;
};

export const generatePacketAudio = task({
  id: "generate-packet-audio",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
    randomize: true,
  },
  run: async (
    payload: GeneratePacketAudioPayload,
  ): Promise<GeneratePacketAudioResult> => {
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!convexUrl) throw new Error("CONVEX_URL not set");
    if (!geminiKey) throw new Error("GEMINI_API_KEY not set");

    const convex = new ConvexHttpClient(convexUrl);
    const packet = await convex.query(api.packets.getById, {
      id: payload.packetId,
    });
    if (!packet) throw new Error(`Packet ${payload.packetId} not found`);

    if (packet.audioUrl) {
      logger.log(`Packet ${payload.packetId} already has audioUrl — skipping`);
      await generatePacketPdf.trigger({ packetId: payload.packetId });
      return {
        packetId: payload.packetId,
        status: "skipped_existing",
        audioUrl: packet.audioUrl,
      };
    }

    try {
      logger.log("Building dialogue script via gemini-2.5-flash");
      const script = await buildAudioScript({ packet, geminiApiKey: geminiKey });
      logger.log(`Script: ${script.length} chars, ${script.split(/\s+/).length} words`);

      logger.log("Synthesizing audio via gemini-3.1-flash-tts-preview");
      const tts = await synthesizeSpeech(geminiKey, {
        text: script,
        speakers: DEFAULT_HAKIVO_SPEAKERS,
      });
      logger.log(
        `Audio synthesized: ${tts.durationSec.toFixed(1)}s, ${(tts.wav.byteLength / 1024).toFixed(1)} KB`,
      );

      const r2 = createR2Uploader(loadR2ConfigFromEnv());
      const key = `packets/${packet.teacherId}/${packet.packetDate}-${payload.packetId}.wav`;
      const upload = await r2.upload({
        key,
        body: tts.wav,
        contentType: "audio/wav",
        cacheControl: "public, max-age=31536000, immutable",
      });
      logger.log(`Uploaded to R2: ${upload.publicUrl}`);

      await convex.mutation(api.packets.setAudio, {
        id: payload.packetId,
        audioUrl: upload.publicUrl,
        audioDurationSec: Math.round(tts.durationSec),
      });

      await generatePacketPdf.trigger({ packetId: payload.packetId });
      logger.log(`Chained generate-packet-pdf for ${payload.packetId}`);

      return {
        packetId: payload.packetId,
        status: "uploaded",
        audioUrl: upload.publicUrl,
        durationSec: tts.durationSec,
        bytes: upload.bytes,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Audio generation failed: ${message}`);
      // Audio is supplementary — chain pdf anyway so the packet ships.
      await generatePacketPdf.trigger({ packetId: payload.packetId });
      return {
        packetId: payload.packetId,
        status: "failed",
        error: message,
      };
    }
  },
});
