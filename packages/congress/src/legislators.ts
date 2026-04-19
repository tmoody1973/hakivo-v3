/**
 * Legislator roster fetcher — sources from the canonical open-data repo at
 *   https://github.com/unitedstates/congress-legislators
 *
 * We merge two YAML files per run:
 *   - legislators-current.yaml     — identity + term + office
 *   - legislators-social-media.yaml — Twitter, YouTube, Facebook, Instagram
 *
 * Photos: the original theunitedstates.io CDN started returning 403 in
 * April 2026. The same images mirror at raw.githubusercontent.com from
 * the unitedstates/images repo (gh-pages branch) — same path layout,
 * still 200 OK, no auth required. Hot-link directly from there.
 *
 * Updates weekly is fine: roster changes are rare (resignations, special
 * elections, deaths) and social-media handles churn slowly.
 */

import yaml from "js-yaml";

const CURRENT_URL =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-current.yaml";
const SOCIAL_URL =
  "https://raw.githubusercontent.com/unitedstates/congress-legislators/main/legislators-social-media.yaml";

const PHOTO_URL = (bioguideId: string) =>
  `https://raw.githubusercontent.com/unitedstates/images/gh-pages/congress/225x275/${bioguideId}.jpg`;

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
  id: {
    bioguide: string;
    wikipedia?: string;
    fec?: readonly string[];
    opensecrets?: string;
  };
  name: { first: string; last: string; official_full?: string };
  terms: YamlTerm[];
};

type YamlSocial = {
  id: { bioguide: string };
  social: {
    twitter?: string;
    youtube?: string;
    youtube_id?: string;
    facebook?: string;
    instagram?: string;
  };
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
  readonly photoUrl: string;
  readonly wikipediaSlug?: string;
  readonly twitter?: string;
  readonly youtube?: string;
  readonly facebook?: string;
  readonly instagram?: string;
  readonly fecIds?: readonly string[];
  readonly opensecretsId?: string;
};

async function fetchYaml<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
  }
  return yaml.load(await res.text()) as T;
}

export async function fetchCurrentLegislators(): Promise<readonly Legislator[]> {
  const [current, socialRaw] = await Promise.all([
    fetchYaml<YamlLegislator[]>(CURRENT_URL),
    fetchYaml<YamlSocial[]>(SOCIAL_URL),
  ]);

  const socialByBioguide = new Map<string, YamlSocial["social"]>();
  for (const s of socialRaw) {
    if (s.id?.bioguide) socialByBioguide.set(s.id.bioguide, s.social);
  }

  return current
    .map((entry): Legislator | null => {
      const currentTerm = entry.terms[entry.terms.length - 1];
      if (!currentTerm) return null;
      const bioguideId = entry.id.bioguide;
      const fullName =
        entry.name.official_full ?? `${entry.name.first} ${entry.name.last}`;
      const social = socialByBioguide.get(bioguideId) ?? {};
      const result: Legislator = {
        bioguideId,
        firstName: entry.name.first,
        lastName: entry.name.last,
        fullName,
        state: currentTerm.state,
        chamber: currentTerm.type === "sen" ? "senate" : "house",
        district: currentTerm.district ?? null,
        party: currentTerm.party,
        termStart: currentTerm.start,
        termEnd: currentTerm.end,
        photoUrl: PHOTO_URL(bioguideId),
        ...(currentTerm.url !== undefined && { officialUrl: currentTerm.url }),
        ...(currentTerm.phone !== undefined && { phone: currentTerm.phone }),
        ...(currentTerm.office !== undefined && { office: currentTerm.office }),
        ...(entry.id.wikipedia !== undefined && {
          wikipediaSlug: entry.id.wikipedia,
        }),
        ...(social.twitter !== undefined && { twitter: social.twitter }),
        ...(social.youtube !== undefined && { youtube: social.youtube }),
        ...(social.facebook !== undefined && { facebook: social.facebook }),
        ...(social.instagram !== undefined && { instagram: social.instagram }),
        ...(entry.id.fec !== undefined &&
          entry.id.fec.length > 0 && { fecIds: entry.id.fec }),
        ...(entry.id.opensecrets !== undefined && {
          opensecretsId: entry.id.opensecrets,
        }),
      };
      return result;
    })
    .filter((l): l is Legislator => l !== null);
}
