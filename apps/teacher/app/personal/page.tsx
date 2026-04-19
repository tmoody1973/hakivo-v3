import { auth } from "@clerk/nextjs/server";
import { api } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";

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

export default async function PersonalDashboard() {
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) redirect("/sign-in");

  const me = await fetchQuery(api.teachers.getMe, {}, { token });
  if (!me) redirect("/teacher/onboarding");

  const packets = await fetchQuery(api.packets.listByTeacher, {
    teacherId: me._id,
    limit: 8,
  });

  const featured = packets[0] ?? null;
  const rest = packets.slice(1);

  return (
    <div className="space-y-10">
      <header>
        <p className="text-xs font-semibold tracking-[0.28em] text-ink-muted">
          DAILY BRIEF
        </p>
        <h1 className="mt-3 font-serif text-3xl leading-tight md:text-4xl">
          {featured ? packetHeadline(featured) : "Your daily brief is on its way."}
        </h1>
        {featured && (
          <p className="mt-2 text-xs text-ink-muted">
            {formatLongDate(featured.packetDate)}
            {featured.audioDurationSec
              ? ` · ${formatDuration(featured.audioDurationSec)} audio`
              : ""}
          </p>
        )}
      </header>

      {!featured && (
        <section className="rounded-lg border border-rule bg-white/40 p-6">
          <p className="text-sm text-ink-muted">
            No briefs yet. The next one runs at the top of the next cycle —
            usually overnight.
          </p>
        </section>
      )}

      {featured && (
        <section className="rounded-lg border border-rule bg-cream p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Today's brief
          </p>
          {featured.audioUrl && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-ink-muted">
                Two-host audio briefing
                {featured.audioDurationSec
                  ? ` · ${formatDuration(featured.audioDurationSec)}`
                  : ""}
              </p>
              <audio
                controls
                preload="metadata"
                src={featured.audioUrl}
                className="w-full"
              >
                <a href={featured.audioUrl} className="underline">
                  Download audio
                </a>
              </audio>
            </div>
          )}
          {featured.pdfUrl && (
            <div className="mt-4">
              <a
                href={featured.pdfUrl}
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

      {featured && (
        <section className="rounded-lg border border-rule bg-white/40 p-6 md:p-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            The brief
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-ink">
            {featured.teacherBrief.split(/\n\n+/).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <p className="mt-6">
            <Link
              href={`/personal/packets/${featured._id}`}
              className="text-sm text-accent hover:text-ink"
            >
              See the full brief, sources, and questions to ponder →
            </Link>
          </p>
        </section>
      )}

      {rest.length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Earlier briefs
          </h2>
          <ul className="mt-4 divide-y divide-rule rounded-lg border border-rule bg-white/40">
            {rest.map((p) => (
              <li key={p._id} className="px-5 py-3">
                <Link
                  href={`/personal/packets/${p._id}`}
                  className="block hover:bg-white/60"
                >
                  <p className="text-xs text-ink-muted">
                    {formatLongDate(p.packetDate)}
                  </p>
                  <p className="mt-1 text-sm text-ink">{packetHeadline(p)}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
