"use client";

import { useActionState, useEffect, useState } from "react";
import { onboardTeacher } from "@/lib/actions/onboard-teacher";

const GRADES = ["9", "10", "11", "12"] as const;

const STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

const FIELD = "block w-full rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink placeholder:text-ink-muted focus-visible:border-accent";

export function OnboardingForm({ defaultName = "" }: { defaultName?: string }) {
  const [state, formAction, isPending] = useActionState(onboardTeacher, null);
  const [timezone, setTimezone] = useState("UTC");

  useEffect(() => {
    setTimezone(Intl.DateTimeFormat().resolvedOptions().timeZone);
  }, []);

  return (
    <form action={formAction} className="mt-10 space-y-6">
      <input type="hidden" name="timezone" value={timezone} />

      <Field label="Full name" required>
        <input
          type="text"
          name="name"
          required
          defaultValue={defaultName}
          className={FIELD}
          placeholder="Jane Doe"
        />
      </Field>

      <Field label="School">
        <input type="text" name="school" className={FIELD} placeholder="Riverside High School" />
      </Field>

      <Field label="State">
        <select name="state" className={FIELD} defaultValue="">
          <option value="">—</option>
          {STATES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </Field>

      <Field label="Grades you teach">
        <div className="flex flex-wrap gap-4">
          {GRADES.map((g) => (
            <label key={g} className="inline-flex items-center gap-2 text-sm">
              <input type="checkbox" name={`grade_${g}`} className="size-4 accent-accent" />
              {g}th
            </label>
          ))}
        </div>
      </Field>

      <Field label="Courses (comma-separated)">
        <input
          type="text"
          name="courses"
          className={FIELD}
          placeholder="US Government, AP US Gov"
        />
      </Field>

      <Field label="Current AP CED unit (optional)">
        <select name="currentUnit" className={FIELD} defaultValue="">
          <option value="">Not teaching AP Gov</option>
          <option value="unit_1">Unit 1 — Foundations</option>
          <option value="unit_2">Unit 2 — Interactions Among Branches</option>
          <option value="unit_3">Unit 3 — Civil Liberties & Civil Rights</option>
          <option value="unit_4">Unit 4 — American Political Ideologies</option>
          <option value="unit_5">Unit 5 — Political Participation</option>
        </select>
      </Field>

      <Field label="Target reading level">
        <select name="targetReadingLevel" className={FIELD} defaultValue="10th grade">
          <option>9th grade</option>
          <option>10th grade</option>
          <option>11th grade</option>
          <option>12th grade</option>
          <option>College</option>
        </select>
      </Field>

      {state?.error ? (
        <p className="rounded-md border border-rule bg-white px-3 py-2 text-sm text-ink">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isPending}
        className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg bg-accent px-6 py-3 text-sm font-medium text-cream transition-colors hover:bg-accent-hover disabled:opacity-60"
      >
        {isPending ? "Saving…" : "Start receiving packets"}
      </button>
    </form>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs font-semibold tracking-[0.14em] text-ink-muted uppercase">
        {label}
        {required ? <span aria-hidden> *</span> : null}
      </span>
      {children}
    </label>
  );
}
