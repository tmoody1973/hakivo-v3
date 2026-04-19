"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Lightweight "your packet is generating" banner shown when /teacher
 * receives ?packetRun=<runId>. Auto-refreshes the route every 8s for
 * 3 minutes so the new packet appears in the dashboard without the
 * user having to manually reload.
 *
 * Doesn't poll Trigger.dev directly — server components re-fetch
 * Convex on each refresh, so a Convex packets.listByTeacher cache
 * miss is the cheapest way to surface the new row.
 */

const POLL_INTERVAL_MS = 8_000;
const MAX_POLL_MS = 180_000;

export function GeneratingBanner({ runId }: { runId: string }) {
  const router = useRouter();
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const start = Date.now();
    const tick = setInterval(() => {
      const elapsed = Date.now() - start;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_POLL_MS) {
        clearInterval(tick);
        return;
      }
      router.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(tick);
  }, [router]);

  const seconds = Math.floor(elapsedMs / 1000);
  const stopped = elapsedMs >= MAX_POLL_MS;

  return (
    <div className="flex items-center justify-between rounded-lg border border-accent bg-accent/5 px-4 py-3 text-sm">
      <div>
        <p className="font-medium text-ink">
          Your custom packet is generating…
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          Bias-check → audio (~30s) → PDF → email. Total ~90s. Run{" "}
          <code className="font-mono text-[11px]">{runId.slice(0, 18)}…</code>
          {stopped
            ? " · still working — refresh manually"
            : ` · ${seconds}s elapsed, auto-refreshing every 8s`}
        </p>
      </div>
      <button
        type="button"
        onClick={() => router.refresh()}
        className="rounded-lg border border-ink bg-white px-3 py-1.5 text-xs font-medium text-ink hover:bg-cream"
      >
        Refresh now
      </button>
    </div>
  );
}
