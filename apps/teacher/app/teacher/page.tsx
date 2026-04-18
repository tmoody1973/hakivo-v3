import { auth, currentUser } from "@clerk/nextjs/server";
import { api } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function TeacherHome() {
  const { getToken } = await auth();
  const token = await getToken({ template: "convex" });
  const me = token
    ? await fetchQuery(api.teachers.getMe, {}, { token })
    : null;

  if (!me) redirect("/teacher/onboarding");

  const user = await currentUser();

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 text-ink">
      <p className="text-xs font-semibold tracking-[0.28em] text-ink-muted">
        HAKIVO · TEACHER
      </p>
      <h1 className="mt-6 font-serif text-4xl leading-tight">
        Welcome back, {me.name.split(" ")[0]}.
      </h1>
      <p className="mt-4 text-ink-muted">
        Your first packet arrives at 5am {me.timezone} tomorrow. Until then,
        the pipeline is warming up.
      </p>
      <dl className="mt-10 grid grid-cols-2 gap-6 border-t border-rule pt-10 text-sm">
        <div>
          <dt className="text-ink-muted">School</dt>
          <dd className="mt-1 text-ink">{me.school ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">State</dt>
          <dd className="mt-1 text-ink">{me.state ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-muted">Courses</dt>
          <dd className="mt-1 text-ink">
            {me.courses.length > 0 ? me.courses.join(", ") : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-ink-muted">Status</dt>
          <dd className="mt-1 text-ink capitalize">{me.status}</dd>
        </div>
      </dl>
      <p className="mt-10 text-xs text-ink-muted">
        Signed in as {user?.primaryEmailAddress?.emailAddress}.{" "}
        <Link href="/sign-out" className="underline underline-offset-2">
          Sign out
        </Link>
      </p>
    </main>
  );
}
