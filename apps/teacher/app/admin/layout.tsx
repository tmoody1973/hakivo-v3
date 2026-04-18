import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { isAdmin } from "@/lib/auth/admin";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!isAdmin(userId)) redirect("/teacher");

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="flex items-center justify-between border-b border-rule px-6 py-4 md:px-10">
        <Link
          href="/admin/review"
          className="text-sm font-semibold tracking-[0.32em] text-ink"
        >
          HAKIVO · ADMIN
        </Link>
        <nav className="flex items-center gap-6 text-sm text-ink-muted">
          <Link href="/admin/review" className="hover:text-ink">
            Review Queue
          </Link>
          <Link href="/teacher" className="hover:text-ink">
            ← Teacher view
          </Link>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8 md:px-10 md:py-12">
        {children}
      </main>
    </div>
  );
}
