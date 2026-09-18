import {
  DB_SENIORITIES,
  DB_WAYS_OF_WORKING,
  EMPLOYMENT_TYPES,
  PAY_PERIODS,
  SENIORITIES,
  defaultWaysFor,
  fromDbSeniority,
  fromDbWay,
  isCountryCode,
  type DbSeniority,
  type DbWayOfWorking,
  type EmploymentType,
  type PayPeriod,
  type Seniority,
} from "@pemby/core";
import type { TeaserInput } from "./index";

/** The `profiles` columns the teaser reads, as raw SQL returns them (enum arrays cast to text[]). */
export interface TeaserProfileRow {
  residence_country: string | null;
  ways_of_working: string[];
  seniority: string | null;
  titles: string[];
  stack: string[];
  years_experience: number | null;
  employment_types: string[];
  dealbreakers: string[];
  min_rate: number | null;
  min_rate_currency: string | null;
  min_rate_period: string | null;
  hide_no_salary: boolean;
  timezone: string | null;
  min_overlap_hours: number | null;
  /** Already ANDed with "not an anonymous user" by `load.ts`. */
  include_yellow: boolean;
}

const isDbWay = (v: unknown): v is DbWayOfWorking =>
  typeof v === "string" && (DB_WAYS_OF_WORKING as readonly string[]).includes(v);
const isDbSeniority = (v: unknown): v is DbSeniority =>
  typeof v === "string" && (DB_SENIORITIES as readonly string[]).includes(v);
const isSeniority = (v: unknown): v is Seniority =>
  typeof v === "string" && (SENIORITIES as readonly string[]).includes(v);
const isPayPeriod = (v: unknown): v is PayPeriod =>
  typeof v === "string" && (PAY_PERIODS as readonly string[]).includes(v);

/**
 * `employment_type` pg enum values. Core spells these with hyphens and ships no mapper for them,
 * so the pair is written out here with a `satisfies` that makes a drift a type error — the same
 * shape `apps/web/app/api/profile/_lib/db.ts` uses, and with the same note: these belong in
 * `@pemby/core` beside `fromDbWay` and `fromDbSeniority`.
 */
const EMPLOYMENT_FROM_DB = {
  full_time: "full-time",
  part_time: "part-time",
  contract_to_hire: "contract-to-hire",
} as const satisfies Record<string, EmploymentType>;

type DbEmploymentType = keyof typeof EMPLOYMENT_FROM_DB;

const isDbEmployment = (v: unknown): v is DbEmploymentType =>
  typeof v === "string" && Object.hasOwn(EMPLOYMENT_FROM_DB, v);

const isEmployment = (v: unknown): v is EmploymentType =>
  typeof v === "string" && (EMPLOYMENT_TYPES as readonly string[]).includes(v);

function strings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((s): s is string => typeof s === "string" && s.trim() !== "")
    .map((s) => s.trim());
}

function countryOf(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const code = v.trim().toUpperCase();
  return isCountryCode(code) ? code : null;
}

/** A finite, non-negative number, or null. Guards against a model returning "5" or NaN. */
function years(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return null;
  return Math.min(Math.round(v), 60);
}

/**
 * Teaser input from a `profiles` row, field by field falling back to the latest parsed CV
 * (`cv_files.parsed`, read defensively because demo and older rows may not match `ParsedProfile`).
 * Empty ways fall back to `defaultWaysFor(seniority)`.
 *
 * Every field the hard gates read is filled here, because phase 07 runs the real `evaluateGates`
 * behind this input. A gate reading a field the teaser left empty would fail jobs for a reason the
 * person never gave: `yearsExperience` is the sharp one, since the seniority gate compares a post's
 * `years_min` against it.
 */
export function teaserInputFromProfile(
  profileRow: TeaserProfileRow | null,
  latestParsed: unknown,
): TeaserInput {
  const parsed =
    latestParsed && typeof latestParsed === "object"
      ? (latestParsed as Record<string, unknown>)
      : {};
  const parsedLocation =
    parsed.location && typeof parsed.location === "object"
      ? (parsed.location as Record<string, unknown>)
      : {};

  const country = countryOf(profileRow?.residence_country) ?? countryOf(parsedLocation.country);

  const seniority: Seniority | null = isDbSeniority(profileRow?.seniority)
    ? fromDbSeniority(profileRow.seniority)
    : isSeniority(parsed.seniority)
      ? parsed.seniority
      : null;

  const profileWays = (profileRow?.ways_of_working ?? []).filter(isDbWay).map(fromDbWay);
  const ways = profileWays.length > 0 ? [...new Set(profileWays)] : defaultWaysFor(seniority);

  const profileTitles = strings(profileRow?.titles);
  const profileStack = strings(profileRow?.stack);

  const employmentTypes = [
    ...new Set(
      (profileRow?.employment_types ?? [])
        .filter(isDbEmployment)
        .map((value) => EMPLOYMENT_FROM_DB[value]),
    ),
  ].filter(isEmployment);

  const period = profileRow?.min_rate_period;

  return {
    country,
    ways,
    seniority,
    titles: profileTitles.length > 0 ? profileTitles : strings(parsed.titles),
    stack: profileStack.length > 0 ? profileStack : strings(parsed.stack),
    yearsExperience: years(profileRow?.years_experience) ?? years(parsed.yearsExperience),
    // `profiles` has no domains column (PLAN D5 never asked for one), so the CV is the only source.
    domains: strings(parsed.domains),
    employmentTypes,
    dealbreakers: strings(profileRow?.dealbreakers),
    minRate:
      typeof profileRow?.min_rate === "number" && Number.isFinite(profileRow.min_rate)
        ? profileRow.min_rate
        : null,
    minRateCurrency: profileRow?.min_rate_currency ?? null,
    minRatePeriod: isPayPeriod(period) ? period : null,
    hideNoSalary: profileRow?.hide_no_salary === true,
    timezone:
      profileRow?.timezone ??
      (typeof parsed.timezoneGuess === "string" ? parsed.timezoneGuess : null),
    minOverlapHours:
      typeof profileRow?.min_overlap_hours === "number" ? profileRow.min_overlap_hours : null,
    includeYellow: profileRow?.include_yellow === true,
  };
}
