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

export default async function PersonalHistory() {
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  if (!token) redirect("/sign-in");

  const me = await fetchQuery(api.teachers.getMe, {}, { token });
  if (!me) redirect("/teacher/onboarding");

  const packets = await fetchQuery(api.packets.listByTeacher, {
    teacherId: me._id,
    limit: 50,
  });

  return (
    <section>
      <p className="text-xs font-semibold tracking-[0.28em] text-ink-muted">
        BRIEF HISTORY
      </p>
      <h1 className="mt-3 font-serif text-3xl leading-tight">
        Everything you've received.
      </h1>

      {packets.length === 0 ? (
        <p className="mt-8 text-sm text-ink-muted">No briefs yet.</p>
      ) : (
        <ul className="mt-8 divide-y divide-rule rounded-lg border border-rule bg-white/40">
          {packets.map((p) => (
            <li key={p._id} className="px-5 py-4">
              <Link
                href={`/personal/packets/${p._id}`}
                className="block hover:bg-white/60"
              >
                <p className="text-xs text-ink-muted">
                  {formatLongDate(p.packetDate)}
                </p>
                <p className="mt-1 text-base text-ink">{packetHeadline(p)}</p>
                {p.audioDurationSec ? (
                  <p className="mt-1 text-xs text-ink-muted">
                    {Math.floor(p.audioDurationSec / 60)}:
                    {Math.round(p.audioDurationSec % 60)
                      .toString()
                      .padStart(2, "0")}{" "}
                    audio
                  </p>
                ) : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
