import { auth } from "@clerk/nextjs/server";
import { api, type Id } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { FeedbackButtons } from "../../_components/feedback-buttons";
import { PushClassroomButton } from "./push-classroom-button";

/**
 * Smart headline: prefer the dedicated `headline` field set by the
 * brief generator, fall back to first complete sentence or
 * word-boundary truncation of the brief for legacy packets.
 */
function packetHeadline(packet: {
  readonly headline?: string;
  readonly teacherBrief: string;
}): string {
  if (packet.headline && packet.headline.trim()) {
    return packet.headline.trim();
  }
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

function formatDate(iso: string): string {
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

export default async function PacketDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // Convex ids are 32-char alphanumeric starting with a letter. Anything
  // else can't be a real packet — short-circuit to 404 before it hits
  // the Convex validator (which would bubble a 500 to the user).
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

  const myFeedback = await fetchQuery(
    api.feedback.getMineForPacket,
    { packetId: id as Id<"packets"> },
    { token },
  );
  const overallRating =
    myFeedback.find((f) => f.section === "overall")?.rating ?? null;

  const teacher = await fetchQuery(api.teachers.getMe, {}, { token });
  const existingPush = teacher
    ? await fetchQuery(
        api.packetClassroomPushes.getForPacket,
        { teacherId: teacher._id, packetId: id as Id<"packets"> },
        { token },
      )
    : null;

  return (
    <article className="space-y-8">
      <header>
        <Link
          href="/teacher"
          className="text-xs text-ink-muted hover:text-ink"
        >
          ← Back to dashboard
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.28em] text-ink-muted">
          PACKET · {formatDate(packet.packetDate)}
        </p>
        <h1 className="mt-3 font-serif text-3xl leading-tight md:text-4xl">
          {packetHeadline(packet)}
        </h1>
        <div className="mt-4 flex items-center gap-4">
          <span
            className={`text-xs uppercase tracking-wider ${
              packet.status === "delivered"
                ? "text-accent"
                : packet.status === "review"
                  ? "text-ink"
                  : "text-ink-muted"
            }`}
          >
            {packet.status}
          </span>
          <FeedbackButtons
            packetId={packet._id}
            currentRating={overallRating}
          />
          {teacher && (
            <PushClassroomButton
              packetId={packet._id}
              connected={teacher.classroomConnected}
              hasCourse={Boolean(teacher.classroomCourseId)}
              courseName={teacher.classroomCourseName ?? null}
              alreadyPushedLink={
                existingPush?.status === "pushed"
                  ? existingPush.classroomAlternateLink
                  : null
              }
            />
          )}
        </div>
      </header>

      {(packet.audioUrl || packet.pdfUrl) && (
        <section className="rounded-lg border border-rule bg-cream p-5 md:p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Today's packet
          </p>
          {packet.audioUrl && (
            <div className="mt-3">
              <p className="mb-2 text-xs text-ink-muted">
                Two-host briefing
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
                Your browser doesn't support audio playback.{" "}
                <a href={packet.audioUrl} className="underline">
                  Download MP3
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
                ⬇ Print handout (PDF)
              </a>
            </div>
          )}
        </section>
      )}

      <section className="rounded-lg border border-rule bg-white/40 p-6 md:p-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Teacher brief
        </h2>
        <div className="mt-4 space-y-4 leading-relaxed text-ink">
          {packet.teacherBrief.split(/\n\n+/).map((p, i) => (
            <p key={i}>{p}</p>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-rule bg-white/40 p-6 md:p-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Discussion questions ({packet.discussionQuestions.length})
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
          Exit ticket ({packet.exitTicket.questions.length})
        </h2>
        <ol className="mt-4 space-y-5 pl-5 text-ink">
          {packet.exitTicket.questions.map((q, i) => (
            <li key={i} className="list-decimal">
              <div className="font-medium">{q.prompt}</div>
              <div className="mt-1 text-[11px] uppercase tracking-wider text-ink-muted">
                {q.kind.replace("_", " ")}
              </div>
              {q.choices ? (
                <ul className="mt-2 space-y-1 pl-4 text-ink-muted">
                  {q.choices.map((c, j) => (
                    <li key={j} className="list-[lower-alpha]">
                      {c}
                    </li>
                  ))}
                </ul>
              ) : null}
              {q.answerKey ? (
                <p className="mt-2 text-xs text-ink-muted">
                  Answer: {q.answerKey}
                </p>
              ) : null}
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-lg border border-rule bg-white/40 p-6 md:p-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Primary sources ({packet.primarySources.length})
        </h2>
        <ul className="mt-4 space-y-3 text-ink">
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
              <p className="mt-1 text-xs text-ink-muted">
                &ldquo;{s.excerpt}&rdquo;
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-rule bg-white/40 p-6 md:p-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Standards alignment
        </h2>
        <dl className="mt-4 space-y-4 text-sm">
          <div>
            <dt className="text-ink-muted">NCSS C3</dt>
            <dd className="mt-1 space-y-1">
              {packet.standardsAlignment.c3Dimensions.map((s, i) => (
                <p key={i} className="text-ink">
                  {s}
                </p>
              ))}
            </dd>
          </div>
          {packet.standardsAlignment.apCedUnits ? (
            <div>
              <dt className="text-ink-muted">AP US Gov CED</dt>
              <dd className="mt-1 space-y-1">
                {packet.standardsAlignment.apCedUnits.map((s, i) => (
                  <p key={i} className="text-ink">
                    {s}
                  </p>
                ))}
              </dd>
            </div>
          ) : null}
          {packet.standardsAlignment.stateStandards.length > 0 ? (
            <div>
              <dt className="text-ink-muted">State standards</dt>
              <dd className="mt-1 space-y-1">
                {packet.standardsAlignment.stateStandards.map((s, i) => (
                  <p key={i} className="text-ink">
                    {s}
                  </p>
                ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>
    </article>
  );
}
