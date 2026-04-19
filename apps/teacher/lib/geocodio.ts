import "server-only";

/**
 * Minimal Geocodio v1.7 client. We only need address → districts for the
 * /representatives lookup. Geocodio's `cd` field returns congressional
 * district; `stateleg` returns state legislative districts (used in v3.1
 * once state legislator data is ingested from OpenStates).
 */

const BASE_URL = "https://api.geocod.io/v1.7/geocode";

export type RepresentativeDistricts = {
  readonly state: string;                  // "WI"
  readonly congressionalDistrict: number;  // 4
  readonly stateSenateDistrict?: string;   // "6"
  readonly stateHouseDistrict?: string;    // "21"
  readonly formattedAddress: string;
  readonly latitude: number;
  readonly longitude: number;
};

export class GeocodioError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = "GeocodioError";
  }
}

export async function lookupDistricts(
  address: string,
): Promise<RepresentativeDistricts | null> {
  const apiKey = process.env.GEOCODIO_API_KEY;
  if (!apiKey) throw new Error("GEOCODIO_API_KEY not set");

  const url = `${BASE_URL}?q=${encodeURIComponent(address)}&fields=cd,stateleg&api_key=${apiKey}&limit=1`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new GeocodioError(
      res.status,
      `Geocodio failed: ${res.status} ${res.statusText}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }
  const data = (await res.json()) as {
    results?: ReadonlyArray<{
      formatted_address: string;
      address_components: { state: string };
      location: { lat: number; lng: number };
      fields: {
        congressional_districts?: ReadonlyArray<{
          district_number: number;
        }>;
        state_legislative_districts?: {
          senate?: ReadonlyArray<{ district_number: string }>;
          house?: ReadonlyArray<{ district_number: string }>;
        };
      };
    }>;
  };

  const first = data.results?.[0];
  if (!first) return null;
  const cd = first.fields.congressional_districts?.[0];
  if (!cd) return null;

  const stateLeg = first.fields.state_legislative_districts;
  const stateSenate = stateLeg?.senate?.[0]?.district_number;
  const stateHouse = stateLeg?.house?.[0]?.district_number;

  return {
    state: first.address_components.state,
    congressionalDistrict: cd.district_number,
    formattedAddress: first.formatted_address,
    latitude: first.location.lat,
    longitude: first.location.lng,
    ...(stateSenate !== undefined && { stateSenateDistrict: stateSenate }),
    ...(stateHouse !== undefined && { stateHouseDistrict: stateHouse }),
  };
}
