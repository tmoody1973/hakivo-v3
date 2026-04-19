/**
 * Thin REST wrapper for the OpenStates v3 API.
 * https://docs.openstates.org/api-v3/
 *
 * Auth: X-API-KEY header. Free tier is rate-limited to 1 req/sec, so we
 * sleep 1.05s between paginated calls. Backfill of "last 60 days WI bills"
 * runs in 1-3 minutes total.
 */

import type { OpenStatesBill, OpenStatesBillsResponse } from "./types";

const BASE = "https://v3.openstates.org";
const RATE_LIMIT_MS = 1100; // 1 req / sec + 100ms buffer

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

export type OpenStatesClient = {
  /**
   * Stream bills for a jurisdiction matching the filters. Yields one
   * bill at a time so the caller can early-exit or stream-write to
   * Convex without buffering all results in memory.
   */
  readonly streamBills: (args: {
    readonly jurisdiction: string; // "wi"
    readonly session?: string;
    readonly updatedSince?: Date;
    readonly classification?: string; // "bill" / "resolution"
  }) => AsyncIterable<OpenStatesBill>;
};

const INCLUDE_FIELDS = [
  "sponsorships",
  "abstracts",
  "actions",
  "sources",
  "other_titles",
] as const;

export function createOpenStatesClient(apiKey: string): OpenStatesClient {
  if (!apiKey) throw new Error("OPENSTATES_API_KEY required");

  async function* streamBills({
    jurisdiction,
    session,
    updatedSince,
    classification,
  }: {
    jurisdiction: string;
    session?: string;
    updatedSince?: Date;
    classification?: string;
  }): AsyncIterable<OpenStatesBill> {
    let page = 1;
    while (true) {
      const params = new URLSearchParams({
        jurisdiction,
        page: String(page),
        per_page: "20",
      });
      if (session) params.set("session", session);
      if (updatedSince) {
        params.set("updated_since", updatedSince.toISOString().slice(0, 10));
      }
      if (classification) params.set("classification", classification);
      for (const field of INCLUDE_FIELDS) params.append("include", field);

      const url = `${BASE}/bills?${params.toString()}`;
      const res = await fetch(url, {
        headers: { "X-API-KEY": apiKey, "User-Agent": "hakivo-v3/1.0" },
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "<no body>");
        throw new Error(
          `OpenStates ${res.status} ${res.statusText}: ${detail.slice(0, 500)}`,
        );
      }
      const json = (await res.json()) as OpenStatesBillsResponse;
      for (const bill of json.results) yield bill;

      if (page >= json.pagination.max_page) break;
      page += 1;
      await sleep(RATE_LIMIT_MS);
    }
  }

  return { streamBills };
}

/**
 * Convert OpenStates "AB 1206" / "SB 50" identifiers to a Hakivo billRef
 * shape compatible with the federal "{congress}-{type}-{num}" pattern.
 *   "wi" + "AB 1206" → { stateRef: "wi-2025-ab-1206", billType, billNumber }
 */
export function billIdentifierToRef(args: {
  readonly state: string; // "wi"
  readonly session: string; // "2025"
  readonly identifier: string; // "AB 1206"
}): {
  readonly billRef: string;
  readonly billType: string;
  readonly billNumber: number;
} | null {
  const cleaned = args.identifier.trim().toLowerCase();
  // "ab 1206" / "sb 50" / "ajr 100" / "sjr 5"
  const match = cleaned.match(/^([a-z]+)\s*(\d+)$/);
  if (!match) return null;
  const billType = match[1]!;
  const billNumber = parseInt(match[2]!, 10);
  if (isNaN(billNumber)) return null;
  return {
    billRef: `${args.state}-${args.session}-${billType}-${billNumber}`,
    billType,
    billNumber,
  };
}
