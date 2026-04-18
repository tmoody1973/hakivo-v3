import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-cream text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6 md:px-10">
        <span
          className="text-sm font-semibold tracking-[0.32em] text-ink"
          aria-label="Hakivo"
        >
          HAKIVO
        </span>
        <nav aria-label="Primary" className="hidden gap-8 text-sm text-ink-muted md:flex">
          <Link href="/about" className="hover:text-ink">
            About
          </Link>
          <Link href="/content" className="hover:text-ink">
            Content
          </Link>
          <Link href="/contact" className="hover:text-ink">
            Contact
          </Link>
        </nav>
      </header>

      <section className="mx-auto max-w-3xl px-6 pt-16 pb-24 text-center md:pt-28 md:pb-32">
        <h1 className="font-serif text-[2.75rem] leading-[1.05] text-ink md:text-7xl">
          Civic intelligence,
          <br />
          delivered daily
        </h1>

        <p className="mx-auto mt-8 max-w-xl text-lg text-ink-muted md:text-xl">
          A civic intelligence platform for teachers and engaged citizens.
        </p>

        <div
          className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row"
          role="group"
          aria-label="Get started"
        >
          <Link
            href="/for-teachers"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-accent px-8 py-3 text-sm font-medium text-cream transition-colors hover:bg-accent-hover"
          >
            For Teachers
          </Link>
          <Link
            href="/for-citizens"
            className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-ink px-8 py-3 text-sm font-medium text-ink transition-colors hover:bg-ink hover:text-cream"
          >
            For Citizens
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 pb-16 md:pb-24">
        <div className="grid gap-10 border-t border-rule pt-16 md:grid-cols-3">
          <article>
            <h2 className="font-serif text-xl text-ink">Every school-day, 5am local</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              A one-page teacher brief covering yesterday&apos;s Congressional activity —
              ready before first period.
            </p>
          </article>
          <article>
            <h2 className="font-serif text-xl text-ink">Standards aligned</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              Tagged to NCSS C3, AP US Gov CED, and your state standards at
              generation time.
            </p>
          </article>
          <article>
            <h2 className="font-serif text-xl text-ink">Primary sources only</h2>
            <p className="mt-3 text-sm leading-relaxed text-ink-muted">
              Every fact traces back to Congress.gov. Our anti-hallucination
              pipeline rejects packets that can&apos;t cite their sources.
            </p>
          </article>
        </div>
      </section>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-6 py-8 text-sm text-ink-muted md:flex-row md:px-10">
          <p>Trusted by schools and civic organizations nationwide.</p>
          <p>&copy; {new Date().getFullYear()} Hakivo</p>
        </div>
      </footer>
    </main>
  );
}
