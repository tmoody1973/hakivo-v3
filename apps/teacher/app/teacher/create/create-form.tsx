"use client";

import { useActionState, useState } from "react";
import { requestCustomPacket } from "@/lib/actions/request-custom-packet";
import { BillPicker } from "./bill-picker";

const FIELD =
  "block w-full rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:border-accent";

type Props = {
  readonly quotaUsed: number;
  readonly quotaMax: number;
  readonly defaultDate: string;
};

type SelectedBill = {
  readonly billRef: string;
  readonly displayRef: string;
  readonly title: string;
  readonly latestActionDate: number;
};

export function CreateForm({ quotaUsed, quotaMax, defaultDate }: Props) {
  const [state, formAction, isPending] = useActionState(
    requestCustomPacket,
    null,
  );
  const [selectedBills, setSelectedBills] = useState<
    ReadonlyArray<SelectedBill>
  >([]);
  const [topic, setTopic] = useState("");

  const quotaExhausted = quotaUsed >= quotaMax;

  return (
    <form action={formAction} className="mt-8 space-y-6">
      <Field
        label="Topic focus"
        hint="Overrides your default CED unit. Leave blank to use your class setup."
      >
        <input
          type="text"
          name="topic"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          className={FIELD}
          placeholder={'e.g., "First Amendment cases" or "federal budget debate"'}
        />
      </Field>

      {/* NOT wrapped in <Field> on purpose — Field uses a <label> element
          which delegates clicks to the first form control inside it. The
          BillPicker has both a search <input> AND result <button>s, so
          a label wrapper would swallow the button clicks. */}
      <div>
        <p className="mb-2 block text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
          Specific bills to cover (optional)
        </p>
        <BillPicker value={selectedBills} onChange={setSelectedBills} />
        <p className="mt-2 text-xs text-ink-muted">
          Search semantically — type a topic or a bill ID. Pick up to 6 to
          seed the packet.
        </p>
      </div>

      <Field label="Reading level (override)">
        <select
          name="readingLevel"
          className={FIELD}
          defaultValue=""
        >
          <option value="">Use my default</option>
          <option>9th grade</option>
          <option>10th grade</option>
          <option>11th grade</option>
          <option>12th grade</option>
          <option>College</option>
        </select>
      </Field>

      <Field label="Date to cover">
        <input
          type="date"
          name="packetDate"
          defaultValue={defaultDate}
          className={FIELD}
        />
      </Field>

      {state && "error" in state ? (
        <p className="rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink">
          {state.error}
        </p>
      ) : null}

      <div className="flex items-center justify-between border-t border-rule pt-6">
        <p className="text-xs text-ink-muted">
          Custom packets today: {quotaUsed} / {quotaMax}
          {quotaExhausted ? " — quota exhausted, resets at UTC midnight" : ""}
        </p>
        <button
          type="submit"
          disabled={
            isPending ||
            quotaExhausted ||
            (!topic.trim() && selectedBills.length === 0)
          }
          className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-6 py-2 text-sm font-medium text-cream hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending ? "Queuing…" : "Generate packet"}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
        {label}
      </span>
      {children}
      {hint ? <p className="mt-1 text-xs text-ink-muted">{hint}</p> : null}
    </label>
  );
}
