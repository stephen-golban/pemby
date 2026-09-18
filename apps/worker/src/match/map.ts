// Database rows -> the plain data `@pemby/core` matches on. Pure, and the only place in the worker
// that converts between the two spellings, so the two fan-out directions cannot drift apart.
import {
  FRESHNESS_HOURS,
  JUNIOR_SENIORITY_DISTANCE,
  ROLE_FAMILIES,
  SENIORITIES,
  SENIORITY_DISTANCE,
  compatibleFamilies,
  deliverAfter,
  entitlementsFor,
  fromDbSeniority,
  fromDbWay,
  isCountryCode,
  toDbSeniority,
  type ActivePass,
  type CountryCode,
  type EmploymentType,
  type MatchUser,
  type PayPeriod,
  type RoleFamily,
  type Seniority,
  type TimezoneWindow,
  type WayOfWorking,
} from "@pemby/core";
import type {
  DbEmploymentType,
  DbSeniority,
  DbWayOfWorking,
  MatchCandidateJob,
  MatchCandidateUser,
  TimezoneConstraint,
} from "@pemby/db";
import type { JobFacts, UserFacts } from "./evaluate";
import type { MatchJobRow, MatchProfileRow } from "./db";

/**
 * `employment_type` pg enum values. Core spells these with hyphens and ships no mapper, so the pair
 * is written out with a `satisfies` that makes drift a type error — the same shape, and the same
 * note, as `apps/web/lib/teaser/input.ts`: this belongs in `@pemby/core` beside `fromDbWay`.
 */
const EMPLOYMENT_FROM_DB = {
  full_time: "full-time",
  part_time: "part-time",
  contract_to_hire: "contract-to-hire",
} as const satisfies Record<DbEmploymentType, EmploymentType>;

const coreWays = (values: readonly DbWayOfWorking[]): WayOfWorking[] => [
  ...new Set(values.map(fromDbWay)),
];

const coreEmployment = (values: readonly DbEmploymentType[]): EmploymentType[] => [
  ...new Set(values.map((v) => EMPLOYMENT_FROM_DB[v])),
];

const coreSeniority = (value: DbSeniority | null): Seniority | null =>
  value === null ? null : fromDbSeniority(value);

const coreCountry = (value: string | null): CountryCode | null => {
  if (value === null) return null;
  const code = value.trim().toUpperCase();
  return isCountryCode(code) ? code : null;
};

const wholeHours = (value: number | null | undefined): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/**
 * Null when the post set no band at all, which `timezoneOverlap` reads as "the post does not say"
 * — no signal, not a full working day of overlap, and the component is left unscored.
 */
export function coreTimezone(value: TimezoneConstraint | null): TimezoneWindow | null {
  if (!value) return null;
  const min = wholeHours(value.minUtcOffset);
  const max = wholeHours(value.maxUtcOffset);
  const overlap = wholeHours(value.overlapHours);
  if (min === null && max === null && overlap === null) return null;
  return { minUtcOffset: min, maxUtcOffset: max, overlapHours: overlap };
}

/**
 * `jobs.role_family` as a `RoleFamily`, or null when it is not one.
 *
 * Checked, not cast. The column is plain `text` — the deterministic PLAN D10 slug is written by the
 * classifier, not enforced by an enum — and a blind `as RoleFamily` turned any string at all into a
 * role family. `evaluatePair` then compared that string against `compatibleFamilies(titles)`, found
 * it in no one's list, and skipped the job **for every user with titles on their profile**: one bad
 * slug silently removed a post from the product, with a `role-family` skip as the only trace. Null
 * is the honest answer and means "the post has no family we recognise", which turns the role filter
 * off for the pair instead of turning it into a rejection.
 */
const coreRoleFamily = (value: string | null): RoleFamily | null =>
  value !== null && (ROLE_FAMILIES as readonly string[]).includes(value)
    ? (value as RoleFamily)
    : null;

const corePayPeriod = (value: string | null): PayPeriod | null => (value as PayPeriod) ?? null;

// ---- Job side --------------------------------------------------------------------------------

/**
 * The job half of a pair from the row `match.job` loads. `tier` and `wayOfWorking` are per user and
 * are filled in by `evaluatePair`, never here.
 */
export function jobFactsFromRow(row: MatchJobRow): JobFacts {
  return {
    jobId: row.jobId,
    firstSeenAt: row.firstSeenAt,
    base: {
      companyId: row.companyId,
      waysOfWorking: coreWays(row.waysOfWorking),
      employmentTypes: coreEmployment(row.employmentTypes),
      lastVerifiedLiveAt: row.lastVerifiedLiveAt,
      firstSeenAt: row.firstSeenAt,
      seniority: coreSeniority(row.seniority),
      yearsMin: row.yearsMin,
      stack: row.stack,
      domains: row.domains,
      redFlags: row.redFlags,
      roleFamily: coreRoleFamily(row.roleFamily),
      salaryMin: row.salaryMin,
      salaryMax: row.salaryMax,
      salaryCurrency: row.salaryCurrency,
      salaryPeriod: row.salaryPeriod,
      timezone: coreTimezone(row.timezoneConstraint),
      asksCandidateForMoney: row.asksCandidateForMoney,
    },
  };
}

/**
 * The job half from a `selectMatchCandidateJobs` row. That query already excludes money-asking
 * posts in SQL (PLAN D11) and does not return red flags, so the caller passes them in.
 */
export function jobFactsFromCandidate(
  job: MatchCandidateJob,
  redFlags: readonly string[],
): {
  facts: JobFacts;
  tier: MatchCandidateJob["tier"];
  wayOfWorking: WayOfWorking;
} {
  return {
    facts: {
      jobId: job.jobId,
      firstSeenAt: job.firstSeenAt,
      base: {
        companyId: job.companyId,
        waysOfWorking: coreWays(job.waysOfWorking),
        employmentTypes: coreEmployment(job.employmentTypes),
        lastVerifiedLiveAt: job.lastVerifiedLiveAt,
        firstSeenAt: job.firstSeenAt,
        seniority: coreSeniority(job.seniority),
        yearsMin: job.yearsMin,
        stack: job.stack,
        domains: job.domains,
        redFlags: [...redFlags],
        roleFamily: coreRoleFamily(job.roleFamily),
        salaryMin: job.salaryMin,
        salaryMax: job.salaryMax,
        salaryCurrency: job.salaryCurrency,
        salaryPeriod: job.salaryPeriod,
        timezone: coreTimezone(job.timezoneConstraint),
        asksCandidateForMoney: false,
      },
    },
    tier: job.tier,
    wayOfWorking: fromDbWay(job.wayOfWorking),
  };
}

/**
 * Whether the job can clear the freshness gate at all (PLAN D6: verified live in the last 24h).
 *
 * Checked once per job, before the fan-out. The gate would fail identically for every user, and a
 * near miss whose blocker is "this posting is stale" has no one-tap fix and no business being in
 * anyone's Brief; the profile direction never produces one either, because
 * `selectMatchCandidateJobs` applies the same window in SQL.
 */
export function withinFreshnessWindow(
  lastVerifiedLiveAt: Date | null,
  now: Date,
  hours: number = FRESHNESS_HOURS,
): boolean {
  if (lastVerifiedLiveAt === null) return false;
  return (now.getTime() - lastVerifiedLiveAt.getTime()) / 3_600_000 <= hours;
}

// ---- User side -------------------------------------------------------------------------------

/** The fields both candidate shapes share, so one function builds `UserFacts` from either. */
interface UserSource {
  profileId: string;
  userId: string;
  residenceCountry: string | null;
  timezone: string | null;
  minOverlapHours: number | null;
  waysOfWorking: DbWayOfWorking[];
  employmentTypes: DbEmploymentType[];
  titles: string[];
  seniority: DbSeniority | null;
  yearsExperience: number | null;
  stack: string[];
  dealbreakers: string[];
  minRate: number | null;
  minRateCurrency: string | null;
  minRatePeriod: string | null;
  hideNoSalary: boolean;
  includeYellow: boolean;
  scoringNudges: Record<string, number>;
}

/**
 * One user as the gates and the score read them.
 *
 * `domains` comes from the latest parsed CV (`userDomains`): `profiles` has no column for it.
 * `utcOffsetHours` is left null so core falls back to the country's own offset; the worker does no
 * time-zone database work of its own, exactly as `apps/web` does not.
 *
 * `allowedTiers` and the delivery window come from `entitlementsFor`, the one module that decides
 * them (PLAN section 5). The `passes` row is passed through even though that module does not
 * believe it before phase 10.
 */
export function userFacts(
  source: UserSource,
  extras: { domains: readonly string[]; pass: ActivePass | null; now: Date },
): UserFacts | null {
  const country = coreCountry(source.residenceCountry);
  if (country === null) return null;

  const entitlements = entitlementsFor({
    userId: source.userId,
    pass: extras.pass,
    includeYellow: source.includeYellow,
    now: extras.now,
  });

  const user: MatchUser = {
    residenceCountry: country,
    timezone: source.timezone,
    utcOffsetHours: null,
    minOverlapHours: source.minOverlapHours,
    waysOfWorking: coreWays(source.waysOfWorking),
    employmentTypes: coreEmployment(source.employmentTypes),
    seniority: coreSeniority(source.seniority),
    yearsExperience: source.yearsExperience,
    stack: source.stack,
    domains: [...extras.domains],
    dealbreakers: source.dealbreakers,
    minRate: source.minRate,
    minRateCurrency: source.minRateCurrency,
    minRatePeriod: corePayPeriod(source.minRatePeriod),
    hideNoSalary: source.hideNoSalary,
    includeYellow: source.includeYellow,
  };

  return {
    userId: source.userId,
    profileId: source.profileId,
    user,
    allowedTiers: entitlements.allowedTiers,
    deliverAfter: (firstSeenAt) => deliverAfter(entitlements, firstSeenAt, extras.now),
    nudges: source.scoringNudges,
    families: compatibleFamilies(source.titles),
  };
}

/**
 * Job seniorities worth loading for one person: within one level either way, and two levels up for
 * an entry-level person (core's `JUNIOR_SENIORITY_DISTANCE`, which the gate additionally conditions
 * on the post's `years_min` — that extra condition stays in the gate).
 *
 * A deliberate **superset** of what the seniority gate allows, so the SQL pre-filter can never drop
 * a job the gate would have kept and near misses on seniority stay possible. An empty list means
 * "no seniority filter", which is what `selectMatchCandidateJobs` does with one.
 */
export function candidateSeniorities(seniority: Seniority | null): DbSeniority[] {
  if (seniority === null) return [];
  const index = SENIORITIES.indexOf(seniority);
  const entry = seniority === "intern" || seniority === "junior";
  const up = entry ? JUNIOR_SENIORITY_DISTANCE : SENIORITY_DISTANCE;
  return [
    ...new Set(
      SENIORITIES.filter((_, j) => j - index <= up && index - j <= SENIORITY_DISTANCE).map(
        toDbSeniority,
      ),
    ),
  ];
}

export const userFactsFromCandidate = (
  candidate: MatchCandidateUser,
  extras: { domains: readonly string[]; pass: ActivePass | null; now: Date },
): UserFacts | null => userFacts(candidate, extras);

export const userFactsFromProfile = (
  profile: MatchProfileRow,
  extras: { domains: readonly string[]; pass: ActivePass | null; now: Date },
): UserFacts | null => userFacts(profile, extras);
