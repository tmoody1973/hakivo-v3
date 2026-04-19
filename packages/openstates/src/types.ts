/**
 * Subset of the OpenStates v3 API response shapes that we actually use.
 * Full schema at https://docs.openstates.org/api-v3/ — only the fields
 * Hakivo cares about are typed here.
 */

export type OpenStatesJurisdiction = {
  readonly id: string; // "ocd-jurisdiction/country:us/state:wi/government"
  readonly name: string; // "Wisconsin"
  readonly classification: string; // "state"
};

export type OpenStatesOrganization = {
  readonly id: string;
  readonly name: string; // "Assembly" / "Senate"
  readonly classification: string; // "lower" / "upper"
};

export type OpenStatesPersonRef = {
  readonly id: string; // "ocd-person/<uuid>"
  readonly name: string;
  readonly party?: string; // "Democratic" / "Republican" / "Independent"
  readonly current_role?: {
    readonly title: string;
    readonly org_classification?: string;
    readonly district?: string | number;
    readonly division_id?: string;
  };
};

export type OpenStatesSponsorship = {
  readonly id: string;
  readonly name: string;
  readonly entity_type: "person" | "organization";
  readonly person?: OpenStatesPersonRef;
  readonly primary: boolean;
  readonly classification: "primary" | "cosponsor" | string;
};

export type OpenStatesAction = {
  readonly id: string;
  readonly organization?: OpenStatesOrganization;
  readonly description: string;
  readonly date: string; // ISO
  readonly classification: ReadonlyArray<string>;
  readonly order: number;
};

export type OpenStatesSource = {
  readonly url: string;
  readonly note?: string;
};

export type OpenStatesAbstract = {
  readonly abstract: string;
  readonly note?: string;
};

export type OpenStatesBill = {
  readonly id: string; // "ocd-bill/<uuid>"
  readonly session: string; // "2025"
  readonly jurisdiction: OpenStatesJurisdiction;
  readonly from_organization: OpenStatesOrganization;
  readonly identifier: string; // "AB 1206"
  readonly title: string;
  readonly classification: ReadonlyArray<string>; // ["bill"] / ["resolution"]
  readonly subject: ReadonlyArray<string>;
  readonly created_at: string;
  readonly updated_at: string;
  readonly openstates_url: string;
  readonly first_action_date?: string;
  readonly latest_action_date?: string;
  readonly latest_action_description?: string;
  readonly latest_passage_date?: string;
  readonly abstracts: ReadonlyArray<OpenStatesAbstract>;
  readonly sponsorships: ReadonlyArray<OpenStatesSponsorship>;
  readonly actions: ReadonlyArray<OpenStatesAction>;
  readonly sources: ReadonlyArray<OpenStatesSource>;
  readonly extras?: Record<string, unknown>;
};

export type OpenStatesPagination = {
  readonly per_page: number;
  readonly page: number;
  readonly max_page: number;
  readonly total_items: number;
};

export type OpenStatesBillsResponse = {
  readonly results: ReadonlyArray<OpenStatesBill>;
  readonly pagination: OpenStatesPagination;
};
