/**
 * Congress.gov API client — v3.0 port of the v2 congress-api-client.
 *
 * Scope for week-1 of v3.0:
 *   - listRecentBills — paginated bill list sorted by updateDate desc
 *   - getBill         — single bill detail with text/summary when available
 *
 * Vote, committee, and floor-speech endpoints are deferred until the
 * packet pipeline actually consumes them (week 2).
 *
 * Rate limit: 5000 requests/hour. The CLI keys the v3.0 design ships
 * with share the same quota as v2's Congress.gov key.
 */

const BASE_URL = "https://api.congress.gov/v3";

export type BillType = "hr" | "s" | "hjres" | "sjres" | "hconres" | "sconres" | "hres" | "sres";

export type BillListItem = {
  readonly congress: number;
  readonly type: string;
  readonly number: number;
  readonly title: string;
  readonly introducedDate: string | null;
  readonly latestAction: { readonly actionDate: string; readonly text: string } | null;
  readonly updateDate: string;
};

export type BillDetail = BillListItem & {
  readonly summaries: readonly { readonly text: string }[];
  readonly textVersions: readonly { readonly type: string; readonly date: string; readonly formats: readonly { readonly type: string; readonly url: string }[] }[];
};

export interface CongressClient {
  readonly listRecentBills: (args: {
    readonly congress: number;
    readonly limit?: number;
    readonly offset?: number;
  }) => Promise<readonly BillListItem[]>;
  readonly getBill: (args: {
    readonly congress: number;
    readonly type: BillType;
    readonly number: number;
  }) => Promise<BillDetail | null>;
}

export class CongressApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "CongressApiError";
  }
}

export function createCongressClient(apiKey: string): CongressClient {
  if (!apiKey) {
    throw new Error("CONGRESS_API_KEY is required");
  }

  async function request<T>(
    path: string,
    params: Record<string, string | number> = {},
  ): Promise<T> {
    const query = new URLSearchParams({
      api_key: apiKey,
      format: "json",
      ...Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, String(v)]),
      ),
    });
    const url = `${BASE_URL}${path}?${query.toString()}`;
    const res = await fetch(url);
    if (res.status === 429) {
      throw new CongressApiError(429, "Congress.gov rate limit exceeded");
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new CongressApiError(
        res.status,
        `Congress.gov ${path} failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 300)}` : ""}`,
      );
    }
    return (await res.json()) as T;
  }

  return {
    async listRecentBills({ congress, limit = 50, offset = 0 }) {
      type Response = { bills: readonly BillListItem[] };
      const data = await request<Response>(`/bill/${congress}`, {
        limit,
        offset,
        sort: "updateDate+desc",
      });
      return data.bills;
    },

    async getBill({ congress, type, number }) {
      type Response = { bill: BillDetail | null };
      try {
        const data = await request<Response>(`/bill/${congress}/${type}/${number}`);
        return data.bill;
      } catch (err) {
        if (err instanceof CongressApiError && err.status === 404) return null;
        throw err;
      }
    },
  };
}
