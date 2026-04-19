import "server-only";
import { schedules } from "@trigger.dev/sdk";

const TASK_ID = "deliver-scheduled-packet";
const LOCAL_DELIVERY_CRON = "0 5 * * *";

/**
 * Attach (or re-attach) a daily packet schedule to a teacher. Called
 * from the onboardTeacher server action.
 *
 * Deduplication: we key by `teacher-${teacherId}` so a teacher who
 * changes timezone or re-onboards updates the existing schedule instead
 * of accumulating duplicates.
 *
 * The task fires at 5am in the teacher's IANA timezone. deliverScheduledPacket
 * receives { externalId: teacherId, timestamp, timezone } and chain-triggers
 * generatePacket with the teacher-local date.
 */
export async function ensureTeacherSchedule(args: {
  readonly teacherId: string;
  readonly timezone: string;
}): Promise<{ readonly scheduleId: string }> {
  const schedule = await schedules.create({
    task: TASK_ID,
    cron: LOCAL_DELIVERY_CRON,
    timezone: args.timezone,
    externalId: args.teacherId,
    deduplicationKey: `teacher-${args.teacherId}`,
  });
  return { scheduleId: schedule.id };
}

/**
 * Deactivate a teacher's schedule (on churn / unsubscribe).
 */
export async function deactivateTeacherSchedule(args: {
  readonly teacherId: string;
}): Promise<void> {
  // Find the schedule by externalId + task
  const all = await schedules.list({
    perPage: 100,
  });
  const match = all.data.find(
    (s) =>
      s.task === TASK_ID &&
      s.externalId === args.teacherId,
  );
  if (match) await schedules.deactivate(match.id);
}
