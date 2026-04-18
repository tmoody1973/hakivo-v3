import { api } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import { ReviewCard } from "../_components/review-card";

export default async function ReviewQueuePage() {
  const pending = await fetchQuery(api.packets.listPendingReview, { limit: 50 });

  const byTeacherId = new Map<string, string>();
  await Promise.all(
    Array.from(new Set(pending.map((p) => p.teacherId))).map(async (id) => {
      const t = await fetchQuery(api.teachers.getById, { id });
      if (t) byTeacherId.set(id, t.name);
    }),
  );

  return (
    <div className="space-y-8">
      <header>
        <p className="text-xs font-semibold tracking-[0.28em] text-ink-muted">
          REVIEW QUEUE
        </p>
        <h1 className="mt-4 font-serif text-4xl leading-tight">
          {pending.length === 0
            ? "Queue is empty."
            : `${pending.length} packet${pending.length > 1 ? "s" : ""} need${pending.length === 1 ? "s" : ""} your review.`}
        </h1>
        {pending.length > 0 ? (
          <p className="mt-3 max-w-2xl text-ink-muted">
            These packets failed one or more bias-check criteria and are
            holding delivery. Approve to ship as-is, or reject to mark
            failed and prevent delivery.
          </p>
        ) : (
          <p className="mt-3 max-w-2xl text-ink-muted">
            All recent packets passed the auto bias check. Nothing for you
            to review right now — check back after the 5am delivery window.
          </p>
        )}
      </header>

      {pending.length > 0 ? (
        <section className="space-y-6">
          {pending.map((packet) => (
            <ReviewCard
              key={packet._id}
              packet={{
                ...packet,
                teacherName: byTeacherId.get(packet.teacherId) ?? "(unknown)",
              }}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}
