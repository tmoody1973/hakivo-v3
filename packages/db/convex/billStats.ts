import { query } from "./_generated/server";

/**
 * Sampled coverage estimate. Loading 15K full bill rows (each ~6KB
 * once embedded) blows past Convex's 16MB per-query read budget.
 * We sample the most-recently-actioned 500 and extrapolate.
 *
 * For exact counts use the dashboard or a paginated client-side scan.
 */
export const enrichmentCoverage = query({
  args: {},
  handler: async (ctx) => {
    const SAMPLE = 500;
    const sample = await ctx.db
      .query("bills")
      .withIndex("by_latestAction")
      .order("desc")
      .take(SAMPLE);

    const ceremonialRe = [
      /^reserved for/i,
      /^to name a post office/i,
      /^to designate /i,
      /^honoring /i,
      /^recognizing /i,
      /^expressing /i,
      /^commemorating /i,
      /^celebrating /i,
    ];

    let withEmbedding = 0;
    let withBillText = 0;
    let withSummary = 0;
    let enriched = 0;
    let ceremonial = 0;
    for (const bill of sample) {
      if (bill.embedding) withEmbedding += 1;
      if (bill.billText) withBillText += 1;
      if (bill.summary) withSummary += 1;
      if (bill.enrichedAt) enriched += 1;
      if (ceremonialRe.some((re) => re.test(bill.title))) ceremonial += 1;
    }

    return {
      sampleSize: sample.length,
      sampleEnriched: enriched,
      sampleEmbedded: withEmbedding,
      sampleBillText: withBillText,
      sampleSummary: withSummary,
      sampleCeremonial: ceremonial,
      estimatedEnrichedTotal: Math.round((enriched / sample.length) * 14_995),
      estimatedEmbeddedTotal: Math.round(
        (withEmbedding / sample.length) * 14_995,
      ),
    };
  },
});
