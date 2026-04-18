"use server";

import { auth } from "@clerk/nextjs/server";
import { api, type Id } from "@hakivo/db";
import { fetchMutation } from "convex/nextjs";
import { revalidatePath } from "next/cache";
import { isAdmin } from "@/lib/auth/admin";

export type ReviewDecision = "approve" | "reject";

type ActionState = { error: string } | { ok: true } | null;

export async function reviewPacket(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const { userId } = await auth();
  if (!userId) return { error: "Not signed in." };
  if (!isAdmin(userId)) return { error: "Not authorized." };

  const packetId = formData.get("packetId") as string | null;
  const decision = formData.get("decision") as string | null;
  const note = (formData.get("note") as string | null)?.trim() || undefined;

  if (!packetId) return { error: "Missing packetId." };
  if (decision !== "approve" && decision !== "reject") {
    return { error: "Decision must be approve or reject." };
  }

  await fetchMutation(api.packets.humanReview, {
    id: packetId as Id<"packets">,
    decision,
    reviewerId: userId,
    ...(note !== undefined && { note }),
  });

  revalidatePath("/admin/review");
  return { ok: true };
}
