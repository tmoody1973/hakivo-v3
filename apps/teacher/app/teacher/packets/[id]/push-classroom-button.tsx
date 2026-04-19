"use client";

import { useState } from "react";
import Link from "next/link";
import type { Id } from "@hakivo/db";

export function PushClassroomButton(props: {
  readonly packetId: Id<"packets">;
  readonly connected: boolean;
  readonly hasCourse: boolean;
  readonly courseName: string | null;
  readonly alreadyPushedLink: string | null;
}) {
  const [pushing, setPushing] = useState(false);
  const [pushedLink, setPushedLink] = useState<string | null>(
    props.alreadyPushedLink,
  );
  const [error, setError] = useState<string | null>(null);

  if (!props.connected || !props.hasCourse) {
    return (
      <Link
        href="/teacher/settings/classroom"
        className="text-xs text-ink-muted underline hover:text-ink"
      >
        Connect Google Classroom →
      </Link>
    );
  }

  if (pushedLink) {
    return (
      <a
        href={pushedLink}
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-accent underline hover:text-ink"
      >
        ✓ Pushed to {props.courseName ?? "Classroom"} — view post
      </a>
    );
  }

  const onPush = async () => {
    setPushing(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/packet/${props.packetId}/push-classroom`,
        { method: "POST" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Trigger task fires async — show optimistic state. The user can
      // refresh to see the alternateLink once the ledger updates.
      setPushedLink("pending");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPushing(false);
    }
  };

  if (pushedLink === "pending") {
    return (
      <span className="text-xs text-ink-muted">
        Pushing to {props.courseName ?? "Classroom"}…
      </span>
    );
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={onPush}
        disabled={pushing}
        className="rounded-lg border border-ink bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream disabled:opacity-50"
      >
        {pushing ? "Pushing…" : `Push to ${props.courseName ?? "Classroom"}`}
      </button>
      {error && <span className="text-xs text-ink-muted">{error}</span>}
    </div>
  );
}
