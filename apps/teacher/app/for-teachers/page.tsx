import Link from "next/link";

export default function ForTeachersPage() {
  return (
    <main className="min-h-screen bg-cream px-6 py-20 text-ink md:py-32">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-semibold tracking-[0.28em] text-ink-muted">
          HAKIVO FOR TEACHERS
        </p>
        <h1 className="mt-6 font-serif text-5xl leading-tight md:text-6xl">
          Classroom-ready by 5am.
        </h1>
        <p className="mt-6 text-lg text-ink-muted">
          Teacher tier is launching in private beta. Full onboarding and
          Google Classroom push land in week 3.
        </p>
        <Link
          href="/"
          className="mt-10 inline-flex min-h-[44px] items-center justify-center rounded-lg border border-ink px-6 py-3 text-sm font-medium text-ink hover:bg-ink hover:text-cream"
        >
          Back to home
        </Link>
      </div>
    </main>
  );
}
