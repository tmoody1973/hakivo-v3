import { logger, task } from "@trigger.dev/sdk";
import { api, type Id } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";
import { renderHandoutPdf } from "../pdf/render-handout";
import {
  createR2Uploader,
  loadR2ConfigFromEnv,
} from "../audio/r2-client";
import { sendPacketEmail } from "./send-packet-email";

/**
 * Render the print-first PDF handout and upload to R2.
 *
 * Pipeline position:
 *   bias-check (pass) → generate-packet-audio → generate-packet-pdf
 *     → send-packet-email
 *
 * Failure semantics: PDF is supplementary like audio — if rendering or
 * upload fails, we still chain send-packet-email so the email ships
 * with whatever artifacts we did produce. The retry config wraps the
 * render+upload itself.
 */

export type GeneratePacketPdfPayload = {
  readonly packetId: Id<"packets">;
};

export type GeneratePacketPdfResult = {
  readonly packetId: string;
  readonly status: "uploaded" | "skipped_existing" | "failed";
  readonly pdfUrl?: string;
  readonly bytes?: number;
  readonly error?: string;
};

export const generatePacketPdf = task({
  id: "generate-packet-pdf",
  maxDuration: 120,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 3_000,
    maxTimeoutInMs: 30_000,
    randomize: true,
  },
  run: async (
    payload: GeneratePacketPdfPayload,
  ): Promise<GeneratePacketPdfResult> => {
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) throw new Error("CONVEX_URL not set");

    const convex = new ConvexHttpClient(convexUrl);
    const packet = await convex.query(api.packets.getById, {
      id: payload.packetId,
    });
    if (!packet) throw new Error(`Packet ${payload.packetId} not found`);
    const teacher = await convex.query(api.teachers.getById, {
      id: packet.teacherId,
    });
    if (!teacher) throw new Error(`Teacher ${packet.teacherId} not found`);

    if (packet.pdfUrl) {
      logger.log(`Packet ${payload.packetId} already has pdfUrl — skipping`);
      await sendPacketEmail.trigger({ packetId: payload.packetId });
      return {
        packetId: payload.packetId,
        status: "skipped_existing",
        pdfUrl: packet.pdfUrl,
      };
    }

    try {
      logger.log("Rendering PDF via @react-pdf/renderer");
      const rendered = await renderHandoutPdf({
        packet,
        teacherName: teacher.name,
      });
      logger.log(`PDF rendered: ${(rendered.bytes / 1024).toFixed(1)} KB`);

      const r2 = createR2Uploader(loadR2ConfigFromEnv());
      const key = `packets/${packet.teacherId}/${packet.packetDate}-${payload.packetId}.pdf`;
      const upload = await r2.upload({
        key,
        body: rendered.buffer,
        contentType: "application/pdf",
        cacheControl: "public, max-age=31536000, immutable",
      });
      logger.log(`Uploaded to R2: ${upload.publicUrl}`);

      await convex.mutation(api.packets.setPdf, {
        id: payload.packetId,
        pdfUrl: upload.publicUrl,
      });

      await sendPacketEmail.trigger({ packetId: payload.packetId });
      logger.log(`Chained send-packet-email for ${payload.packetId}`);

      return {
        packetId: payload.packetId,
        status: "uploaded",
        pdfUrl: upload.publicUrl,
        bytes: upload.bytes,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`PDF generation failed: ${message}`);
      await sendPacketEmail.trigger({ packetId: payload.packetId });
      return {
        packetId: payload.packetId,
        status: "failed",
        error: message,
      };
    }
  },
});
