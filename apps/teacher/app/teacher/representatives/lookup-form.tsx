"use client";

import { useActionState } from "react";
import type { Doc } from "@hakivo/db";
import { lookupReps, type RepLookupState } from "@/lib/actions/lookup-reps";

export function LookupForm({ defaultAddress = "" }: { defaultAddress?: string }) {
  const [state, formAction, isPending] = useActionState<RepLookupState, FormData>(
    lookupReps,
    null,
  );

  return (
    <div className="space-y-8">
      <form action={formAction} className="flex flex-col gap-3 md:flex-row">
        <input
          type="text"
          name="address"
          required
          defaultValue={defaultAddress}
          placeholder="220 East Buffalo Street, Milwaukee, WI 53202"
          className="flex-1 rounded-md border border-rule bg-white px-4 py-3 text-sm focus-visible:border-accent"
        />
        <button
          type="submit"
          disabled={isPending}
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-accent px-6 text-sm font-medium text-cream hover:bg-accent-hover disabled:opacity-60"
        >
          {isPending ? "Looking up…" : "Find my reps"}
        </button>
      </form>

      {state && "error" in state ? (
        <p className="rounded-lg border border-rule bg-white/40 p-4 text-sm text-ink">
          {state.error}
        </p>
      ) : null}

      {state && "ok" in state ? (
        <div className="space-y-6">
          <p className="text-sm text-ink-muted">
            {state.districts.formattedAddress}
            <span className="ml-2 text-xs">
              · {state.districts.state}-{state.districts.congressionalDistrict}
            </span>
          </p>

          <Section title={`Your senators (${state.districts.state})`}>
            {state.senators.length === 0 ? (
              <p className="text-sm text-ink-muted">No senators found.</p>
            ) : (
              state.senators.map((l) => <RepCard key={l._id} legislator={l} />)
            )}
          </Section>

          <Section
            title={`Your representative (${state.districts.state}-${state.districts.congressionalDistrict})`}
          >
            {state.houseRep ? (
              <RepCard legislator={state.houseRep} />
            ) : (
              <p className="text-sm text-ink-muted">
                No match in our roster — the seat may be vacant or our roster
                refreshes Sunday.
              </p>
            )}
          </Section>

          <p className="text-xs text-ink-muted">
            State legislators (Wisconsin Senate + Assembly, etc.) coming once
            OpenStates ingest is wired in v3.1.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
        {title}
      </h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function RepCard({ legislator: l }: { legislator: Doc<"legislators"> }) {
  return (
    <article className="flex items-start gap-4 rounded-lg border border-rule bg-white/40 p-4">
      {l.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={l.photoUrl}
          alt={l.fullName}
          className="size-20 rounded-md border border-rule object-cover"
        />
      ) : (
        <div className="size-20 rounded-md border border-rule bg-cream" />
      )}
      <div className="flex-1">
        <h3 className="font-serif text-lg text-ink">{l.fullName}</h3>
        <p className="text-xs text-ink-muted">
          {l.party}
          {" · "}
          {l.chamber === "senate"
            ? `Senator, ${l.state}`
            : `Representative, ${l.state}-${l.district}`}
        </p>
        <div className="mt-3 flex flex-wrap gap-3 text-xs">
          {l.officialUrl ? (
            <a
              href={l.officialUrl}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-accent"
            >
              Official site
            </a>
          ) : null}
          {l.phone ? <span>{l.phone}</span> : null}
          {l.twitter ? (
            <a
              href={`https://twitter.com/${l.twitter}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-accent"
            >
              @{l.twitter}
            </a>
          ) : null}
          {l.wikipediaSlug ? (
            <a
              href={`https://en.wikipedia.org/wiki/${encodeURIComponent(l.wikipediaSlug)}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-accent"
            >
              Wikipedia
            </a>
          ) : null}
        </div>
        {l.office ? (
          <p className="mt-2 text-xs text-ink-muted">{l.office}</p>
        ) : null}
      </div>
    </article>
  );
}
