// The teaser, behind the `TeaserSource` seam: a cheap SQL pre-filter, then the real matcher.
//
// Phase 06 hand-rolled every gate in SQL and re-derived an eligibility reason key with a regex over
// the engine's English templates. Phase 07 retires both. SQL now does only what SQL is good at —
// narrowing 7k open jobs to the handful worth loading, on the existing indexes — and the verdict
// itself comes from `evaluateGates` and `scoreMatch` in `@pemby/core`, the same two functions the
// Brief and the match worker call. The teaser and the Brief cannot disagree about what qualifies
// because they no longer hold two copies of the rules.
//
// What stays in SQL (pre-filter, never the verdict):
//   eligibility scope + allowed tiers, one row per job, best tier then best way of working;
//   job open, not a duplicate, verified live inside the freshness window, not a demo row,
//   not asking the candidate for money; role family; seniority band.
// What core decides (the verdict):
//   every hard gate (PLAN D6), including the ones SQL only approximates, and the score that orders
//   the sample. The SQL seniority band is deliberately a superset of core's gate, so the pre-filter
//   can never drop a job the gate would have kept.
//
// Inclusion is the gates. The score orders the sample and is not a second bar: the number this
// surface shows answers "how many roles can hire you from {country}" (PLAN D4), an eligibility
// question, and `thresholds.match` is the delivery bar the Brief applies to a fully-embedded
// profile. An anonymous visitor has no embedding, so holding their count to a threshold set for one
// would under-report the market to the person deciding whether to sign up.

import {
  ENGINE_REASON_KEYS,
  JUNIOR_SENIORITY_DISTANCE,
  PAY_PERIODS,
  ROLE_FAMILIES,
  SENIORITIES,
  SENIORITY_DISTANCE,
  TARGET_COUNTRIES,
  WAYS_OF_WORKING,
  compatibleFamilies,
  countryName,
  entitlementsFor,
  evaluateGates,
  scoreMatch,
  toDbSeniority,
  toDbWay,
  type CountryCode,
  type DbSeniority,
  type EligibilityTier,
  type EmploymentType,
  type EngineReasonKey,
  type MatchJob,
  type MatchUser,
  type PayPeriod,
  type RoleFamily,
  type Seniority,
  type TimezoneWindow,
  type WayOfWorking,
} from "@pemby/core";
import { loadScoringWeights } from "@pemby/core/private-config";
import { getDb } from "@pemby/db";
import { appEnv } from "@/lib/env";
import type { TeaserInput, TeaserJob, TeaserOptions, TeaserResult, TeaserSource } from "./index";

/**
 * Freshness gate, matching the matcher's own (PLAN D6, `FRESHNESS_HOURS` in core). Phase 06 ran at
 * 72 h because staging's freshness sweeps were sparse and a 24 h window emptied the count between
 * them. The sweeps run hourly now and every open job was verified inside 6 h, so the teaser is back
 * on the product's real bar and stops promising a role that was last seen two days ago.
 */
export const TEASER_FRESHNESS_HOURS = 24;

const DEFAULT_LIMIT = 3;
const MAX_LIMIT = 10;

/**
 * How many pre-filtered jobs are loaded and scored in memory. The count this surface shows is the
 * number that clear the gates out of these, so it is exact up to this cap. Measured on staging the
 * largest target country holds under 100 eligible rows at green+yellow, so the cap is headroom
 * rather than a limit anyone reaches; it exists so a future country with thousands cannot turn one
 * page view into an unbounded read.
 */
export const TEASER_CANDIDATE_MAX = 500;

/**
 * Job seniorities kept by the pre-filter, as a superset of what core's seniority gate allows:
 * within one level either way, and two levels up for an entry-level person (core's
 * `JUNIOR_SENIORITY_DISTANCE`, which it also conditions on the post's `years_min` — that extra
 * condition stays in the gate, so SQL never drops a job the gate would keep). Jobs with no stated
 * seniority always pass (handled in SQL). Null seniority skips the filter.
 */
export function allowedJobSeniorities(seniority: Seniority | null): DbSeniority[] | null {
  if (seniority === null) return null;
  const index = SENIORITIES.indexOf(seniority);
  const entry = seniority === "intern" || seniority === "junior";
  const up = entry ? JUNIOR_SENIORITY_DISTANCE : SENIORITY_DISTANCE;
  return SENIORITIES.filter((_, j) => j - index <= up && index - j <= SENIORITY_DISTANCE).map(
    toDbSeniority,
  );
}

/**
 * `TEASER_INCLUDE_DEMO=true` lets seeded demo jobs count. Staging and development only: the
 * environment check is here rather than at the call site so setting the variable in production
 * cannot do anything, whoever sets it and however the route is reached.
 */
function includeDemo(): boolean {
  return process.env.TEASER_INCLUDE_DEMO === "true" && appEnv() !== "production";
}

interface Row {
  id: string;
  title: string;
  company_id: string;
  company: string;
  location_text: string | null;
  url: string;
  first_seen_at: Date | null;
  last_verified_live_at: Date | null;
  tier: string;
  way_of_working: string | null;
  reason: string;
  reason_key: string | null;
  reason_params: Record<string, unknown> | null;
  seniority: string | null;
  years_min: number | null;
  stack: string[];
  domains: string[];
  red_flags: string[];
  ways_of_working: string[];
  employment_types: string[];
  role_family: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: string | null;
  timezone_constraint: Record<string, unknown> | null;
  asks_candidate_for_money: boolean;
}

// Access path: `job_eligibility_scope_tier_idx (scope, tier, way_of_working)` yields the few rows
// for the country at the allowed tiers, then primary-key lookups into jobs, job_enrichment and
// companies. Nothing scans jobs. `distinct on` keeps one row per job: the best tier first (the
// tier array is passed green-first), then the way of working ranked by the person's own order.
const TEASER_SQL = `
with candidate as (
  select distinct on (el.job_id)
         el.job_id,
         el.tier::text as tier,
         el.way_of_working::text as way_of_working,
         el.reason,
         el.reason_key,
         el.reason_params
    from job_eligibility el
   where el.scope = $1
     and el.tier = any($2::eligibility_tier[])
     and el.way_of_working = any($3::way_of_working[])
   order by el.job_id,
            array_position($2::eligibility_tier[], el.tier),
            array_position($3::way_of_working[], el.way_of_working)
)
select j.id, j.title, j.company_id, c.name as company, j.location_text, j.url,
       j.first_seen_at, j.last_verified_live_at,
       g.tier, g.way_of_working, g.reason, g.reason_key, g.reason_params,
       e.seniority::text as seniority, e.years_min, e.stack, e.domains, e.red_flags,
       e.ways_of_working::text[] as ways_of_working,
       e.employment_types::text[] as employment_types,
       coalesce(e.role_family, j.role_family) as role_family,
       e.salary_min, e.salary_max, e.salary_currency,
       e.salary_period::text as salary_period,
       e.timezone_constraint, e.asks_candidate_for_money
  from candidate g
  join jobs j on j.id = g.job_id
  join job_enrichment e on e.job_id = j.id
  join companies c on c.id = j.company_id
 where j.status = 'open'
   and j.duplicate_of_job_id is null
   and j.last_verified_live_at > now() - make_interval(hours => $4::int)
   and ($5::boolean or not (j.is_demo or c.is_demo))
   and not e.asks_candidate_for_money
   and ($6::text[] is null or coalesce(e.role_family, j.role_family) = any($6::text[]))
   and ($7::seniority[] is null or e.seniority is null or e.seniority = any($7::seniority[]))
 order by (select count(*) from unnest(e.stack) s where lower(s) = any($8::text[])) desc,
          j.first_seen_at desc,
          j.id
 limit $9`;

/** Exported with its params for EXPLAIN in proof scripts. */
export const TEASER_QUERY = TEASER_SQL;

export function teaserQueryParams(
  input: TeaserInput & { country: string },
  allowedTiers: readonly EligibilityTier[],
) {
  return [
    input.country,
    [...allowedTiers],
    [...new Set(input.ways.map(toDbWay))],
    TEASER_FRESHNESS_HOURS,
    includeDemo(),
    compatibleFamilies(input.titles),
    allowedJobSeniorities(input.seniority),
    [...new Set(input.stack.map((s) => s.toLowerCase()))],
    TEASER_CANDIDATE_MAX,
  ];
}

const LOCATION_ENTRIES_MAX = 3;

/**
 * `location_text` joins every location the board lists with "; ", sometimes dozens. The teaser
 * keeps at most three, those naming the person's country first; the reason already says why the
 * job is open to them.
 */
export function shortLocation(text: string | null, country: string | null): string | null {
  if (text === null) return null;
  const entries = text.split("; ").filter((e) => e.trim() !== "");
  if (entries.length <= LOCATION_ENTRIES_MAX) return text;
  const named = country ? entries.filter((e) => e.includes(country)) : [];
  const rest = entries.filter((e) => !named.includes(e));
  return [...named, ...rest].slice(0, LOCATION_ENTRIES_MAX).join("; ");
}

// Row -> core types ------------------------------------------------------

const EMPLOYMENT_FROM_DB = {
  full_time: "full-time",
  part_time: "part-time",
  contract_to_hire: "contract-to-hire",
} as const satisfies Record<string, EmploymentType>;

function coreWays(values: readonly string[]): WayOfWorking[] {
  const out: WayOfWorking[] = [];
  for (const value of values) {
    const way = value.replace(/_/g, "-");
    if ((WAYS_OF_WORKING as readonly string[]).includes(way)) out.push(way as WayOfWorking);
  }
  return [...new Set(out)];
}

function coreEmployment(values: readonly string[]): EmploymentType[] {
  const out: EmploymentType[] = [];
  for (const value of values) {
    if (Object.hasOwn(EMPLOYMENT_FROM_DB, value)) {
      out.push(EMPLOYMENT_FROM_DB[value as keyof typeof EMPLOYMENT_FROM_DB]);
    }
  }
  return [...new Set(out)];
}

function coreSeniority(value: string | null): Seniority | null {
  if (value === null) return null;
  const core = value.replace(/_/g, "-");
  return (SENIORITIES as readonly string[]).includes(core) ? (core as Seniority) : null;
}

function corePayPeriod(value: string | null): PayPeriod | null {
  return value !== null && (PAY_PERIODS as readonly string[]).includes(value)
    ? (value as PayPeriod)
    : null;
}

function coreRoleFamily(value: string | null): RoleFamily | null {
  return value !== null && (ROLE_FAMILIES as readonly string[]).includes(value)
    ? (value as RoleFamily)
    : null;
}

function coreTier(value: string): EligibilityTier {
  // The query only ever asks for tiers it was given, so anything else is a schema drift, not data.
  return value as EligibilityTier;
}

function wholeHours(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function coreTimezone(value: Record<string, unknown> | null): TimezoneWindow | null {
  if (!value) return null;
  const min = wholeHours(value.minUtcOffset);
  const max = wholeHours(value.maxUtcOffset);
  const overlap = wholeHours(value.overlapHours);
  if (min === null && max === null && overlap === null) return null;
  return { minUtcOffset: min, maxUtcOffset: max, overlapHours: overlap };
}

/** Params are stored as jsonb; keep only the string leaves the reason templates can fill. */
function reasonParamsOf(value: Record<string, unknown> | null): Record<string, string> {
  if (!value) return {};
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") out[key] = raw;
  }
  return out;
}

function reasonKeyOf(value: string | null): EngineReasonKey | null {
  return value !== null && (ENGINE_REASON_KEYS as readonly string[]).includes(value)
    ? (value as EngineReasonKey)
    : null;
}

function matchJobOf(row: Row): MatchJob {
  const way = row.way_of_working === null ? [] : coreWays([row.way_of_working]);
  return {
    companyId: row.company_id,
    tier: coreTier(row.tier),
    wayOfWorking: way[0] ?? null,
    waysOfWorking: coreWays(row.ways_of_working),
    employmentTypes: coreEmployment(row.employment_types),
    lastVerifiedLiveAt: row.last_verified_live_at,
    firstSeenAt: row.first_seen_at,
    seniority: coreSeniority(row.seniority),
    yearsMin: row.years_min,
    stack: row.stack,
    domains: row.domains,
    redFlags: row.red_flags,
    roleFamily: coreRoleFamily(row.role_family),
    salaryMin: row.salary_min,
    salaryMax: row.salary_max,
    salaryCurrency: row.salary_currency,
    salaryPeriod: corePayPeriod(row.salary_period),
    timezone: coreTimezone(row.timezone_constraint),
    asksCandidateForMoney: row.asks_candidate_for_money,
  };
}

function matchUserOf(input: TeaserInput, country: string): MatchUser {
  return {
    residenceCountry: country as CountryCode,
    timezone: input.timezone,
    // Null lets core fall back to the country's offset; apps/web does no time-zone work of its own.
    utcOffsetHours: null,
    minOverlapHours: input.minOverlapHours,
    waysOfWorking: input.ways,
    employmentTypes: input.employmentTypes,
    seniority: input.seniority,
    yearsExperience: input.yearsExperience,
    stack: input.stack,
    domains: input.domains,
    dealbreakers: input.dealbreakers,
    minRate: input.minRate,
    minRateCurrency: input.minRateCurrency,
    minRatePeriod: input.minRatePeriod,
    hideNoSalary: input.hideNoSalary,
    includeYellow: input.includeYellow,
  };
}

function teaserJobOf(row: Row, countryLabel: string | null): TeaserJob {
  return {
    id: row.id,
    title: row.title,
    company: row.company,
    location: shortLocation(row.location_text, countryLabel),
    url: row.url,
    tier: coreTier(row.tier),
    reasonKey: reasonKeyOf(row.reason_key),
    reasonParams: reasonParamsOf(row.reason_params),
    reasonText: row.reason,
  };
}

export const sqlTeaserSource: TeaserSource = {
  async teaser(input: TeaserInput, opts?: TeaserOptions): Promise<TeaserResult> {
    const country = input.country;
    if (country === null) {
      return {
        country: null,
        countryName: null,
        count: null,
        greenCount: null,
        yellowCount: null,
        jobs: [],
        basis: "no_country",
      };
    }
    const name = countryName(country) ?? null;
    if (!(TARGET_COUNTRIES as readonly string[]).includes(country)) {
      return {
        country,
        countryName: name,
        count: null,
        greenCount: null,
        yellowCount: null,
        jobs: [],
        basis: "unsupported_country",
      };
    }
    if (input.ways.length === 0) {
      return {
        country,
        countryName: name,
        count: 0,
        greenCount: 0,
        yellowCount: 0,
        jobs: [],
        basis: "ok",
      };
    }

    const limit = Math.min(Math.max(Math.trunc(opts?.limit ?? DEFAULT_LIMIT), 1), MAX_LIMIT);
    const now = new Date();

    // The entitlements module is the one place that turns the yellow opt-in into a tier list
    // (PLAN D13 amended 2026-09-17), so the teaser asks it rather than deciding for itself. No
    // pass is read: this surface never differentiates on one, and a free plan is the safe floor.
    // `allowedTiers` never holds white or red, and `evaluateGates` strips them again anyway.
    const { allowedTiers } = entitlementsFor({
      userId: "",
      pass: null,
      includeYellow: input.includeYellow,
      now,
    });

    const [weights, { rows }] = await Promise.all([
      loadScoringWeights(),
      getDb().$client.query<Row>(
        TEASER_SQL,
        teaserQueryParams({ ...input, country }, allowedTiers),
      ),
    ]);

    const user = matchUserOf(input, country);
    const passed: Array<{ job: TeaserJob; score: number; firstSeen: number }> = [];
    for (const row of rows) {
      const job = matchJobOf(row);
      const outcome = evaluateGates({
        user,
        job,
        allowedTiers,
        now,
        freshnessHours: TEASER_FRESHNESS_HOURS,
      });
      if (!outcome.passed) continue;
      // No embedding for this surface: core renormalises the remaining weights rather than scoring
      // similarity as 0, so a missing vector costs the job nothing.
      const score = scoreMatch({ user, job, embeddingSimilarity: null }, weights);
      passed.push({
        job: teaserJobOf(row, name),
        score: score.total,
        firstSeen: row.first_seen_at?.getTime() ?? 0,
      });
    }

    passed.sort(
      (a, b) => b.score - a.score || b.firstSeen - a.firstSeen || a.job.id.localeCompare(b.job.id),
    );

    // Counted per tier rather than "yellow is the remainder": a tier the gates let through that is
    // neither green nor yellow would then be shown under the yellow line's wording. Under-reporting
    // is the safe failure here; mislabelling is not.
    const tally = (tier: EligibilityTier) =>
      passed.reduce((n, entry) => n + (entry.job.tier === tier ? 1 : 0), 0);

    return {
      country,
      countryName: name,
      count: passed.length,
      greenCount: tally("green"),
      yellowCount: tally("yellow"),
      jobs: passed.slice(0, limit).map((entry) => entry.job),
      basis: "ok",
    };
  },
};
