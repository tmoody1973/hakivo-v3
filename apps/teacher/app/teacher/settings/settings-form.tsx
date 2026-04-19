"use client";

import { useActionState } from "react";
import { updateSettings } from "@/lib/actions/update-settings";
import type { Doc } from "@hakivo/db";

const GRADES = ["9", "10", "11", "12"] as const;
const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

const FIELD = "block w-full rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink focus-visible:border-accent";

export function SettingsForm({ teacher }: { teacher: Doc<"teachers"> }) {
  const [state, formAction, isPending] = useActionState(updateSettings, null);

  return (
    <form action={formAction} className="mt-8 space-y-6">
      <Field label="Full name">
        <input
          type="text"
          name="name"
          defaultValue={teacher.name}
          className={FIELD}
        />
      </Field>

      <Field label="School">
        <input
          type="text"
          name="school"
          defaultValue={teacher.school ?? ""}
          className={FIELD}
        />
      </Field>

      <Field label="State">
        <select name="state" className={FIELD} defaultValue={teacher.state ?? ""}>
          <option value="">—</option>
          {STATES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </Field>

      <Field label="Grades you teach">
        <div className="flex flex-wrap gap-4">
          {GRADES.map((g) => (
            <label key={g} className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name={`grade_${g}`}
                defaultChecked={teacher.gradesTaught.includes(g)}
                className="size-4 accent-accent"
              />
              {g}th
            </label>
          ))}
        </div>
      </Field>

      <Field label="Courses (comma-separated)">
        <input
          type="text"
          name="courses"
          defaultValue={teacher.courses.join(", ")}
          className={FIELD}
        />
      </Field>

      <Field label="Current AP CED unit">
        <select
          name="currentUnit"
          className={FIELD}
          defaultValue={teacher.currentUnit ?? ""}
        >
          <option value="">Not teaching AP Gov</option>
          <option value="unit_1">Unit 1 — Foundations</option>
          <option value="unit_2">Unit 2 — Interactions Among Branches</option>
          <option value="unit_3">Unit 3 — Civil Liberties & Civil Rights</option>
          <option value="unit_4">Unit 4 — American Political Ideologies</option>
          <option value="unit_5">Unit 5 — Political Participation</option>
        </select>
      </Field>

      <Field label="Target reading level">
        <select
          name="targetReadingLevel"
          className={FIELD}
          defaultValue={teacher.targetReadingLevel ?? "10th grade"}
        >
          <option>9th grade</option>
          <option>10th grade</option>
          <option>11th grade</option>
          <option>12th grade</option>
          <option>College</option>
        </select>
      </Field>

      <Field label="Timezone (IANA)">
        <input
          type="text"
          name="timezone"
          defaultValue={teacher.timezone}
          placeholder="America/Chicago"
          className={FIELD}
        />
        <p className="mt-1 text-xs text-ink-muted">
          Your daily packet is generated at 5am in this timezone. Update if you move.
        </p>
      </Field>

      {state && "error" in state ? (
        <p className="rounded-md border border-rule bg-white px-3 py-2 text-sm">
          {state.error}
        </p>
      ) : null}
      {state && "ok" in state ? (
        <p className="text-sm text-ink-muted">Saved.</p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-[44px] items-center rounded-lg bg-accent px-6 py-2 text-sm font-medium text-cream hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
        {label}
      </span>
      {children}
    </label>
  );
}
