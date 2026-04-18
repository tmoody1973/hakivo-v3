import { logger, task } from "@trigger.dev/sdk";
import { packetIdempotencyKey } from "../idempotency";

/**
 * Per-recipient daily packet delivery task.
 *
 * Trigger.dev is the SOLE scheduler for packet delivery (see project
 * CLAUDE.md). One schedule per teacher is attached to this task at
 * onboarding time via `schedules.create()`, using the teacher's IANA
 * timezone to derive a 5am-local cron.
 *
 * The idempotency contract (from `packet:idempotency`) prevents double
 * delivery: the unique index on Convex `packetDeliveries.by_recipient_date`
 * is the structural guarantee, even if Trigger.dev retries or the scheduler
 * fans out unexpectedly.
 *
 * Week-1 scaffold: shape only. The real pipeline — Congress ingest query,
 * Gemini 3.1 Pro synthesis, Claude Sonnet bias check, Hybiscus PDF render,
 * Cloudflare R2 audio upload, Resend email send — lands in week 2.
 */

export type DeliverDailyPacketPayload = {
  readonly recipientId: string;
  readonly localDate: string;
  readonly orgId: string;
};

export type DeliverDailyPacketResult = {
  readonly status: "stub" | "skipped_duplicate" | "delivered" | "failed";
  readonly idempotencyKey: string;
  readonly message: string;
};

export const deliverDailyPacket = task({
  id: "deliver-daily-packet",
  maxDuration: 600,
  retry: {
    maxAttempts: 5,
    factor: 2,
    minTimeoutInMs: 1_000,
    maxTimeoutInMs: 60_000,
    randomize: true,
  },
  run: async (
    payload: DeliverDailyPacketPayload,
  ): Promise<DeliverDailyPacketResult> => {
    const idempotencyKey = packetIdempotencyKey(
      payload.recipientId,
      payload.localDate,
    );

    logger.log("deliver-daily-packet fired (week-1 stub)", {
      idempotencyKey,
      orgId: payload.orgId,
    });

    return {
      status: "stub",
      idempotencyKey,
      message:
        "Week-1 scaffold — packetDeliveries ledger insert + packet pipeline land in week 2",
    };
  },
});
