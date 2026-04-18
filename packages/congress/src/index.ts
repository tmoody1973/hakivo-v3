/**
 * @hakivo/congress
 *
 * Congress.gov API client. Port of v2's `congress-api-client` — normalizes
 * bill, member, vote, and committee-action payloads into typed records that
 * `@hakivo/db` can store.
 *
 * Week-1 scaffold: interfaces only. Real client lands in week 2.
 */

export interface CongressBill {
  readonly congressNumber: number;
  readonly billType: string;
  readonly billNumber: number;
  readonly title: string;
  readonly introducedDate: string;
  readonly latestAction: string;
  readonly latestActionDate: string;
}

export interface CongressEvent {
  readonly date: string;
  readonly chamber: "house" | "senate";
  readonly eventType:
    | "vote"
    | "bill_introduced"
    | "bill_passed"
    | "committee_action"
    | "floor_speech";
  readonly bills: readonly CongressBill[];
  readonly summary: string;
}

export interface CongressClient {
  readonly fetchRecentEvents: (
    since: Date,
  ) => Promise<readonly CongressEvent[]>;
  readonly fetchBill: (
    congressNumber: number,
    billType: string,
    billNumber: number,
  ) => Promise<CongressBill | null>;
}
