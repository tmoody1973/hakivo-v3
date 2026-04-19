import { logger, task } from "@trigger.dev/sdk";
import { api, type Id } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";
import { renderDailyPacketEmail } from "../email/render-daily-packet";
import { createEmailSender } from "../email/resend-client";

/**
 * Send a packet via email. Chains after biasCheckPacket on pass.
 *
 * Idempotency: uses the existing packetDeliveries ledger keyed on
 * (recipientId, localDate). startSend inserts the row in "sending"
 * state — second call for the same packet finds the existing row and
 * short-circuits. On success, the row advances to "delivered". On
 * failure, the row records lastError and Trigger.dev's retry config
 * handles the rest.
 */

export type SendPacketEmailPayload = {
  readonly packetId: Id<"packets">;
};

export type SendPacketEmailResult = {
  readonly packetId: string;
  readonly status: "delivered" | "skipped_duplicate" | "no_email";
  readonly resendId?: string;
  readonly to?: string;
};

export const sendPacketEmail = task({
  id: "send-packet-email",
  maxDuration: 120,
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
    randomize: true,
  },
  run: async (
    payload: SendPacketEmailPayload,
  ): Promise<SendPacketEmailResult> => {
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    const resendKey = process.env.RESEND_API_KEY;
    const fromAddress = process.env.RESEND_FROM_ADDRESS;
    if (!convexUrl) throw new Error("CONVEX_URL not set");
    if (!resendKey) throw new Error("RESEND_API_KEY not set");

    const convex = new ConvexHttpClient(convexUrl);
    const packet = await convex.query(api.packets.getById, {
      id: payload.packetId,
    });
    if (!packet) throw new Error(`Packet ${payload.packetId} not found`);

    const teacher = await convex.query(api.teachers.getById, {
      id: packet.teacherId,
    });
    if (!teacher) {
      throw new Error(`Teacher ${packet.teacherId} not found`);
    }
    if (!teacher.email) {
      logger.warn(`Teacher ${teacher._id} has no email — skipping send`);
      return { packetId: payload.packetId, status: "no_email" };
    }

    // Acquire ledger row before sending. Idempotent — second call returns existing.
    const ledger = await convex.mutation(api.packetDeliveries.startSend, {
      orgId: packet.orgId,
      recipientId: packet.teacherId,
      packetId: payload.packetId,
      localDate: packet.packetDate,
    });
    if (ledger.existed && ledger.status === "delivered") {
      logger.log(
        `Packet ${payload.packetId} already delivered for ${packet.packetDate}`,
      );
      return { packetId: payload.packetId, status: "skipped_duplicate" };
    }

    const sender = createEmailSender({
      apiKey: resendKey,
      ...(fromAddress && fromAddress !== "" && { fromAddress }),
    });

    const { subject, html, text } = renderDailyPacketEmail({
      packet,
      teacherName: teacher.name,
    });

    let resendId: string;
    try {
      const result = await sender.send({
        to: teacher.email,
        subject,
        html,
        text,
        tags: [
          { name: "packet_id", value: String(payload.packetId) },
          { name: "teacher_id", value: String(teacher._id) },
          { name: "packet_date", value: packet.packetDate },
        ],
      });
      resendId = result.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await convex.mutation(api.packetDeliveries.markFailed, {
        id: ledger.id,
        error: message,
      });
      throw err;
    }

    await convex.mutation(api.packetDeliveries.markDelivered, {
      id: ledger.id,
    });
    await convex.mutation(api.packets.markDelivered, {
      id: payload.packetId,
    });

    logger.log(
      `Sent packet ${payload.packetId} to ${teacher.email} (resendId=${resendId})`,
    );

    return {
      packetId: payload.packetId,
      status: "delivered",
      resendId,
      to: teacher.email,
    };
  },
});
