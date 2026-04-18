import { auth, currentUser } from "@clerk/nextjs/server";
import { api, type Id } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import { headers } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sidebar } from "./_components/sidebar";

export default async function TeacherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId, getToken } = await auth();
  const h = await headers();
  const referer = h.get("referer");
  const url = referer ? new URL(referer) : null;
  const override = url?.searchParams.get("teacherId");
  const pathname = url?.pathname ?? "/teacher";

  if (!userId && !override) redirect("/sign-in");

  const teacher = override
    ? await fetchQuery(api.teachers.getById, {
        id: override as Id<"teachers">,
      })
    : await (async () => {
        const token = await getToken({ template: "convex" });
        if (!token) return null;
        return fetchQuery(api.teachers.getMe, {}, { token });
      })();

  const user = await currentUser();
  const displayName =
    teacher?.name ??
    user?.fullName ??
    user?.primaryEmailAddress?.emailAddress ??
    "Signed in";
  const displaySchool = teacher?.school ?? "";

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="flex items-center justify-between border-b border-rule px-6 py-4 md:px-10">
        <Link
          href="/teacher"
          className="text-sm font-semibold tracking-[0.32em] text-ink"
        >
          HAKIVO
        </Link>
        <div className="text-right text-xs">
          <div className="text-ink">{displayName}</div>
          {displaySchool ? (
            <div className="text-ink-muted">{displaySchool}</div>
          ) : null}
        </div>
      </header>
      <div className="mx-auto grid max-w-7xl md:grid-cols-[220px_1fr]">
        <Sidebar activeHref={pathname} />
        <main className="px-6 py-6 md:px-10 md:py-10">{children}</main>
      </div>
    </div>
  );
}
