import { logger, task } from "@trigger.dev/sdk";
import { api, type Id } from "@hakivo/db";
import { ConvexHttpClient } from "convex/browser";
import {
  createAnnouncement,
  loadGoogleOAuthCredsFromEnv,
  refreshAccessToken,
} from "../integrations/google-classroom";

/**
 * Push a packet to a teacher's Google Classroom course as an announcement.
 *
 * Triggered manually by the teacher (button in email + settings UI),
 * NOT auto-chained from the packet pipeline. Marissa's interview was
 * clear that teachers want control over what lands in their classroom
 * stream — auto-push is a v1.1 opt-in feature.
 *
 * Idempotency via packetClassroomPushes ledger keyed (teacherId, packetId)
 * — same pattern as packetDeliveries. Double-clicks and retries are safe.
 */

export type PushToClassroomPayload = {
  readonly packetId: Id<"packets">;
  readonly teacherId: Id<"teachers">;
};

export type PushToClassroomResult = {
  readonly packetId: string;
  readonly status: "pushed" | "skipped_duplicate" | "no_course" | "no_token";
  readonly classroomAnnouncementId?: string;
  readonly classroomAlternateLink?: string;
};

export const pushToClassroom = task({
  id: "push-to-classroom",
  maxDuration: 60,
  retry: {
    maxAttempts: 3,
    factor: 2,
    minTimeoutInMs: 3_000,
    maxTimeoutInMs: 30_000,
    randomize: true,
  },
  run: async (
    payload: PushToClassroomPayload,
  ): Promise<PushToClassroomResult> => {
    const convexUrl =
      process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
    if (!convexUrl) throw new Error("CONVEX_URL not set");

    const convex = new ConvexHttpClient(convexUrl);
    const [packet, teacher] = await Promise.all([
      convex.query(api.packets.getById, { id: payload.packetId }),
      convex.query(api.teachers.getById, { id: payload.teacherId }),
    ]);
    if (!packet) throw new Error(`Packet ${payload.packetId} not found`);
    if (!teacher) throw new Error(`Teacher ${payload.teacherId} not found`);

    if (!teacher.classroomRefreshToken) {
      logger.warn(`Teacher ${teacher._id} has no classroom refresh token`);
      return { packetId: payload.packetId, status: "no_token" };
    }
    if (!teacher.classroomCourseId) {
      logger.warn(`Teacher ${teacher._id} has no default classroom course`);
      return { packetId: payload.packetId, status: "no_course" };
    }

    const ledger = await convex.mutation(
      api.packetClassroomPushes.startPush,
      {
        orgId: packet.orgId,
        teacherId: teacher._id,
        packetId: payload.packetId,
        courseId: teacher.classroomCourseId,
      },
    );
    if (ledger.existed && ledger.status === "pushed") {
      logger.log(
        `Packet ${payload.packetId} already pushed to classroom for teacher ${teacher._id}`,
      );
      return { packetId: payload.packetId, status: "skipped_duplicate" };
    }

    try {
      const creds = loadGoogleOAuthCredsFromEnv();
      const { accessToken } = await refreshAccessToken(
        creds,
        teacher.classroomRefreshToken,
      );

      const text = buildAnnouncementText(packet);
      const materials: Array<{
        link: { url: string; title?: string };
      }> = [];
      if (packet.pdfUrl) {
        materials.push({
          link: { url: packet.pdfUrl, title: "Print handout (PDF)" },
        });
      }
      if (packet.audioUrl) {
        materials.push({
          link: { url: packet.audioUrl, title: "Audio briefing" },
        });
      }

      const announcement = await createAnnouncement(accessToken, {
        courseId: teacher.classroomCourseId,
        text,
        ...(materials.length > 0 && { materials }),
      });

      await convex.mutation(api.packetClassroomPushes.markPushed, {
        id: ledger.id,
        classroomAnnouncementId: announcement.id,
        classroomAlternateLink: announcement.alternateLink,
      });

      logger.log(
        `Pushed packet ${payload.packetId} → classroom course ${teacher.classroomCourseId} (announcement ${announcement.id})`,
      );

      return {
        packetId: payload.packetId,
        status: "pushed",
        classroomAnnouncementId: announcement.id,
        classroomAlternateLink: announcement.alternateLink,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await convex.mutation(api.packetClassroomPushes.markFailed, {
        id: ledger.id,
        error: message,
      });
      throw err;
    }
  },
});

function buildAnnouncementText(packet: {
  readonly packetDate: string;
  readonly teacherBrief: string;
  readonly discussionQuestions: ReadonlyArray<string>;
}): string {
  const headline = packet.teacherBrief
    .split(/\n+/)[0]
    ?.slice(0, 200) ?? "Today's Hakivo packet";
  const topQuestions = packet.discussionQuestions
    .slice(0, 3)
    .map((q, i) => `${i + 1}. ${q}`)
    .join("\n");
  return [
    `📜 Hakivo Packet — ${formatLongDate(packet.packetDate)}`,
    "",
    headline,
    "",
    "Today's discussion questions:",
    topQuestions,
    "",
    "Full handout (PDF) and audio briefing attached below.",
  ]
    .filter(Boolean)
    .join("\n");
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}
