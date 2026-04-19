import { auth } from "@clerk/nextjs/server";
import { api, type Id } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

function packetHeadline(packet: {
  readonly headline?: string;
  readonly teacherBrief: string;
}): string {
  if (packet.headline && packet.headline.trim()) return packet.headline.trim();
  const firstPara = packet.teacherBrief.split(/\n+/)[0] ?? "";
  const sentenceMatch = firstPara.match(/^[^.!?]+[.!?]/);
  if (sentenceMatch && sentenceMatch[0].length <= 160) {
    return sentenceMatch[0].trim();
  }
  if (firstPara.length <= 160) return firstPara.trim();
  const sliced = firstPara.slice(0, 160);
  const lastSpace = sliced.lastIndexOf(" ");
  const stem = lastSpace > 0 ? sliced.slice(0, lastSpace) : sliced;
  return `${stem.replace(/[\s,;:]+$/, "")}…`;
}

function formatDuration(seconds: number | undefined): string {
  if (!seconds || seconds <= 0) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default async function PersonalPacketDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^[a-z][a-z0-9]{30,}$/i.test(id)) notFound();

  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) redirect("/sign-in");

  const packet = await fetchQuery(
    api.packets.getById,
    { id: id as Id<"packets"> },
    { token },
  );
  if (!packet) notFound();

  return (
    <article className="space-y-8">
      <header>
        <Link
          href="/personal"
          className="text-xs text-ink-muted hover:text-ink"
        >
          ← Back to brief
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.28em] text-ink-muted">
          {formatLongDate(packet.packetDate)}
        </p>
        <h1 className="mt-3 font-serif text-3xl leading-tight md:text-4xl">
          {packetHeadline(packet)}
        </h1>
      </header>

      {(packet.audioUrl || packet.pdfUrl) && (
        <section className="rounded-lg border border-rule bg-cream p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Today's brief
          </p>
          {packet.audioUrl && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-ink-muted">
                Two-host audio briefing
                {packet.audioDurationSec
                  ? ` · ${formatDuration(packet.audioDurationSec)}`
                  : ""}
              </p>
              <audio
                controls
                preload="metadata"
                src={packet.audioUrl}
                className="w-full"
              >
                <a href={packet.audioUrl} className="underline">
                  Download audio
                </a>
              </audio>
            </div>
          )}
          {packet.pdfUrl && (
            <div className="mt-4">
              <a
                href={packet.pdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block rounded-lg border border-ink bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream"
              >
                ⬇ Read as PDF
              </a>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-rule bg-white/40 p-6 md:p-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          The brief
        </h2>
        <div className="mt-4 space-y-4 leading-relaxed text-ink">
          {packet.teacherBrief.split(/\n\n+/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-rule bg-white/40 p-6 md:p-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Questions to ponder
        </h2>
        <ol className="mt-4 space-y-3 pl-5 text-ink">
          {packet.discussionQuestions.map((q, i) => (
            <li key={i} className="list-decimal">
              {q}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-lg border border-rule bg-white/40 p-6 md:p-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Primary sources ({packet.primarySources.length})
        </h2>
        <ul className="mt-4 space-y-4 text-ink">
          {packet.primarySources.map((s, i) => (
            <li key={i}>
              <a
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent hover:text-ink"
              >
                {s.label}
              </a>
              {s.excerpt && (
                <p className="mt-1 text-sm italic text-ink-muted">
                  &ldquo;{s.excerpt.slice(0, 280)}&rdquo;
                </p>
              )}
            </li>
          ))}
        </ul>
      </section>
    </article>
  );
}
