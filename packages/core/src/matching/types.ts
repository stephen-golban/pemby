// The two sides of a match, as plain data. Every matching function in this package takes these and
// returns plain data: no database rows, no Date.now(), no I/O (PLAN section 4).
//
// The caller assembles a `MatchUser` from `profiles` plus the parsed CV, and a `MatchJob` from
// `jobs`, `job_enrichment` and the `job_eligibility` row that matched. Field names follow the
// database columns so the mapping stays obvious.

import type { EligibilityTier } from "../eligibility";
import type { CountryCode } from "../eligibility/regions";
import type { RoleFamily } from "../roles";
import type { EmploymentType, Seniority, WayOfWorking } from "../ways-of-working";
import type { PayPeriod } from "./money";

/** `match_pass_reason` pg enum values, exactly. The only reasons a user can pick (PLAN D6). */
export const MATCH_PASS_REASONS = [
  "location",
  "salary",
  "seniority",
  "stack",
  "company",
  "role",
  "already_applied",
  "other",
] as const;
export type MatchPassReason = (typeof MATCH_PASS_REASONS)[number];

/**
 * The structured time-zone ask from a post (`job_enrichment.timezone_constraint`). Offsets are
 * whole hours from UTC; `overlapHours` is the overlap the post requires with that window.
 */
export interface TimezoneWindow {
  minUtcOffset: number | null;
  maxUtcOffset: number | null;
  overlapHours: number | null;
}

export interface MatchUser {
  /** ISO 3166-1 alpha-2, upper case. */
  residenceCountry: CountryCode | null;
  /** IANA zone, kept for display; matching uses `utcOffsetHours`. */
  timezone: string | null;
  /**
   * Whole hours from UTC. Null lets the matcher fall back to `residenceCountry`; core does no
   * time-zone database work of its own.
   */
  utcOffsetHours: number | null;
  minOverlapHours: number | null;
  waysOfWorking: readonly WayOfWorking[];
  employmentTypes: readonly EmploymentType[];
  seniority: Seniority | null;
  yearsExperience: number | null;
  stack: readonly string[];
  domains: readonly string[];
  /** Free text from onboarding, matched against the job's structured fields. */
  dealbreakers: readonly string[];
  minRate: number | null;
  minRateCurrency: string | null;
  minRatePeriod: PayPeriod | null;
  hideNoSalary: boolean;
  /**
   * `profiles.include_yellow`. Carried for the entitlements call and the UI; the gates read
   * `allowedTiers` only, because entitlements is the one place that decides the yellow opt-in
   * (PLAN section 5).
   */
  includeYellow: boolean;
}

export interface MatchJob {
  companyId: string | null;
  /** Tier of the `job_eligibility` row for this user's country and way of working. */
  tier: EligibilityTier | null;
  /** The way of working that eligibility row is about, when it is about one. */
  wayOfWorking: WayOfWorking | null;
  /** Ways the post itself supports (`job_enrichment.ways_of_working`). */
  waysOfWorking: readonly WayOfWorking[];
  employmentTypes: readonly EmploymentType[];
  lastVerifiedLiveAt: Date | null;
  firstSeenAt: Date | null;
  seniority: Seniority | null;
  yearsMin: number | null;
  stack: readonly string[];
  domains: readonly string[];
  /** `job_enrichment.red_flags`; dealbreakers are matched against these too. */
  redFlags: readonly string[];
  roleFamily: RoleFamily | null;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: PayPeriod | null;
  timezone: TimezoneWindow | null;
  /** PLAN D11: the post asks the candidate for money. Never a match, never a near miss. */
  asksCandidateForMoney: boolean;
}

/** True when the post states pay at all. */
export function jobListsSalary(job: MatchJob): boolean {
  return (
    (job.salaryMin !== null || job.salaryMax !== null) &&
    job.salaryCurrency !== null &&
    job.salaryPeriod !== null
  );
}
