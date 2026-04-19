"use server";

/**
 * Server action that hits Geocodio with a partial address query and
 * returns the top N matches. Used as the data source for the
 * <AddressAutocomplete /> client typeahead.
 *
 * Geocodio isn't a true typeahead service — it's a forward geocoder
 * that happens to handle partial input gracefully. Results aren't
 * "completions" in the Google Places sense, they're the geocoder's
 * best matches. For our use case (one-time address entry to find
 * federal reps) that's plenty.
 *
 * Same GEOCODIO_API_KEY the rep lookup already uses.
 */

const GEOCODIO_BASE = "https://api.geocod.io/v1.7/geocode";

export type AddressSuggestion = {
  readonly formattedAddress: string;
  readonly accuracy: number;
};

export async function searchAddresses(
  query: string,
  limit = 5,
): Promise<ReadonlyArray<AddressSuggestion>> {
  const text = query.trim();
  if (text.length < 4) return [];

  const apiKey = process.env.GEOCODIO_API_KEY;
  if (!apiKey) {
    throw new Error("GEOCODIO_API_KEY not set");
  }

  const params = new URLSearchParams({
    q: text,
    api_key: apiKey,
    limit: String(limit),
    country: "us",
  });

  const res = await fetch(`${GEOCODIO_BASE}?${params}`, {
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`Geocodio ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as {
    readonly results?: ReadonlyArray<{
      readonly formatted_address?: string;
      readonly accuracy?: number;
    }>;
  };

  return (json.results ?? [])
    .filter((r) => Boolean(r.formatted_address))
    .map((r) => ({
      formattedAddress: r.formatted_address!,
      accuracy: r.accuracy ?? 0,
    }));
}
