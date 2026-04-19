import { auth, currentUser } from "@clerk/nextjs/server";
import { api } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PersonalSidebar } from "./_components/personal-sidebar";

/**
 * /personal/* — citizen / individual view of the same packet pipeline.
 *
 * Reuses the existing teacher record + packet data for now (one user
 * has one record either way). Different render: no exit ticket, no
 * Push to Classroom, no AP-curriculum framing. Focuses on the brief +
 * audio + sources, which is what a non-teacher civic-curious adult
 * actually wants.
 */

export default async function PersonalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, getToken } = await auth();
  const h = await headers();
  const referer = h.get("referer");
  const url = referer ? new URL(referer) : null;
  const pathname = url?.pathname ?? "/personal";

  if (!userId) redirect("/sign-in");

  const token = await getToken({ template: "convex" });
  const teacher = token
    ? await fetchQuery(api.teachers.getMe, {}, { token })
    : null;
  const user = await currentUser();
  const displayName =
    teacher?.name ??
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress ??
    "Signed in";

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="flex items-center justify-between border-b border-rule px-6 py-4 md:px-10">
        <div className="flex items-center gap-6">
          <Link
            href="/personal"
            className="text-sm font-semibold tracking-[0.32em] text-ink"
          >
            HAKIVO
          </Link>
          <span className="text-[11px] uppercase tracking-[0.2em] text-ink-muted">
            Personal brief
          </span>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <Link
            href="/teacher"
            className="text-ink-muted hover:text-ink"
            title="Switch to teacher view"
          >
            Teacher view →
          </Link>
          <div className="text-right">
            <div className="text-ink">{displayName}</div>
          </div>
        </div>
      </header>
      <div className="mx-auto grid max-w-5xl md:grid-cols-[200px_1fr]">
        <PersonalSidebar activeHref={pathname} />
        <main className="px-6 py-6 md:px-10 md:py-10">{children}</main>
      </div>
    </div>
  );
}
