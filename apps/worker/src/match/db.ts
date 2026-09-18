// The reads the matcher needs that `packages/db/src/queries/matching.ts` does not own.
//
// That file holds the two candidate queries, the similarity read and the upsert. Four things are
// missing for the worker and live here instead, because `packages/db` belongs to another order:
//
//  1. the one job a `match.job` run fans out (its enrichment, its money-ask flag and its freshness),
//  2. `job_enrichment.red_flags` for a page of jobs — the dealbreaker gate reads them and neither
//     candidate query returns them,
//  3. similarity the other way round: one job against many profiles. `jobSimilarity` takes one
//     profile and many jobs, which is the profile direction; calling it once per user in a fan-out
//     would be one round trip per user. The contract is identical and deliberately so: a profile
//     with no embedding is **absent** from the result, never present with a similarity of 0.
//  4. the CV-derived fields a profile row has no column for (`domains`) and the `passes` row
//     `entitlementsFor` takes.
//
// Raw SQL through `db.execute`, the style `packages/db/src/queries/matching.ts` and
// `apps/worker/src/cv/cleanup.ts` use for `DISTINCT ON`, enum-array casts and the pgvector
// operator. Array parameters always go through `sql.param`, or Drizzle expands them into a
// parenthesised list that cannot be cast to an array.
//
// Privacy: `userDomains` and `matchProfileRow` read personal data. Nothing here logs.
import type { ActivePass, PassSource } from "@pemby/core";
import type { DbEmploymentType, DbPayPeriod, DbSeniority, DbWayOfWorking } from "@pemby/db";
import type { Db, TimezoneConstraint } from "@pemby/db";
import { sql, type SQL } from "drizzle-orm";

const uuidArray = (v: readonly string[]): SQL => sql`${sql.param([...v])}::uuid[]`;
const textArray = (v: readonly string[]): SQL => sql`${sql.param([...v])}::text[]`;

// ---- 1. The job a match.job run fans out -----------------------------------------------------

export interface MatchJobRow {
  jobId: string;
  companyId: string;
  firstSeenAt: Date;
  lastVerifiedLiveAt: Date | null;
  seniority: DbSeniority | null;
  yearsMin: number | null;
  stack: string[];
  domains: string[];
  redFlags: string[];
  waysOfWorking: DbWayOfWorking[];
  employmentTypes: DbEmploymentType[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: DbPayPeriod | null;
  timezoneConstraint: TimezoneConstraint | null;
  roleFamily: string | null;
  asksCandidateForMoney: boolean;
  isDemo: boolean;
}

type RawMatchJob = {
  job_id: string;
  company_id: string;
  first_seen_at_ms: string;
  last_verified_live_at_ms: string | null;
  seniority: DbSeniority | null;
  years_min: number | null;
  stack: string[] | null;
  domains: string[] | null;
  red_flags: string[] | null;
  ways_of_working: DbWayOfWorking[] | null;
  employment_types: DbEmploymentType[] | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: DbPayPeriod | null;
  timezone_constraint: TimezoneConstraint | null;
  role_family: string | null;
  asks_candidate_for_money: boolean;
  is_demo: boolean;
};

/**
 * One open, non-duplicate, enriched job, in the same shape `selectMatchCandidateJobs` returns for
 * the other direction — including its salary rule: enrichment's normalized numbers win as a block,
 * and the board's own numbers are used only when enrichment found none, so amount, currency and
 * period always come from one source.
 *
 * Null when the job is missing, closed, a duplicate, or not enriched yet: none of those can be
 * matched, and the caller skips the fan-out rather than writing rows for a job nobody can apply to.
 * Timestamps come back as epoch milliseconds for the reason given in `queries/matching.ts`: a raw
 * `execute` has no Drizzle column mapper, so a `timestamptz` would arrive as Postgres's own text.
 */
export async function matchJobRow(db: Db, jobId: string): Promise<MatchJobRow | null> {
  const result = await db.execute<RawMatchJob>(sql`
    select
      j.id as job_id, j.company_id, j.is_demo,
      (extract(epoch from j.first_seen_at) * 1000)::bigint as first_seen_at_ms,
      (extract(epoch from j.last_verified_live_at) * 1000)::bigint as last_verified_live_at_ms,
      e.seniority, e.years_min, e.stack, e.domains, e.red_flags, e.timezone_constraint,
      e.asks_candidate_for_money,
      coalesce(j.role_family, e.role_family) as role_family,
      e.employment_types::text[] as employment_types,
      e.ways_of_working::text[] as ways_of_working,
      case when e.salary_min is null and e.salary_max is null
           then round(j.salary_min)::int else e.salary_min end as salary_min,
      case when e.salary_min is null and e.salary_max is null
           then round(j.salary_max)::int else e.salary_max end as salary_max,
      case when e.salary_min is null and e.salary_max is null
           then j.salary_currency else e.salary_currency end as salary_currency,
      case when e.salary_min is null and e.salary_max is null
           then j.salary_period else e.salary_period end as salary_period
    from jobs j
    join job_enrichment e on e.job_id = j.id
    where j.id = ${jobId}::uuid
      and j.status = 'open'
      and j.duplicate_of_job_id is null
  `);
  const r = result.rows[0];
  if (!r) return null;
  return {
    jobId: r.job_id,
    companyId: r.company_id,
    firstSeenAt: new Date(Number(r.first_seen_at_ms)),
    lastVerifiedLiveAt:
      r.last_verified_live_at_ms === null ? null : new Date(Number(r.last_verified_live_at_ms)),
    seniority: r.seniority,
    yearsMin: r.years_min,
    stack: r.stack ?? [],
    domains: r.domains ?? [],
    redFlags: r.red_flags ?? [],
    waysOfWorking: r.ways_of_working ?? [],
    employmentTypes: r.employment_types ?? [],
    salaryMin: r.salary_min,
    salaryMax: r.salary_max,
    salaryCurrency: r.salary_currency,
    salaryPeriod: r.salary_period,
    timezoneConstraint: r.timezone_constraint,
    roleFamily: r.role_family,
    asksCandidateForMoney: r.asks_candidate_for_money,
    isDemo: r.is_demo,
  };
}

// ---- 2. Red flags for a page of jobs ---------------------------------------------------------

/**
 * `job_enrichment.red_flags` keyed by job id. The dealbreaker gate matches the person's free text
 * against the job's structured fields including its red flags, and `selectMatchCandidateJobs` does
 * not return them, so without this one extra read the gate would silently see an empty list.
 */
export async function jobRedFlags(
  db: Db,
  jobIds: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (jobIds.length === 0) return out;
  const result = await db.execute<{ job_id: string; red_flags: string[] | null }>(sql`
    select e.job_id, e.red_flags
    from job_enrichment e
    where e.job_id = any(${uuidArray(jobIds)})
  `);
  for (const row of result.rows) out.set(row.job_id, row.red_flags ?? []);
  return out;
}

// ---- 3. One job against many profiles --------------------------------------------------------

/**
 * Cosine similarity between one job's embedding and a page of profiles (PLAN D19), keyed by
 * profile id. A profile with no embedding — or a job with none — is **absent** from the map, and
 * the caller passes `null` for it so `scoreMatch` renormalises the remaining weights. Zero is a
 * real value on this scale and would read as "orthogonal", not "no signal".
 */
export async function profileSimilarity(
  db: Db,
  jobId: string,
  profileIds: readonly string[],
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (profileIds.length === 0) return out;
  const result = await db.execute<{ profile_id: string; similarity: number }>(sql`
    select pe.profile_id, (1 - (je.embedding <=> pe.embedding))::float8 as similarity
    from job_embeddings je
    join profile_embeddings pe on pe.profile_id = any(${uuidArray(profileIds)})
    where je.job_id = ${jobId}::uuid
  `);
  for (const row of result.rows) out.set(row.profile_id, Number(row.similarity));
  return out;
}

// ---- 4. What a profile row has no column for -------------------------------------------------

/**
 * Business domains from each user's most recent parsed CV, keyed by user id.
 *
 * `profiles` has no domains column — PLAN D5 never asked for one — so the CV is the only source,
 * exactly as `apps/web/lib/teaser/input.ts` records. The `domain` score component would otherwise
 * be unscored for everyone and its weight spread over the rest, which is not wrong but is not the
 * score the Brief and the teaser are supposed to agree on. Only the domain strings are read; no
 * other CV field leaves the database.
 */
export async function userDomains(
  db: Db,
  userIds: readonly string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (userIds.length === 0) return out;
  const result = await db.execute<{ user_id: string; domains: unknown }>(sql`
    select distinct on (f.user_id) f.user_id, f.parsed -> 'domains' as domains
    from cv_files f
    where f.user_id = any(${textArray(userIds)})
      and f.parsed is not null
    order by f.user_id, f.parsed_at desc nulls last, f.created_at desc
  `);
  for (const row of result.rows) {
    const domains = Array.isArray(row.domains)
      ? row.domains.filter((d): d is string => typeof d === "string" && d.trim() !== "")
      : [];
    out.set(row.user_id, domains);
  }
  return out;
}

type RawPass = {
  user_id: string;
  source: PassSource;
  starts_at_ms: string;
  ends_at_ms: string;
  paused_at_ms: string | null;
  revoked_at_ms: string | null;
};

/**
 * The most recent `passes` row per user, as `entitlementsFor` takes it.
 *
 * Until phase 10 that module deliberately does not believe the row (a stray pass must not hand out
 * entitlements before the payment flow exists), so today this changes no verdict. It is read anyway
 * because phase 10 replaces one line inside `entitlementsFor`, and the matcher should not be the
 * place that then has to learn to read passes.
 */
export async function activePasses(
  db: Db,
  userIds: readonly string[],
): Promise<Map<string, ActivePass>> {
  const out = new Map<string, ActivePass>();
  if (userIds.length === 0) return out;
  const result = await db.execute<RawPass>(sql`
    select distinct on (p.user_id)
      p.user_id, p.source,
      (extract(epoch from p.starts_at) * 1000)::bigint as starts_at_ms,
      (extract(epoch from p.ends_at) * 1000)::bigint as ends_at_ms,
      (extract(epoch from p.paused_at) * 1000)::bigint as paused_at_ms,
      (extract(epoch from p.revoked_at) * 1000)::bigint as revoked_at_ms
    from passes p
    where p.user_id = any(${textArray(userIds)})
    order by p.user_id, p.ends_at desc
  `);
  for (const r of result.rows) {
    out.set(r.user_id, {
      source: r.source,
      startsAt: new Date(Number(r.starts_at_ms)),
      endsAt: new Date(Number(r.ends_at_ms)),
      pausedAt: r.paused_at_ms === null ? null : new Date(Number(r.paused_at_ms)),
      revokedAt: r.revoked_at_ms === null ? null : new Date(Number(r.revoked_at_ms)),
    });
  }
  return out;
}

// ---- 4b. Rows the current scorer never produced -----------------------------------------------

/**
 * Job ids of this user's `matches` rows that no run of the current scorer has confirmed, newest
 * first, at most `limit`.
 *
 * `matchOneProfile` feeds these back into the candidate query (`alsoJobIds`) so the run re-judges
 * pairs its pre-filters would otherwise never look at again. Only ids are read: nothing about the
 * row's verdict is needed here, and nothing is logged.
 */
export async function staleMatchJobIds(
  db: Db,
  userId: string,
  scorerVersion: number,
  limit: number,
): Promise<string[]> {
  const result = await db.execute<{ job_id: string }>(sql`
    select m.job_id
    from matches m
    where m.user_id = ${userId}
      and m.scorer_version < ${scorerVersion}
    order by m.updated_at desc, m.job_id
    limit ${limit}
  `);
  return result.rows.map((r) => r.job_id);
}

// ---- 5. One profile, for the match.profile direction -----------------------------------------

export interface MatchProfileRow {
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
  minRatePeriod: DbPayPeriod | null;
  hideNoSalary: boolean;
  includeYellow: boolean;
  scoringNudges: Record<string, number>;
  onboarded: boolean;
  isDemo: boolean;
}

type RawMatchProfile = Omit<
  MatchProfileRow,
  | "profileId"
  | "userId"
  | "residenceCountry"
  | "minOverlapHours"
  | "waysOfWorking"
  | "employmentTypes"
  | "yearsExperience"
  | "minRate"
  | "minRateCurrency"
  | "minRatePeriod"
  | "hideNoSalary"
  | "includeYellow"
  | "scoringNudges"
  | "onboarded"
  | "isDemo"
> & {
  profile_id: string;
  user_id: string;
  residence_country: string | null;
  min_overlap_hours: number | null;
  ways_of_working: DbWayOfWorking[] | null;
  employment_types: DbEmploymentType[] | null;
  years_experience: number | null;
  min_rate: number | null;
  min_rate_currency: string | null;
  min_rate_period: DbPayPeriod | null;
  hide_no_salary: boolean;
  include_yellow: boolean;
  scoring_nudges: Record<string, number> | null;
  onboarded: boolean;
  is_demo: boolean;
};

/**
 * One profile, in the same field set `selectMatchCandidateUsers` returns for the other direction,
 * so both directions build the same `MatchUser`. Accepts a profile id or the user id behind it,
 * because a debugging run usually has the second.
 */
export async function matchProfileRow(
  db: Db,
  id: { profileId: string } | { userId: string },
): Promise<MatchProfileRow | null> {
  const where =
    "profileId" in id ? sql`p.id = ${id.profileId}::uuid` : sql`p.user_id = ${id.userId}`;
  const result = await db.execute<RawMatchProfile>(sql`
    select
      p.id as profile_id, p.user_id, p.residence_country, p.timezone, p.min_overlap_hours,
      p.titles, p.seniority, p.years_experience, p.stack, p.dealbreakers, p.min_rate,
      p.min_rate_currency, p.min_rate_period, p.hide_no_salary, p.include_yellow,
      p.scoring_nudges, p.is_demo,
      p.onboarding_completed_at is not null as onboarded,
      p.ways_of_working::text[] as ways_of_working,
      p.employment_types::text[] as employment_types
    from profiles p
    where ${where}
  `);
  const r = result.rows[0];
  if (!r) return null;
  return {
    profileId: r.profile_id,
    userId: r.user_id,
    residenceCountry: r.residence_country,
    timezone: r.timezone,
    minOverlapHours: r.min_overlap_hours,
    waysOfWorking: r.ways_of_working ?? [],
    employmentTypes: r.employment_types ?? [],
    titles: r.titles ?? [],
    seniority: r.seniority,
    yearsExperience: r.years_experience,
    stack: r.stack ?? [],
    dealbreakers: r.dealbreakers ?? [],
    minRate: r.min_rate,
    minRateCurrency: r.min_rate_currency,
    minRatePeriod: r.min_rate_period,
    hideNoSalary: r.hide_no_salary,
    includeYellow: r.include_yellow,
    scoringNudges: r.scoring_nudges ?? {},
    onboarded: r.onboarded,
    isDemo: r.is_demo,
  };
}
