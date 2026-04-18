/**
 * @hakivo/standards
 *
 * Structured metadata for standards alignment:
 *   - NCSS C3 Framework (4 dimensions)
 *   - AP US Government & Politics CED (5 units)
 *   - Top-10 state standards: CA, TX, FL, NY, IL, PA, OH, GA, NC, MI
 *
 * Week-1 scaffold: type shapes only. Taxonomies land in week 2-3.
 */

export type C3Dimension =
  | "developing_questions"
  | "applying_disciplinary_tools"
  | "evaluating_sources"
  | "communicating_conclusions";

export type ApCedUnit = "unit_1" | "unit_2" | "unit_3" | "unit_4" | "unit_5";

export type CoveredState =
  | "CA"
  | "TX"
  | "FL"
  | "NY"
  | "IL"
  | "PA"
  | "OH"
  | "GA"
  | "NC"
  | "MI";

export interface StandardEntry {
  readonly id: string;
  readonly description: string;
  readonly gradeBand: string;
  readonly alignmentHints: readonly string[];
}

export interface StandardsCatalog {
  readonly c3: Readonly<Record<C3Dimension, StandardEntry>>;
  readonly apCed: Readonly<Record<ApCedUnit, StandardEntry>>;
  readonly states: Readonly<Record<CoveredState, readonly StandardEntry[]>>;
}
