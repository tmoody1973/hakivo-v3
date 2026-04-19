import { SearchForm } from "./search-form";

export default function BillsSearchPage() {
  return (
    <section className="max-w-3xl">
      <p className="text-xs font-semibold tracking-[0.28em] text-ink-muted">
        BROWSE BILLS
      </p>
      <h1 className="mt-4 font-serif text-3xl leading-tight">
        Search the 119th Congress.
      </h1>
      <p className="mt-3 text-ink-muted">
        14,995 bills ingested from Congress.gov. Semantic search uses Gemini
        embeddings (RETRIEVAL_QUERY) over the ~1,500 enriched bills with full
        text + summaries. Keyword search runs across all bill titles.
      </p>

      <div className="mt-8">
        <SearchForm />
      </div>
    </section>
  );
}
