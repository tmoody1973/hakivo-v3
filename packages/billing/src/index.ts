/**
 * @hakivo/billing
 *
 * Stripe integration. v3.0 ships two products:
 *   - Teacher: $50/year or $6/month
 *   - Consumer: $6/month
 *
 * Week-1 scaffold: product type shapes only.
 */

export type BillingTier = "teacher" | "consumer";

export type BillingInterval = "month" | "year";

export interface PricePoint {
  readonly tier: BillingTier;
  readonly interval: BillingInterval;
  readonly amountCents: number;
  readonly stripePriceId: string | null;
}

export const V3_PRICING: readonly PricePoint[] = [
  { tier: "teacher", interval: "year", amountCents: 5000, stripePriceId: null },
  { tier: "teacher", interval: "month", amountCents: 600, stripePriceId: null },
  { tier: "consumer", interval: "month", amountCents: 600, stripePriceId: null },
] as const;
