// Teaser: "N roles hire from your country" shown after a CV drop (phase 06 contract, flow step 7)
// and in the rail on /onboarding and /profile.
//
// Everything outside this folder talks to `TeaserSource` only. Phase 07 replaced the phase 06
// hand-rolled SQL gates behind it with the real matcher (`evaluateGates` + `scoreMatch` from
// `@pemby/core`), so this count and the Brief agree about what qualifies. The seam and the UI are
// unchanged; only what sits behind `getTeaserSource()` moved.

import type {
  EmploymentType,
  EngineReasonKey,
  EligibilityTier,
  PayPeriod,
  Seniority,
  WayOfWorking,
} from "@pemby/core";
import { sqlTeaserSource } from "./sql-source";

export { teaserInputFromProfile, type TeaserProfileRow } from "./input";
export { loadTeaserInput } from "./load";

/**
 * The person's side of the match, as the teaser knows it: their profile row where there is one,
 * falling back field by field to the latest parsed CV (`input.ts`).
 *
 * Every field the hard gates read has a home here. A field left at its "no constraint" value
 * (empty list, null, false) makes the gate pass, so a thin anonymous profile is not punished for
 * what it has not said yet.
 */
export interface TeaserInput {
  /** ISO 3166-1 alpha-2, upper case, or null when neither the profile nor the CV names one. */
  country: string | null;
  /** Core spelling. */
  ways: WayOfWorking[];
  seniority: Seniority | null;
  titles: string[];
  stack: string[];
  /** Years of professional experience. Null is read as "not stated", never as zero years. */
  yearsExperience: number | null;
  domains: string[];
  employmentTypes: EmploymentType[];
  dealbreakers: string[];
  minRate: number | null;
  minRateCurrency: string | null;
  minRatePeriod: PayPeriod | null;
  hideNoSalary: boolean;
  /** IANA zone, kept for display; the score uses the country's offset. */
  timezone: string | null;
  minOverlapHours: number | null;
  /**
   * `profiles.include_yellow` (PLAN D13 amended 2026-09-17: the opt-in is free, not pass-only).
   * Always false for an anonymous visitor, who has no profile to opt in with (`load.ts`), and
   * never settable from the query string.
   */
  includeYellow: boolean;
}

/** Public job data only: nothing here comes from the user. */
export interface TeaserJob {
  id: string;
  title: string;
  company: string;
  location: string | null;
  url: string;
  /** Tier of the eligibility row this job matched on. Yellow is labelled distinctly (PLAN D2). */
  tier: EligibilityTier;
  /**
   * Engine reason key of the `job_eligibility` row, read from its `reason_key` column. Null only
   * for rows written before migration 0008, which carry English text and no key.
   */
  reasonKey: EngineReasonKey | null;
  reasonParams: Record<string, string>;
  /**
   * The row's stored English `reason`. The fallback for a row with no key, so a verdict is never
   * shown blank while the backfill is still running.
   */
  reasonText: string;
}

export type TeaserBasis = "ok" | "unsupported_country" | "no_country";

export interface TeaserResult {
  country: string | null;
  countryName: string | null;
  /** Distinct jobs clearing the gates, green and yellow together; null unless `basis` is `ok`. */
  count: number | null;
  /**
   * The green half of `count`: posts that say outright they hire from the country.
   *
   * Green and yellow are counted apart because the surfaces make a firm claim about one of them and
   * only a soft one about the other. A single total would let "N roles hire from {country}" stand
   * over posts Pemby judges no more than likely, which is the claim the tiers exist to avoid
   * (PLAN D2 and D13, both amended 2026-09-17: the yellow opt-in is free, white and red never show).
   */
  greenCount: number | null;
  /** The yellow half of `count`. Zero, not null, whenever the yellow opt-in is off. */
  yellowCount: number | null;
  /** At most `opts.limit` (default 3), best score first. */
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

/** SQL pre-filter, then `evaluateGates` and `scoreMatch` from `@pemby/core` (`sql-source.ts`). */
export function getTeaserSource(): TeaserSource {
  return sqlTeaserSource;
}
