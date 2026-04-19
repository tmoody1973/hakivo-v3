"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { Doc } from "@hakivo/db";

type Hit = { bill: Doc<"bills">; score?: number };
type SearchState = { query: string; mode: "keyword" | "semantic"; hits: Hit[] } | null;

async function runSearch(
  _prev: SearchState,
  formData: FormData,
): Promise<SearchState> {
  const query = (formData.get("query") as string | null)?.trim() ?? "";
  const mode = (formData.get("mode") as string | null) === "keyword" ? "keyword" : "semantic";
  const jurisdictionRaw = (formData.get("jurisdiction") as string | null) ?? "";
  if (!query) return null;
  const { searchBills } = await import("@/lib/actions/search-bills");
  const result = await searchBills(query, {
    mode,
    ...(jurisdictionRaw && { jurisdiction: jurisdictionRaw }),
  });
  return { query, mode: result.mode, hits: [...result.hits] };
}

export function SearchForm({ initialMode = "semantic" }: { initialMode?: "keyword" | "semantic" }) {
  const [state, formAction, isPending] = useActionState(runSearch, null);

  return (
    <div className="space-y-8">
      <form action={formAction} className="flex flex-col gap-3 md:flex-row md:items-center">
        <input
          type="text"
          name="query"
          required
          placeholder='e.g., "voting rights" or "H.R. 27"'
          className="flex-1 rounded-md border border-rule bg-white px-4 py-3 text-sm focus-visible:border-accent"
        />
        <select
          name="jurisdiction"
          defaultValue=""
          className="rounded-md border border-rule bg-white px-3 py-3 text-sm"
          title="Filter by jurisdiction"
        >
          <option value="">All</option>
          <option value="federal">Federal</option>
          <option value="state">All states</option>
          <option value="WI">Wisconsin</option>
        </select>
        <select
          name="mode"
          defaultValue={initialMode}
          className="rounded-md border border-rule bg-white px-3 py-3 text-sm"
        >
          <option value="semantic">Semantic</option>
          <option value="keyword">Keyword</option>
        </select>
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-accent px-6 text-sm font-medium text-cream hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Searching…" : "Search"}
        </button>
      </form>

      {state ? (
        <ResultsList
          query={state.query}
          mode={state.mode}
          hits={state.hits}
        />
      ) : (
        <p className="text-sm text-ink-muted">
          Search semantically (concepts, topics) or by keyword (bill IDs,
          exact phrases).{" "}
          <span className="text-xs">
            Semantic mode embeds your query and matches against ~1,500 currently
            enriched bills. Keyword mode runs across all 14,995 bill titles.
          </span>
        </p>
      )}
    </div>
  );
}

function ResultsList({
  query,
  mode,
  hits,
}: {
  query: string;
  mode: "keyword" | "semantic";
  hits: Hit[];
}) {
  if (hits.length === 0) {
    return (
      <p className="rounded-lg border border-rule bg-white/40 p-6 text-sm text-ink-muted">
        No matches for &ldquo;{query}&rdquo; in {mode} mode. Try the other mode
        or a broader query.
      </p>
    );
  }
  return (
    <section>
      <p className="text-xs uppercase tracking-[0.14em] text-ink-muted">
        {hits.length} result{hits.length === 1 ? "" : "s"} · {mode}
      </p>
      <ul className="mt-4 divide-y divide-rule rounded-lg border border-rule bg-white/40">
        {hits.map(({ bill, score }) => (
          <li key={bill._id} className="p-4">
            <Link
              href={`/teacher/bills/${bill.congressNumber}-${bill.billType}-${bill.billNumber}`}
              className="block hover:bg-white/60"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="font-medium text-ink">
                  <span
                    className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
                      bill.state
                        ? "bg-accent/10 text-accent"
                        : "bg-ink/10 text-ink-muted"
                    }`}
                  >
                    {bill.state ?? "FED"}
                  </span>
                  {bill.billType.toUpperCase()} {bill.billNumber}
                  <span className="ml-2 text-xs text-ink-muted">
                    · {new Date(bill.latestActionDate).toLocaleDateString()}
                  </span>
                  {bill.embedding ? (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-accent">
                      enriched
                    </span>
                  ) : null}
                </h3>
                {score !== undefined ? (
                  <span className="font-mono text-xs text-ink-muted">
                    {score.toFixed(3)}
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-ink">{bill.title}</p>
              {bill.latestAction ? (
                <p className="mt-1 text-xs text-ink-muted">
                  {bill.latestAction.slice(0, 140)}
                </p>
              ) : null}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
