import type { Doc } from "@hakivo/db";

function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

function deriveHeadline(packet: Doc<"packets">): string {
  const first = packet.teacherBrief.split(/\n+/)[0]?.slice(0, 140);
  return first ?? "Today's packet";
}

export function FeaturedPacket({ packet }: { packet: Doc<"packets"> | null }) {
  if (!packet) {
    return (
      <section
        aria-labelledby="todays-packet"
        className="rounded-lg border border-rule bg-white/40 p-8 md:p-10"
      >
        <h1 id="todays-packet" className="font-serif text-3xl text-ink">
          Today&apos;s Packet
        </h1>
        <p className="mt-4 text-ink-muted">
          Your first packet arrives at 5am tomorrow. Once it lands, this space
          fills with your daily brief, discussion questions, and exit ticket.
        </p>
      </section>
    );
  }

  const headline = deriveHeadline(packet);
  const paragraphs = packet.teacherBrief.split(/\n\n+/).slice(0, 2);

  return (
    <section
      aria-labelledby="todays-packet"
      className="rounded-lg border border-rule bg-white/40 p-6 md:p-10"
    >
      <div className="flex items-baseline justify-between">
        <h1 id="todays-packet" className="font-serif text-2xl text-ink md:text-3xl">
          Today&apos;s Packet
        </h1>
        <time className="text-xs text-ink-muted" dateTime={packet.packetDate}>
          {formatDate(packet.packetDate)}
        </time>
      </div>

      <h2 className="mt-6 font-serif text-2xl leading-tight text-ink md:text-3xl">
        {headline}
      </h2>

      <div className="mt-5 space-y-4 text-sm leading-relaxed text-ink-muted md:text-base">
        {paragraphs.map((p, i) => (
          <p key={i}>{p}</p>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled
          className="inline-flex min-h-[44px] items-center gap-2 rounded-lg border border-rule px-4 py-2 text-sm text-ink-muted opacity-60"
          aria-label="Play audio briefing (coming soon)"
        >
          <span aria-hidden className="flex size-5 items-center justify-center rounded-full bg-ink text-cream">
            ▶
          </span>
          Play Audio
        </button>
        <button
          type="button"
          disabled
          className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-5 py-2 text-sm font-medium text-cream opacity-60"
          aria-label="Push to Google Classroom (coming soon)"
        >
          Push to Classroom
        </button>
        <span className="text-xs text-ink-muted">
          {packet.status === "review" ? "In review — delivery gated on bias check" : packet.status}
        </span>
      </div>

      <details className="mt-10 border-t border-rule pt-6 text-sm">
        <summary className="cursor-pointer font-semibold tracking-[0.14em] text-ink-muted uppercase">
          Discussion Questions ({packet.discussionQuestions.length})
        </summary>
        <ol className="mt-4 space-y-3 pl-4 text-ink">
          {packet.discussionQuestions.map((q, i) => (
            <li key={i} className="list-decimal">
              {q}
            </li>
          ))}
        </ol>
      </details>

      <details className="mt-4 border-t border-rule pt-6 text-sm">
        <summary className="cursor-pointer font-semibold tracking-[0.14em] text-ink-muted uppercase">
          Exit Ticket ({packet.exitTicket.questions.length})
        </summary>
        <ol className="mt-4 space-y-4 pl-4 text-ink">
          {packet.exitTicket.questions.map((q, i) => (
            <li key={i} className="list-decimal">
              <div className="font-medium">{q.prompt}</div>
              <div className="mt-1 text-xs uppercase tracking-wider text-ink-muted">
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
            </li>
          ))}
        </ol>
      </details>

      <details className="mt-4 border-t border-rule pt-6 text-sm">
        <summary className="cursor-pointer font-semibold tracking-[0.14em] text-ink-muted uppercase">
          Primary Sources ({packet.primarySources.length})
        </summary>
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
              <p className="mt-1 text-xs text-ink-muted">&ldquo;{s.excerpt}&rdquo;</p>
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}
