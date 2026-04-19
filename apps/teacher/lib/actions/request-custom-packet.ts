"use server";

import { auth } from "@clerk/nextjs/server";
import { api, type Id } from "@hakivo/db";
import { tasks } from "@trigger.dev/sdk";
import { fetchQuery } from "convex/nextjs";
import { redirect } from "next/navigation";

type RequestState = { error: string } | { ok: true; runId: string } | null;

const DAILY_QUOTA = 5;

/**
 * Fire a teacher-requested custom packet. Enforces the 5/day quota,
 * parses bill references, kicks off generatePacket via Trigger.dev,
 * redirects the teacher to /teacher while the packet generates in the
 * background. Generation takes ~30s, so the packet appears in history
 * shortly after redirect (refresh to see).
 */
export async function requestCustomPacket(
  _prev: RequestState,
  formData: FormData,
): Promise<RequestState> {
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) return { error: "Sign-in required." };

  const teacher = await fetchQuery(api.teachers.getMe, {}, { token });
  if (!teacher) return { error: "Not onboarded." };

  const topic = (formData.get("topic") as string | null)?.trim() || undefined;
  const billRefsRaw = (formData.get("billRefs") as string | null)?.trim() ?? "";
  const readingLevel =
    (formData.get("readingLevel") as string | null)?.trim() || undefined;
  const dateRaw = (formData.get("packetDate") as string | null)?.trim();
  const packetDate = dateRaw && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
    ? dateRaw
    : new Date().toISOString().slice(0, 10);

  const targetBillRefs = parseBillRefs(billRefsRaw);

  if (!topic && targetBillRefs.length === 0) {
    return {
      error:
        "Give me something to work with — either a topic or one or more bills (e.g., H.R. 27).",
    };
  }

  // Quota check against the target date
  const requestsToday = await fetchQuery(
    api.packets.countTeacherRequestsToday,
    { teacherId: teacher._id, date: packetDate },
    { token },
  );
  if (requestsToday >= DAILY_QUOTA) {
    return {
      error: `Daily custom-packet quota exhausted (${requestsToday}/${DAILY_QUOTA}). Resets at UTC midnight.`,
    };
  }

  const handle = await tasks.trigger("generate-packet", {
    teacherId: teacher._id as Id<"teachers">,
    packetDate,
    requestedBy: "teacher_request" as const,
    ...(topic !== undefined && { customTopic: topic }),
    ...(targetBillRefs.length > 0 && { targetBillRefs }),
    ...(readingLevel !== undefined && { readingLevelOverride: readingLevel }),
  });

  redirect(`/teacher?packetRun=${handle.id}`);
}

/**
 * Parse a comma-separated list of bill identifiers into canonical
 * "congress-type-number" refs. Accepts "H.R. 27", "hr27", "HR 27",
 * "S.J.Res.16", "H.Res. 10" etc. Congress defaults to 119 for v3.0.
 */
function parseBillRefs(raw: string): string[] {
  if (!raw) return [];
  const CONGRESS = 119;
  const parts = raw.split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean);
  const refs: string[] = [];
  for (const p of parts) {
    const normalized = p.replace(/[.\s]/g, "").toLowerCase();
    const match = normalized.match(/^(hr|s|hjres|sjres|hconres|sconres|hres|sres)(\d+)$/);
    if (match) {
      refs.push(`${CONGRESS}-${match[1]}-${match[2]}`);
    }
  }
  return refs;
}
