import { auth } from "@clerk/nextjs/server";
import { api, type Id } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const { getToken } = await auth();
  const h = await headers();
  const referer = h.get("referer");
  const url = referer ? new URL(referer) : null;
  const override = url?.searchParams.get("teacherId");

  const teacher = override
    ? await fetchQuery(api.teachers.getById, {
        id: override as Id<"teachers">,
      })
    : await (async () => {
        const token = await getToken({ template: "convex" });
        if (!token) return null;
        return fetchQuery(api.teachers.getMe, {}, { token });
      })();

  if (!teacher) redirect("/teacher/onboarding");

  return (
    <section className="max-w-2xl">
      <p className="text-xs font-semibold tracking-[0.28em] text-ink-muted">
        SETTINGS
      </p>
      <h1 className="mt-4 font-serif text-3xl leading-tight">
        Your classroom.
      </h1>
      <p className="mt-3 text-ink-muted">
        Edit what drives your daily packet: timezone (when it arrives), courses
        and CED unit (what it covers), reading level (how it reads). Changes
        take effect on your next packet.
      </p>
      <SettingsForm teacher={teacher} />
    </section>
  );
}
