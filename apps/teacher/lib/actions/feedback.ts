"use server";

import { auth } from "@clerk/nextjs/server";
import { api, type Id } from "@hakivo/db";
import { fetchMutation } from "convex/nextjs";
import { revalidatePath } from "next/cache";

type FeedbackState = { error: string } | { ok: true } | null;

export async function submitPacketFeedback(
  _prev: FeedbackState,
  formData: FormData,
): Promise<FeedbackState> {
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) return { error: "Sign-in required." };

  const packetId = formData.get("packetId") as string | null;
  const section = (formData.get("section") as string | null) ?? "overall";
  const rating = formData.get("rating") as string | null;
  const note = (formData.get("note") as string | null)?.trim() || undefined;

  if (!packetId) return { error: "Missing packet." };
  if (rating !== "up" && rating !== "down") {
    return { error: "Rating must be up or down." };
  }

  await fetchMutation(
    api.feedback.submit,
    {
      packetId: packetId as Id<"packets">,
      section,
      rating,
      ...(note !== undefined && { note }),
    },
    { token },
  );

  revalidatePath("/teacher");
  revalidatePath(`/teacher/packets/${packetId}`);
  return { ok: true };
}
