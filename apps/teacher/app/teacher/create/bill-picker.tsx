"use client";

import { useEffect, useRef, useState } from "react";
import type { Doc } from "@hakivo/db";
import { searchBills } from "@/lib/actions/search-bills";

/**
 * Bill picker for /teacher/create. Two interaction modes:
 *   1. Search-and-pick: type a topic → semantic search shows bills →
 *      click to add to the selection chips.
 *   2. Manual paste: still supported via the chip "Add bill ref" path
 *      (teachers who already know a citation can type "H.R. 5334" and
 *      hit Enter).
 *
 * Selected bills serialize back into the form's `billRefs` hidden input
 * as the same comma-separated string the existing parseBillRefs server
 * action understands. No backend changes needed.
 */

const MAX_BILLS = 6;

type Bill = Doc<"bills">;

type SelectedBill = {
  readonly billRef: string; // canonical "119-hr-5334"
  readonly displayRef: string; // "H.R. 5334"
  readonly title: string;
  readonly latestActionDate: number;
};

function billDisplayRef(bill: Pick<Bill, "billType" | "billNumber">): string {
  const t = bill.billType.toUpperCase();
  // Pretty form for common types: H.R. 27, S. 1552, H.J.Res. 16
  const pretty: Record<string, string> = {
    HR: "H.R.",
    S: "S.",
    HJRES: "H.J.Res.",
    SJRES: "S.J.Res.",
    HCONRES: "H.Con.Res.",
    SCONRES: "S.Con.Res.",
    HRES: "H.Res.",
    SRES: "S.Res.",
  };
  return `${pretty[t] ?? t} ${bill.billNumber}`;
}

function billCanonicalRef(
  bill: Pick<Bill, "congressNumber" | "billType" | "billNumber">,
): string {
  return `${bill.congressNumber}-${bill.billType.toLowerCase()}-${bill.billNumber}`;
}

export function BillPicker(props: {
  readonly value: ReadonlyArray<SelectedBill>;
  readonly onChange: (next: ReadonlyArray<SelectedBill>) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ReadonlyArray<{
    bill: Bill;
    score?: number;
  }> | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);

  // Debounced live search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const text = query.trim();
    if (text.length < 3) {
      setResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      searchBills(text, { limit: 8 })
        .then((res) => {
          if (reqId !== reqIdRef.current) return; // newer query in-flight
          setResults(res.hits);
          setError(null);
        })
        .catch((err) => {
          if (reqId !== reqIdRef.current) return;
          setError(err instanceof Error ? err.message : String(err));
          setResults([]);
        })
        .finally(() => {
          if (reqId === reqIdRef.current) setSearching(false);
        });
    }, 350);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const selectedRefs = new Set(props.value.map((b) => b.billRef));
  const atCap = props.value.length >= MAX_BILLS;

  const addBill = (bill: Bill) => {
    if (atCap) return;
    const ref = billCanonicalRef(bill);
    if (selectedRefs.has(ref)) return;
    props.onChange([
      ...props.value,
      {
        billRef: ref,
        displayRef: billDisplayRef(bill),
        title: bill.title,
        latestActionDate: bill.latestActionDate,
      },
    ]);
    setQuery("");
    setResults(null);
  };

  const removeBill = (ref: string) => {
    props.onChange(props.value.filter((b) => b.billRef !== ref));
  };

  // Hidden input keeps the existing form action working without
  // any server-side changes — emit "H.R. 5334, S. 1552, ..." format.
  const hiddenValue = props.value.map((b) => b.displayRef).join(", ");

  return (
    <div className="space-y-3">
      <input type="hidden" name="billRefs" value={hiddenValue} />

      {props.value.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {props.value.map((b) => (
            <li
              key={b.billRef}
              className="inline-flex items-center gap-2 rounded-full border border-ink bg-cream px-3 py-1 text-xs"
            >
              <span className="font-semibold">{b.displayRef}</span>
              <span className="max-w-[280px] truncate text-ink-muted">
                {b.title}
              </span>
              <button
                type="button"
                onClick={() => removeBill(b.billRef)}
                className="ml-1 rounded-full px-1 text-ink-muted hover:bg-white hover:text-ink"
                aria-label={`Remove ${b.displayRef}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        disabled={atCap}
        placeholder={
          atCap
            ? `Maximum ${MAX_BILLS} bills selected`
            : 'Search bills — try "voting rights", "broadband", or "H.R. 27"'
        }
        className="block w-full rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:border-accent disabled:opacity-60"
      />

      {searching && (
        <p className="text-xs text-ink-muted">Searching…</p>
      )}
      {error && (
        <p className="text-xs text-ink-muted">Search error: {error}</p>
      )}
      {results && results.length === 0 && !searching && (
        <p className="text-xs text-ink-muted">
          No matches. Try a different phrasing.
        </p>
      )}
      {results && results.length > 0 && (
        <ul className="divide-y divide-rule overflow-hidden rounded-md border border-rule bg-white/40">
          {results.map(({ bill, score }) => {
            const ref = billCanonicalRef(bill);
            const taken = selectedRefs.has(ref);
            return (
              <li key={bill._id}>
                <button
                  type="button"
                  onClick={() => addBill(bill)}
                  disabled={taken || atCap}
                  className="flex w-full items-start gap-3 px-3 py-2 text-left text-sm hover:bg-white disabled:opacity-50"
                >
                  <span className="min-w-[80px] font-semibold text-ink">
                    {billDisplayRef(bill)}
                  </span>
                  <span className="flex-1">
                    <span className="block text-ink">
                      {bill.title.slice(0, 120)}
                    </span>
                    <span className="block text-xs text-ink-muted">
                      {new Date(bill.latestActionDate).toLocaleDateString()}
                      {score !== undefined
                        ? ` · score ${score.toFixed(2)}`
                        : ""}
                      {taken ? " · added" : ""}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-xs text-ink-muted">
        {props.value.length} / {MAX_BILLS} selected. Type 3+ characters to
        search.
      </p>
    </div>
  );
}
