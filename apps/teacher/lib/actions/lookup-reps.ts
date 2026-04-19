"use server";

import { api, type Doc } from "@hakivo/db";
import { fetchQuery } from "convex/nextjs";
import { lookupDistricts, type RepresentativeDistricts } from "@/lib/geocodio";

export type RepLookupState =
  | { error: string }
  | {
      ok: true;
      districts: RepresentativeDistricts;
      senators: readonly Doc<"legislators">[];
      houseRep: Doc<"legislators"> | null;
    }
  | null;

export async function lookupReps(
  _prev: RepLookupState,
  formData: FormData,
): Promise<RepLookupState> {
  const address = (formData.get("address") as string | null)?.trim();
  if (!address) return { error: "Enter an address." };

  let districts: RepresentativeDistricts | null;
  try {
    districts = await lookupDistricts(address);
  } catch (err) {
    return {
      error: `Geocodio: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
  if (!districts) {
    return { error: "Couldn't resolve that address. Try a more specific one." };
  }

  const result = await fetchQuery(api.legislators.findFederalForAddress, {
    state: districts.state,
    congressionalDistrict: districts.congressionalDistrict,
  });

  return {
    ok: true,
    districts,
    senators: result.senators,
    houseRep: result.houseRep,
  };
}
