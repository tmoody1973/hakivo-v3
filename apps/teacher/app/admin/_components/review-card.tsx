"use client";

import { useActionState } from "react";
import type { Doc } from "@hakivo/db";
import { reviewPacket } from "@/lib/actions/admin-review";

const CRITERIA: ReadonlyArray<{
  key:
    | "factualClaimsOnly"
    | "multiplePerspectives"
    | "openEndedQuestions"
    | "languageNeutrality"
    | "primarySourceAttribution";
  label: string;
  threshold: number;
}> = [
  { key: "factualClaimsOnly", label: "Factual claims only", threshold: 7 },
  { key: "multiplePerspectives", label: "Multiple perspectives", threshold: 7 },
  { key: "openEndedQuestions", label: "Open-ended questions", threshold: 8 },
  { key: "languageNeutrality", label: "Language neutrality", threshold: 8 },
  {
    key: "primarySourceAttribution",
    label: "Primary source attribution",
    threshold: 9,
  },
];

type Packet = Doc<"packets"> & { teacherName: string };

export function ReviewCard({ packet }: { packet: Packet }) {
  const [state, formAction, isPending] = useActionState(reviewPacket, null);
  const q = packet.qualityChecks;
  const subScores = q.biasSubScores;

  return (
    <article className="rounded-lg border border-rule bg-white/40 p-6 md:p-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
            {packet.packetDate} · {packet.teacherName}
          </p>
          <h2 className="mt-2 font-serif text-2xl leading-tight text-ink">
            {(packet.teacherBrief.split(/\n+/)[0] ?? "Packet").slice(0, 120)}
          </h2>
        </div>
        <ScoreBadge score={q.biasScore} ok={q.biasScoreOk} />
      </header>

      {q.biasReviewNotes ? (
        <p className="mt-4 rounded-md border border-rule bg-cream p-3 text-sm text-ink">
          <span className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Reviewer note ({q.biasProvider ?? "auto"})
          </span>
          <span className="mt-1 block">{q.biasReviewNotes}</span>
        </p>
      ) : null}

      {subScores ? (
        <dl className="mt-6 grid grid-cols-1 gap-x-6 gap-y-2 text-sm md:grid-cols-5">
          {CRITERIA.map(({ key, label, threshold }) => {
            const score = subScores[key];
            const pass = score >= threshold;
            return (
              <div
                key={key}
                className={`rounded border px-3 py-2 ${pass ? "border-rule bg-white/40" : "border-ink bg-cream"}`}
              >
                <dt className="text-[10px] font-medium uppercase tracking-wider text-ink-muted">
                  {label}
                </dt>
                <dd className="mt-1 font-mono text-ink">
                  {score}
                  <span className="ml-1 text-xs text-ink-muted">
                    / {threshold}
                  </span>
                </dd>
              </div>
            );
          })}
        </dl>
      ) : null}

      <details className="mt-6 border-t border-rule pt-4 text-sm">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Full brief ({packet.teacherBrief.split(/\s+/).length} words)
        </summary>
        <div className="mt-4 space-y-3 leading-relaxed text-ink">
          {packet.teacherBrief.split(/\n\n+/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </details>

      <details className="mt-2 border-t border-rule pt-4 text-sm">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Discussion questions
        </summary>
        <ol className="mt-4 space-y-2 pl-4 text-ink">
          {packet.discussionQuestions.map((q, i) => (
            <li key={i} className="list-decimal">
              {q}
            </li>
          ))}
        </ol>
      </details>

      <details className="mt-2 border-t border-rule pt-4 text-sm">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Primary sources
        </summary>
        <ul className="mt-4 space-y-2 text-ink">
          {packet.primarySources.map((s, i) => (
            <li key={i}>
              <a
                href={s.url}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-2 hover:text-accent"
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </details>

      <form action={formAction} className="mt-8 border-t border-rule pt-6">
        <input type="hidden" name="packetId" value={packet._id} />
        <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Reviewer note (optional)
        </label>
        <textarea
          name="note"
          rows={2}
          placeholder="Why you approved or rejected — visible to the team, not the teacher"
          className="mt-2 block w-full rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:border-accent"
        />
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            name="decision"
            value="approve"
            disabled={isPending}
            className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-6 py-2 text-sm font-medium text-cream hover:bg-accent-hover disabled:opacity-60"
          >
            {isPending ? "Saving…" : "Approve & deliver"}
          </button>
          <button
            type="submit"
            name="decision"
            value="reject"
            disabled={isPending}
            className="inline-flex min-h-[44px] items-center rounded-lg border border-ink px-6 py-2 text-sm font-medium text-ink hover:bg-ink hover:text-cream disabled:opacity-60"
          >
            Reject
          </button>
          {state && "error" in state ? (
            <span className="text-sm text-ink">{state.error}</span>
          ) : state && "ok" in state ? (
            <span className="text-sm text-ink-muted">Saved.</span>
          ) : null}
        </div>
      </form>
    </article>
  );
}

function ScoreBadge({ score, ok }: { score: number; ok: boolean }) {
  return (
    <div
      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 font-mono text-sm ${
        ok ? "border-accent text-accent" : "border-ink text-ink"
      }`}
    >
      <span className="text-[10px] font-semibold uppercase tracking-wider">
        Overall
      </span>
      <span>{score}/10</span>
    </div>
  );
}
