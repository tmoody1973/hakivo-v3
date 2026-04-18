import type { Doc } from "@hakivo/db";

function formatShort(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function shortHeadline(p: Doc<"packets">): string {
  const first = p.teacherBrief.split(/\n+/)[0] ?? "";
  const trimmed = first.replace(/^[^A-Za-z0-9"']*/, "");
  return trimmed.slice(0, 72) + (trimmed.length > 72 ? "…" : "");
}

export function PacketHistory({ packets }: { packets: readonly Doc<"packets">[] }) {
  if (packets.length === 0) {
    return (
      <section
        aria-labelledby="history"
        className="rounded-lg border border-rule bg-white/40 p-6"
      >
        <h2 id="history" className="font-semibold tracking-[0.14em] text-ink-muted uppercase text-xs">
          Last 7 Packets
        </h2>
        <p className="mt-4 text-sm text-ink-muted">
          Your first packet arrives tomorrow at 5am. History fills in as packets deliver.
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="history"
      className="rounded-lg border border-rule bg-white/40 p-6"
    >
      <div className="flex items-baseline justify-between">
        <h2 id="history" className="font-semibold tracking-[0.14em] text-ink-muted uppercase text-xs">
          Last {Math.min(7, packets.length)} Packets
        </h2>
      </div>
      <ul className="mt-4 divide-y divide-rule">
        {packets.slice(0, 7).map((p) => (
          <li key={p._id} className="flex items-center justify-between py-3">
            <div className="flex items-baseline gap-4">
              <time className="w-16 shrink-0 text-xs text-ink-muted" dateTime={p.packetDate}>
                {formatShort(p.packetDate)}
              </time>
              <span className="text-sm text-ink">{shortHeadline(p)}</span>
            </div>
            <div className="flex items-center gap-2" aria-label="Feedback (not yet implemented)">
              <button
                type="button"
                disabled
                aria-label="Thumbs up"
                className="size-7 rounded-full border border-rule text-ink-muted opacity-40"
              >
                ↑
              </button>
              <button
                type="button"
                disabled
                aria-label="Thumbs down"
                className="size-7 rounded-full border border-rule text-ink-muted opacity-40"
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
