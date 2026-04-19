import { api } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import Link from "next/link";
import { notFound } from "next/navigation";

function parseRef(ref: string):
  | { congressNumber: number; billType: string; billNumber: number }
  | null {
  const m = ref.match(/^(\d+)-([a-z]+)-(\d+)$/i);
  if (!m) return null;
  return {
    congressNumber: Number(m[1]),
    billType: m[2]!.toLowerCase(),
    billNumber: Number(m[3]),
  };
}

export default async function BillDetailPage({
  params,
}: {
  params: Promise<{ ref: string }>;
}) {
  const { ref } = await params;
  const parsed = parseRef(ref);
  if (!parsed) notFound();

  const bill = await fetchQuery(api.bills.getByRef, parsed);
  if (!bill) notFound();

  return (
    <article className="max-w-3xl space-y-8">
      <header>
        <Link href="/teacher/bills" className="text-xs text-ink-muted hover:text-ink">
          ← Back to search
        </Link>
        <p className="mt-4 text-xs font-semibold tracking-[0.28em] text-ink-muted">
          {bill.billType.toUpperCase()} {bill.billNumber} · {bill.congressNumber}TH CONGRESS
        </p>
        <h1 className="mt-3 font-serif text-3xl leading-tight">{bill.title}</h1>
        <dl className="mt-6 grid grid-cols-2 gap-4 text-sm md:grid-cols-3">
          <Item
            label="Introduced"
            value={new Date(bill.introducedDate).toLocaleDateString()}
          />
          <Item
            label="Latest action"
            value={new Date(bill.latestActionDate).toLocaleDateString()}
          />
          <Item
            label="Topics"
            value={bill.topics.length > 0 ? bill.topics.join(", ") : "—"}
          />
        </dl>
        <p className="mt-4 text-sm text-ink">{bill.latestAction || "—"}</p>
      </header>

      {bill.summary ? (
        <section className="rounded-lg border border-rule bg-white/40 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            CRS summary
          </h2>
          <p className="mt-3 leading-relaxed text-ink whitespace-pre-line">
            {bill.summary}
          </p>
        </section>
      ) : null}

      {bill.billText ? (
        <section className="rounded-lg border border-rule bg-white/40 p-6">
          <h2 className="text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">
            Bill text
            <span className="ml-2 text-[10px] text-ink-muted">
              {bill.billTextSource ? `(${bill.billTextSource})` : ""}
            </span>
          </h2>
          <pre className="mt-3 max-h-[400px] overflow-auto whitespace-pre-wrap text-xs text-ink">
            {bill.billText}
          </pre>
        </section>
      ) : (
        <section className="rounded-lg border border-rule bg-white/40 p-6 text-sm text-ink-muted">
          Full text not yet enriched. Background enrichment runs hourly.
        </section>
      )}

      <p className="text-xs text-ink-muted">
        Source:{" "}
        <a
          href={`https://www.congress.gov/bill/${bill.congressNumber}th-congress/${bill.billType === "hr" ? "house-bill" : bill.billType === "s" ? "senate-bill" : `${bill.billType}`}/${bill.billNumber}`}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-ink"
        >
          Congress.gov
        </a>
      </p>
    </article>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mt-1 text-ink">{value}</dd>
    </div>
  );
}
