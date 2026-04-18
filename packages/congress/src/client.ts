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

/**
 * Note: Congress.gov returns `number` as a string (e.g., "144") but `congress`
 * as a number. Callers must coerce `number` with `Number()` before storing.
 */
export type BillListItem = {
  readonly congress: number;
  readonly type: string;
  readonly number: string;
  readonly title: string;
  readonly introducedDate: string | null;
  readonly latestAction: { readonly actionDate: string; readonly text: string } | null;
  readonly updateDate: string;
};

export type BillDetail = BillListItem & {
  readonly summaries: readonly { readonly text: string }[];
  readonly textVersions: readonly { readonly type: string; readonly date: string; readonly formats: readonly { readonly type: string; readonly url: string }[] }[];
};

export type BillAction = {
  readonly actionDate: string;
  readonly text: string;
  readonly type: string;
  readonly actionCode?: string;
  readonly sourceSystem?: { readonly name: string };
};

export type BillCosponsor = {
  readonly bioguideId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly party: string;
  readonly state: string;
  readonly district?: number;
  readonly sponsorshipDate: string;
  readonly isOriginalCosponsor: boolean;
  readonly sponsorshipWithdrawnDate?: string;
};

export type BillSubjects = {
  readonly policyArea: { readonly name: string } | null;
  readonly legislativeSubjects: readonly { readonly name: string }[];
};

export type BillSummary = {
  readonly actionDate: string;
  readonly actionDesc: string;
  readonly text: string;
  readonly updateDate: string;
  readonly versionCode: string;
};

export type BillTextVersion = {
  readonly type: string;
  readonly date: string;
  readonly formats: readonly {
    readonly type: string;
    readonly url: string;
  }[];
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
  readonly getBillActions: (args: {
    readonly congress: number;
    readonly type: string;
    readonly number: number;
    readonly limit?: number;
  }) => Promise<readonly BillAction[]>;
  readonly getBillCosponsors: (args: {
    readonly congress: number;
    readonly type: string;
    readonly number: number;
    readonly limit?: number;
  }) => Promise<readonly BillCosponsor[]>;
  readonly getBillSubjects: (args: {
    readonly congress: number;
    readonly type: string;
    readonly number: number;
  }) => Promise<BillSubjects>;
  readonly getBillSummaries: (args: {
    readonly congress: number;
    readonly type: string;
    readonly number: number;
  }) => Promise<readonly BillSummary[]>;
  readonly getBillTextVersions: (args: {
    readonly congress: number;
    readonly type: string;
    readonly number: number;
  }) => Promise<readonly BillTextVersion[]>;
  /**
   * Fetches the latest bill text in plain form. Prefers "Formatted Text"
   * (HTML with semantic markup), strips tags. Returns null if no text
   * version has been published yet (common for recently-introduced bills).
   */
  readonly getLatestBillText: (args: {
    readonly congress: number;
    readonly type: string;
    readonly number: number;
  }) => Promise<{ readonly text: string; readonly source: string } | null>;
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

    async getBillActions({ congress, type, number, limit = 250 }) {
      type Response = { actions: readonly BillAction[] };
      const data = await request<Response>(
        `/bill/${congress}/${type}/${number}/actions`,
        { limit },
      );
      return data.actions;
    },

    async getBillCosponsors({ congress, type, number, limit = 250 }) {
      type Response = { cosponsors: readonly BillCosponsor[] };
      const data = await request<Response>(
        `/bill/${congress}/${type}/${number}/cosponsors`,
        { limit },
      );
      return data.cosponsors;
    },

    async getBillSubjects({ congress, type, number }) {
      type Response = {
        subjects: {
          policyArea?: { name: string };
          legislativeSubjects?: readonly { name: string }[];
        };
      };
      const data = await request<Response>(
        `/bill/${congress}/${type}/${number}/subjects`,
      );
      return {
        policyArea: data.subjects.policyArea ?? null,
        legislativeSubjects: data.subjects.legislativeSubjects ?? [],
      };
    },

    async getBillSummaries({ congress, type, number }) {
      type Response = { summaries: readonly BillSummary[] };
      const data = await request<Response>(
        `/bill/${congress}/${type}/${number}/summaries`,
      );
      return data.summaries;
    },

    async getBillTextVersions({ congress, type, number }) {
      type Response = { textVersions: readonly BillTextVersion[] };
      const data = await request<Response>(
        `/bill/${congress}/${type}/${number}/text`,
      );
      return data.textVersions;
    },

    async getLatestBillText({ congress, type, number }) {
      const versions = await this.getBillTextVersions({
        congress,
        type,
        number,
      });
      if (versions.length === 0) return null;
      // textVersions list is newest-first in the Congress.gov response.
      const latest = versions[0]!;
      const html =
        latest.formats.find((f) => f.type === "Formatted Text") ??
        latest.formats.find((f) => f.type === "Formatted XML") ??
        latest.formats[0];
      if (!html) return null;
      const res = await fetch(html.url);
      if (!res.ok) {
        throw new CongressApiError(
          res.status,
          `Failed to fetch bill text at ${html.url}: ${res.status} ${res.statusText}`,
        );
      }
      const raw = await res.text();
      const plain = stripHtml(raw).trim();
      return { text: plain, source: latest.type };
    },
  };
}

/**
 * Minimal HTML → plain text stripper for Congress.gov "Formatted Text"
 * (HTML with light semantic markup). Removes <style>, <script>, tags,
 * collapses whitespace. No external dep — keeps @hakivo/congress lean.
 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(p|div|h[1-6]|li|br|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#8217;/g, "’")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n");
}
