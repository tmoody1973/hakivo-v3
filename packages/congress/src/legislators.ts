/**
 * Legislator roster fetcher — sources from the canonical open-data repo at
 *   https://github.com/unitedstates/congress-legislators
 *
 * That repo is community-maintained and updates as members resign, die,
 * lose special elections, or swap seats. For v3.0 we consume only the
 * current YAML file; historical terms live in a sibling file we don't need.
 */

import yaml from "js-yaml";

const CURRENT_URL =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml";

type YamlTerm = {
  type: "rep" | "sen";
  start: string;
  end: string;
  state: string;
  district?: number;
  party: string;
  url?: string;
  office?: string;
  phone?: string;
};

type YamlLegislator = {
  id: { bioguide: string };
  name: { first: string; last: string; official_full?: string };
  terms: YamlTerm[];
};

export type Legislator = {
  readonly bioguideId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly fullName: string;
  readonly state: string;
  readonly chamber: "house" | "senate";
  readonly district: number | null;
  readonly party: string;
  readonly termStart: string;
  readonly termEnd: string;
  readonly officialUrl?: string;
  readonly phone?: string;
  readonly office?: string;
};

export async function fetchCurrentLegislators(): Promise<readonly Legislator[]> {
  const res = await fetch(CURRENT_URL);
  if (!res.ok) {
    throw new Error(
      `Failed to fetch legislators: ${res.status} ${res.statusText}`,
    );
  }
  const text = await res.text();
  const raw = yaml.load(text) as YamlLegislator[];

  return raw
    .map((entry): Legislator | null => {
      const currentTerm = entry.terms[entry.terms.length - 1];
      if (!currentTerm) return null;
      const fullName =
        entry.name.official_full ?? `${entry.name.first} ${entry.name.last}`;
      const result: Legislator = {
        bioguideId: entry.id.bioguide,
        firstName: entry.name.first,
        lastName: entry.name.last,
        fullName,
        state: currentTerm.state,
        chamber: currentTerm.type === "sen" ? "senate" : "house",
        district: currentTerm.district ?? null,
        party: currentTerm.party,
        termStart: currentTerm.start,
        termEnd: currentTerm.end,
        ...(currentTerm.url !== undefined && { officialUrl: currentTerm.url }),
        ...(currentTerm.phone !== undefined && { phone: currentTerm.phone }),
        ...(currentTerm.office !== undefined && { office: currentTerm.office }),
      };
      return result;
    })
    .filter((l): l is Legislator => l !== null);
}
