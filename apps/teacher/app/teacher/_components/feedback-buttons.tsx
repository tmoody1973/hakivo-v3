"use client";

import { useActionState } from "react";
import { submitPacketFeedback } from "@/lib/actions/feedback";

export function FeedbackButtons({
  packetId,
  section = "overall",
  currentRating = null,
}: {
  packetId: string;
  section?: string;
  currentRating?: "up" | "down" | null;
}) {
  const [state, formAction, isPending] = useActionState(
    submitPacketFeedback,
    null,
  );

  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="packetId" value={packetId} />
      <input type="hidden" name="section" value={section} />
      <button
        type="submit"
        name="rating"
        value="up"
        disabled={isPending}
        aria-label="Thumbs up"
        className={`size-8 rounded-full border text-sm transition ${
          currentRating === "up"
            ? "border-accent bg-accent text-cream"
            : "border-rule text-ink-muted hover:text-ink"
        }`}
      >
        ↑
      </button>
      <button
        type="submit"
        name="rating"
        value="down"
        disabled={isPending}
        aria-label="Thumbs down"
        className={`size-8 rounded-full border text-sm transition ${
          currentRating === "down"
            ? "border-ink bg-ink text-cream"
            : "border-rule text-ink-muted hover:text-ink"
        }`}
      >
        ↓
      </button>
      {state && "error" in state ? (
        <span className="text-xs text-ink-muted">{state.error}</span>
      ) : null}
    </form>
  );
}
