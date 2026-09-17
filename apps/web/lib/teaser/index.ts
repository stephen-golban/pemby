// Teaser: "N jobs hire from your country" shown after a CV drop (phase 06 contract, flow step 7).
//
// Everything outside this folder talks to `TeaserSource` only, so phase 07 replaces the phase 06
// SQL gates with the real matcher by changing `getTeaserSource()` and nothing else.

import type { EngineReasonKey, Seniority, WayOfWorking } from "@pemby/core";
import { sqlTeaserSource } from "./sql-source";

export { teaserInputFromProfile, type TeaserProfileRow } from "./input";
export { loadTeaserInput } from "./load";

export interface TeaserInput {
  /** ISO 3166-1 alpha-2, upper case, or null when neither the profile nor the CV names one. */
  country: string | null;
  /** Core spelling. */
  ways: WayOfWorking[];
  seniority: Seniority | null;
  titles: string[];
  stack: string[];
}

/** Public job data only: nothing here comes from the user. */
export interface TeaserJob {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  /**
   * Engine reason key of the green `job_eligibility` row, recovered from its stored English text.
   * Null only when the stored text matches no engine template (legacy or hand-written rows).
   */
  reasonKey: EngineReasonKey | null;
  reasonParams: Record<string, string>;
}

export type TeaserBasis = "ok" | "unsupported_country" | "no_country";

export interface TeaserResult {
  country: string | null;
  countryName: string | null;
  /** Distinct jobs clearing the gates; null unless `basis` is `ok`. */
  count: number | null;
  /** At most `opts.limit` (default 3). */
  jobs: TeaserJob[];
  basis: TeaserBasis;
}

export interface TeaserOptions {
  /** Sample size, default 3. */
  limit?: number;
}

export interface TeaserSource {
  teaser(input: TeaserInput, opts?: TeaserOptions): Promise<TeaserResult>;
}

/** Phase 06: SQL gates over `job_eligibility` and `job_enrichment`. Phase 07 swaps this. */
export function getTeaserSource(): TeaserSource {
  return sqlTeaserSource;
}
