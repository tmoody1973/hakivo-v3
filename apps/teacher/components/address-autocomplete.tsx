"use client";

import { useEffect, useRef, useState } from "react";
import {
  searchAddresses,
  type AddressSuggestion,
} from "@/lib/actions/search-addresses";

/**
 * Address typeahead backed by Geocodio (server action).
 *
 * Why Geocodio not Google Places: same vendor as the rep-lookup server
 * action, single API key, no GCP API enables, no shadow-DOM event-shape
 * fights. UX is "good enough" for one-time address entry — Marissa's
 * use case doesn't need premium typeahead polish.
 *
 * Typing 4+ chars debounces 300ms, fetches up to 5 matches, shows them
 * as a click-to-fill dropdown. Keyboard nav (arrows + enter) supported.
 */

type Props = {
  readonly name?: string;
  readonly defaultValue?: string;
  readonly placeholder?: string;
  readonly className?: string;
  readonly required?: boolean;
};

const MIN_QUERY_LEN = 4;
const DEBOUNCE_MS = 300;

export function AddressAutocomplete({
  name = "address",
  defaultValue = "",
  placeholder,
  className,
  required,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reqIdRef = useRef(0);
  const [value, setValue] = useState(defaultValue);
  const [results, setResults] = useState<ReadonlyArray<AddressSuggestion>>([]);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const text = value.trim();
    if (text.length < MIN_QUERY_LEN) {
      setResults([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(() => {
      const reqId = ++reqIdRef.current;
      searchAddresses(text, 5)
        .then((hits) => {
          if (reqId !== reqIdRef.current) return;
          setResults(hits);
          setOpen(hits.length > 0);
          setActiveIdx(-1);
        })
        .catch(() => {
          if (reqId !== reqIdRef.current) return;
          setResults([]);
          setOpen(false);
        })
        .finally(() => {
          if (reqId === reqIdRef.current) setSearching(false);
        });
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value]);

  const pick = (suggestion: AddressSuggestion) => {
    setValue(suggestion.formattedAddress);
    setResults([]);
    setOpen(false);
    setActiveIdx(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => (i <= 0 ? results.length - 1 : i - 1));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      const target = results[activeIdx];
      if (target) pick(target);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <input
        ref={inputRef}
        type="text"
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        className={className}
      />
      {open && results.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-10 mt-1 max-h-72 overflow-auto rounded-md border border-rule bg-white shadow-md"
        >
          {results.map((s, i) => (
            <li
              key={`${s.formattedAddress}-${i}`}
              role="option"
              aria-selected={i === activeIdx}
              onMouseDown={(e) => {
                // onMouseDown beats input's onBlur; using onClick would
                // close the list before the click fires.
                e.preventDefault();
                pick(s);
              }}
              className={`cursor-pointer px-3 py-2 text-sm ${
                i === activeIdx
                  ? "bg-cream text-ink"
                  : "text-ink hover:bg-cream"
              }`}
            >
              {s.formattedAddress}
            </li>
          ))}
        </ul>
      )}
      {searching && value.trim().length >= MIN_QUERY_LEN && (
        <p className="mt-1 text-xs text-ink-muted">Looking up addresses…</p>
      )}
    </div>
  );
}
