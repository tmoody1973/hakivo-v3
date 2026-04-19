import { logger, schedules } from "@trigger.dev/sdk";
import type { Id } from "@hakivo/db";
import { generatePacket } from "./generate-packet";

/**
 * Per-recipient scheduled packet delivery.
 *
 * One schedule is attached per teacher at onboarding via
 * `schedules.create({ task: "deliver-scheduled-packet", externalId: teacherId,
 *                     cron: { pattern: "0 5 * * *", timezone: teacher.timezone }})`.
 *
 * Trigger.dev fires this task at the scheduled time in the teacher's
 * local timezone (5am). The task's only job is to normalize the
 * payload shape and chain-trigger generatePacket. generatePacket then
 * chain-triggers biasCheckPacket, which advances status and queues
 * email delivery (when Resend is wired in sub-session C).
 *
 * externalId MUST be the teachers row _id — the shape is validated below.
 */

export const deliverScheduledPacket = schedules.task({
  id: "deliver-scheduled-packet",
  maxDuration: 300,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 5_000,
    maxTimeoutInMs: 60_000,
    randomize: true,
  },
  run: async (payload) => {
    if (!payload.externalId) {
      throw new Error(
        "deliver-scheduled-packet fired without externalId — attach schedules with externalId=teacherId",
      );
    }
    const teacherId = payload.externalId as Id<"teachers">;
    const localDate = payload.timestamp.toLocaleDateString("en-CA", {
      timeZone: payload.timezone,
    });
    logger.log(
      `Scheduled delivery for teacher=${teacherId} localDate=${localDate} tz=${payload.timezone}`,
    );

    const handle = await generatePacket.trigger({
      teacherId,
      packetDate: localDate,
    });

    return {
      teacherId,
      localDate,
      timezone: payload.timezone,
      generatePacketRunId: handle.id,
    };
  },
});
