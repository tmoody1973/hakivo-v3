import { query } from "./_generated/server";

/**
 * Full-table counts across bills — can't rely on client-side .listRecent
 * with a limit because we now have ~15K rows. Used by scripts/bill-stats.ts.
 */
export const enrichmentCoverage = query({
  args: {},
  handler: async (ctx) => {
    let total = 0;
    let withEmbedding = 0;
    let withBillText = 0;
    let withSummary = 0;
    let withActions = 0;
    let ceremonial = 0;
    let enriched = 0;

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

    for await (const bill of ctx.db.query("bills")) {
      total += 1;
      if (bill.embedding) withEmbedding += 1;
      if (bill.billText) withBillText += 1;
      if (bill.summary) withSummary += 1;
      if (bill.enrichedAt) enriched += 1;
      if (ceremonialRe.some((re) => re.test(bill.title))) ceremonial += 1;
    }

    // Actions count via separate scan
    for await (const _ of ctx.db.query("billActions")) {
      withActions += 1;
    }

    return {
      total,
      withEmbedding,
      withBillText,
      withSummary,
      enriched,
      ceremonial,
      billActionsRowCount: withActions,
    };
  },
});
