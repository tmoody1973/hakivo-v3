/**
 * @hakivo/referral
 *
 * Parent-referral flow and advocate-inbound attribution. Shared attribution
 * logic across the `/for-parents` and `/for-advocates` funnels.
 *
 * Week-1 scaffold: type shapes only.
 */

export type ReferralSource =
  | "parent_form"
  | "advocate_api"
  | "direct_teacher"
  | "organic_landing";

export interface ReferralAttribution {
  readonly source: ReferralSource;
  readonly referrerEmail: string | null;
  readonly capturedAt: number;
  readonly convertedAt: number | null;
  readonly utmCampaign: string | null;
}
