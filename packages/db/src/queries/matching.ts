// Read and write paths for the matcher, near misses and the Brief (PLAN D6, D7, section 4).
//
// Every helper here pre-filters in SQL. Staging already holds ~7.4k open jobs and ~3k enriched
// ones, and the matcher runs per user and per job, so nothing in this file may hand Node a set it
// then has to filter down: every hard gate that can be expressed as a WHERE clause is expressed as
// one, and only scoring happens in memory.
//
// Raw SQL (`db.execute`, the style `apps/worker/src/cv/cleanup.ts` uses) is used where the query
// builder cannot express what the plan needs: `DISTINCT ON`, enum-array casts that keep an index
// usable, and the pgvector `<=>` operator. Everything else goes through the builder.
//
// Array parameters always go through `sql.param`: a bare array in an `sql` template is expanded by
// Drizzle into a parenthesised `($1, $2, ...)` list, which is not an array and cannot be cast to
// one.
import {
  DB_SENIORITIES,
  FRESHNESS_HOURS,
  JUNIOR_SENIORITY_DISTANCE,
  SENIORITY_DISTANCE,
} from "@pemby/core";
import type { ScoreComponent, ScoreComponentResult } from "@pemby/core";
import { and, desc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Db } from "../client";
import { jobs, matches } from "../schema";
import type { GateResult, TimezoneConstraint } from "../schema";
import type { jobEligibility, jobEnrichment, profiles } from "../schema";

// Enum-valued types are read off the schema rather than re-declared, so a pg enum change cannot
// silently drift from this contract.
export type EligibilityTier = (typeof jobEligibility.$inferSelect)["tier"];
export type DbWayOfWorking = (typeof jobEligibility.$inferSelect)["wayOfWorking"];
export type DbSeniority = NonNullable<(typeof jobEnrichment.$inferSelect)["seniority"]>;
export type DbEmploymentType = (typeof jobEnrichment.$inferSelect)["employmentTypes"][number];
export type DbPayPeriod = NonNullable<(typeof jobEnrichment.$inferSelect)["salaryPeriod"]>;
export type EngineReasonKey = NonNullable<(typeof jobEligibility.$inferSelect)["reasonKey"]>;
export type MatchGate = NonNullable<(typeof matches.$inferSelect)["blocker"]>;
export type MatchKind = (typeof matches.$inferSelect)["kind"];
export type MatchState = (typeof matches.$inferSelect)["state"];
export type MatchPassReason = NonNullable<(typeof matches.$inferSelect)["passReason"]>;
export type ScoringNudges = (typeof profiles.$inferSelect)["scoringNudges"];

/** Best tier first: `array_position` over this gives a sortable rank. */
const TIER_RANK = sql`array['green','yellow','white','red']::eligibility_tier[]`;

/** `DB_SENIORITIES` as a Postgres array, so `array_position` gives the rung on the ladder. */
const SENIORITY_LADDER = sql`${sql.param([...DB_SENIORITIES])}::seniority[]`;

/**
 * The rungs the seniority gate treats as entry level, mirroring `isEntryLevel` in
 * `@pemby/core`'s `gates/evaluate.ts`. Core owns the rule; this is the SQL spelling of it.
 *
 * Typed as `DbSeniority[]` rather than `string[]` on purpose: the ladder is a single array shared
 * by core and the pg enum (`DB_SENIORITIES = SENIORITIES`), so renaming or dropping either rung
 * makes this line a type error instead of a filter that quietly stops recognising anyone.
 *
 * The gate's *other* entry-level route — no stated seniority, one year or less of experience — is
 * not spelled here and does not need to be: a profile with no seniority short-circuits the whole
 * comparison below, which is the widest answer there is.
 */
const ENTRY_SENIORITIES: readonly DbSeniority[] = ["intern", "junior"];

const wayArray = (v: readonly DbWayOfWorking[]): SQL => sql`${sql.param([...v])}::way_of_working[]`;
const tierArray = (v: readonly EligibilityTier[]): SQL =>
  sql`${sql.param([...v])}::eligibility_tier[]`;
const seniorityArray = (v: readonly DbSeniority[]): SQL => sql`${sql.param([...v])}::seniority[]`;
const textArray = (v: readonly string[]): SQL => sql`${sql.param([...v])}::text[]`;
const uuidArray = (v: readonly string[]): SQL => sql`${sql.param([...v])}::uuid[]`;

/**
 * Drizzle's node-postgres session replaces the driver's timestamp, date and interval parsers with
 * the identity function and relies on its own column mappers to build a `Date`. A raw `db.execute`
 * has no column mappers, so a `timestamptz` arrives as Postgres's own text ("2026-09-16 19:14:10.59+00"),
 * which only V8's lenient fallback parser understands. Every timestamp in this file is therefore
 * selected as epoch milliseconds and rebuilt here, with no parsing to get wrong.
 */
const epochMs = (column: SQL, alias: string): SQL =>
  sql`(extract(epoch from ${column}) * 1000)::bigint as ${sql.raw(alias)}`;

const toDate = (ms: string | null): Date | null => (ms === null ? null : new Date(Number(ms)));

// ---- 1. Candidate jobs for one user ---------------------------------------------------------

export interface MatchCandidateJobParams {
  /** ISO 3166-1 alpha-2, upper case. Matched against `job_eligibility.scope` exactly. */
  residenceCountry: string;
  /** The user's ways of working, most wanted first; a tie inside a tier breaks on this order. */
  waysOfWorking: readonly DbWayOfWorking[];
  /** Usually `["green"]`, or `["green","yellow"]` for a user who opted in (PLAN D2, D13). */
  allowedTiers: readonly EligibilityTier[];
  /** PLAN D10 families the user is open to. `null` means no role gate. */
  roleFamilies: readonly string[] | null;
  /** Seniorities worth scoring. Jobs with an unknown seniority are always included. */
  seniorities: readonly DbSeniority[];
  /** `jobs.last_verified_live_at` must be within this many hours (the `freshness` gate). */
  freshnessHours: number;
  limit: number;
  /** Incremental runs: only jobs first seen at or after this instant. */
  since?: Date | null;
  /**
   * Jobs to return **in addition** to the ones the narrowing above admits, sorted first so the
   * limit cannot cut them.
   *
   * This is how a re-match reaches a pair it would otherwise never look at again. `roleFamilies`,
   * `seniorities`, `freshnessHours` and `since` are pre-filters, not verdicts — the hard gates in
   * `@pemby/core` re-decide freshness and seniority on every pair, and the role filter is applied
   * in the caller — so a job named here is still judged in full, just not hidden from the judge.
   *
   * The filters that are *not* bypassed are the ones that make a pair meaningless rather than
   * unlikely: the job must still be open, canonical, enriched, free of a money ask, and carry an
   * eligibility row for this user's country under a way of working they accept. Without that row
   * there is no tier to score against.
   */
  alsoJobIds?: readonly string[] | null;
}

export interface MatchCandidateJob {
  jobId: string;
  title: string;
  companyId: string;
  companyName: string;
  url: string;
  applyUrl: string | null;
  locations: string[];
  firstSeenAt: Date;
  lastVerifiedLiveAt: Date | null;
  /** Best tier this job has for the user's country across the ways they accept. */
  tier: EligibilityTier;
  /** The way of working that best tier was recorded under. */
  wayOfWorking: DbWayOfWorking;
  /** Stable `ENGINE_REASONS` key; null for rows the engine wrote before migration 0008. */
  reasonKey: EngineReasonKey | null;
  reasonParams: Record<string, string>;
  seniority: DbSeniority | null;
  yearsMin: number | null;
  stack: string[];
  domains: string[];
  /** Enrichment's normalized salary, or the board's own numbers when enrichment found none. */
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: DbPayPeriod | null;
  employmentTypes: DbEmploymentType[];
  /** Enrichment's ways of working. Often empty: it is left unset when the post is silent. */
  waysOfWorking: DbWayOfWorking[];
  timezoneConstraint: TimezoneConstraint | null;
  /** `jobs.role_family`: the deterministic PLAN D10 slug, not enrichment's free-text guess. */
  roleFamily: string | null;
  isDemo: boolean;
}

type RawCandidateJob = {
  job_id: string;
  title: string;
  company_id: string;
  company_name: string;
  url: string;
  apply_url: string | null;
  locations: string[] | null;
  first_seen_at_ms: string;
  last_verified_live_at_ms: string | null;
  tier: EligibilityTier;
  way_of_working: DbWayOfWorking;
  reason_key: EngineReasonKey | null;
  reason_params: Record<string, string> | null;
  seniority: DbSeniority | null;
  years_min: number | null;
  stack: string[] | null;
  domains: string[] | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: DbPayPeriod | null;
  employment_types: DbEmploymentType[] | null;
  ways_of_working: DbWayOfWorking[] | null;
  timezone_constraint: TimezoneConstraint | null;
  role_family: string | null;
  is_demo: boolean;
};

/**
 * The jobs worth scoring for one user, best tier first and newest first inside a tier.
 *
 * Applied in SQL: the eligibility scope and tier, the user's ways of working, the role family, the
 * freshness window, open and non-duplicate status, and PLAN D11's "asks the candidate for money"
 * exclusion. One row per job: a job eligible under several ways collapses to its best tier, and
 * inside a tier to the way that comes first in `waysOfWorking`.
 *
 * `allowedTiers` and `seniorities` are the *widened* bands the caller wants to look at, not the
 * pass/fail line. Near misses exist precisely because the `eligibility` and `seniority` gates can
 * fail, so a caller that wants them passes the wider band here and lets the gates in `@pemby/core`
 * decide. Jobs whose enrichment has no seniority are always returned: a gate cannot fail on data
 * the post never gave.
 *
 * Scopes are matched exactly. The eligibility engine writes one row per target country, so there
 * is nothing region-shaped ("EU", "*") to expand today; if it ever writes one, this needs to
 * expand the country into its regions before the lookup.
 */
export async function selectMatchCandidateJobs(
  db: Db,
  params: MatchCandidateJobParams,
): Promise<MatchCandidateJob[]> {
  const {
    residenceCountry,
    waysOfWorking,
    allowedTiers,
    roleFamilies,
    seniorities,
    freshnessHours,
    limit,
    since,
  } = params;
  if (waysOfWorking.length === 0 || allowedTiers.length === 0) return [];
  if (roleFamilies !== null && roleFamilies.length === 0) return [];

  const alsoJobIds = params.alsoJobIds ?? [];
  const ways = wayArray(waysOfWorking);
  // Never bypassed: without these a pair cannot be judged at all.
  const conditions: SQL[] = [
    sql`j.status = 'open'`,
    sql`j.duplicate_of_job_id is null`,
    sql`e.asks_candidate_for_money = false`,
  ];
  // Bypassed for `alsoJobIds`: each of these is a pre-filter whose verdict a gate re-takes.
  const narrowing: SQL[] = [
    sql`j.last_verified_live_at >= now() - make_interval(hours => ${freshnessHours})`,
  ];
  if (roleFamilies !== null) narrowing.push(sql`j.role_family = any(${textArray(roleFamilies)})`);
  if (seniorities.length > 0) {
    narrowing.push(sql`(e.seniority is null or e.seniority = any(${seniorityArray(seniorities)}))`);
  }
  if (since) narrowing.push(sql`j.first_seen_at >= ${since}`);

  // Two fragments, not one reused twice: each occurrence binds its own parameter.
  const alsoInWhere = sql`j.id = any(${uuidArray(alsoJobIds)})`;
  const alsoInOrder = sql`j.id = any(${uuidArray(alsoJobIds)})`;
  conditions.push(
    alsoJobIds.length === 0
      ? sql`(${sql.join(narrowing, sql` and `)})`
      : sql`((${sql.join(narrowing, sql` and `)}) or ${alsoInWhere})`,
  );
  // The pulled-back rows sort first, so `limit` cannot cut the pairs this run was asked to re-judge.
  const ordering: SQL[] = [];
  if (alsoJobIds.length > 0) ordering.push(sql`(${alsoInOrder}) desc`);
  ordering.push(sql`array_position(${TIER_RANK}, el.tier)`, sql`j.first_seen_at desc`, sql`j.id`);

  const result = await db.execute<RawCandidateJob>(sql`
    with eligible as (
      select distinct on (el.job_id)
        el.job_id, el.tier, el.way_of_working, el.reason_key, el.reason_params
      from job_eligibility el
      where el.scope = ${residenceCountry}
        and el.tier = any(${tierArray(allowedTiers)})
        and el.way_of_working = any(${ways})
      order by el.job_id,
        array_position(${TIER_RANK}, el.tier),
        array_position(${wayArray(waysOfWorking)}, el.way_of_working)
    )
    select
      j.id as job_id, j.title, j.url, j.apply_url, j.locations, j.role_family, j.is_demo,
      ${epochMs(sql`j.first_seen_at`, "first_seen_at_ms")},
      ${epochMs(sql`j.last_verified_live_at`, "last_verified_live_at_ms")},
      c.id as company_id, c.name as company_name,
      el.tier, el.way_of_working, el.reason_key, el.reason_params,
      e.seniority, e.years_min, e.stack, e.domains, e.timezone_constraint,
      -- node-postgres has no parser for a custom enum array, so those columns come back as the
      -- raw literal "{a,b}" unless they are cast to text[] here. Every enum array in this file is
      -- cast for that reason.
      e.employment_types::text[] as employment_types,
      e.ways_of_working::text[] as ways_of_working,
      -- Enrichment's normalized salary wins as a block; when it found nothing the board's own
      -- numbers are used, so amount, currency and period always come from one source.
      case when e.salary_min is null and e.salary_max is null
           then round(j.salary_min)::int else e.salary_min end as salary_min,
      case when e.salary_min is null and e.salary_max is null
           then round(j.salary_max)::int else e.salary_max end as salary_max,
      case when e.salary_min is null and e.salary_max is null
           then j.salary_currency else e.salary_currency end as salary_currency,
      case when e.salary_min is null and e.salary_max is null
           then j.salary_period else e.salary_period end as salary_period
    from eligible el
    join jobs j on j.id = el.job_id
    join job_enrichment e on e.job_id = j.id
    join companies c on c.id = j.company_id
    where ${sql.join(conditions, sql` and `)}
    order by ${sql.join(ordering, sql`, `)}
    limit ${limit + alsoJobIds.length}
  `);

  return result.rows.map((r) => ({
    jobId: r.job_id,
    title: r.title,
    companyId: r.company_id,
    companyName: r.company_name,
    url: r.url,
    applyUrl: r.apply_url,
    locations: r.locations ?? [],
    firstSeenAt: new Date(Number(r.first_seen_at_ms)),
    lastVerifiedLiveAt: toDate(r.last_verified_live_at_ms),
    tier: r.tier,
    wayOfWorking: r.way_of_working,
    reasonKey: r.reason_key,
    reasonParams: r.reason_params ?? {},
    seniority: r.seniority,
    yearsMin: r.years_min,
    stack: r.stack ?? [],
    domains: r.domains ?? [],
    salaryMin: r.salary_min,
    salaryMax: r.salary_max,
    salaryCurrency: r.salary_currency,
    salaryPeriod: r.salary_period,
    employmentTypes: r.employment_types ?? [],
    waysOfWorking: r.ways_of_working ?? [],
    timezoneConstraint: r.timezone_constraint,
    roleFamily: r.role_family,
    isDemo: r.is_demo,
  }));
}

// ---- 2. Candidate users for one job ---------------------------------------------------------

export interface MatchCandidateUserParams {
  jobId: string;
  /** Widened band, as in `selectMatchCandidateJobs`. Defaults to green and yellow. */
  allowedTiers?: readonly EligibilityTier[];
  /** Keyset cursor: the `profileId` of the last row of the previous page. */
  afterId?: string | null;
  limit: number;
  /** Skip profiles that never finished onboarding (PLAN D5). Default true. */
  onboardedOnly?: boolean;
}

export interface MatchCandidateUser {
  profileId: string;
  userId: string;
  displayName: string | null;
  residenceCountry: string;
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
  scoringNudges: ScoringNudges;
  isDemo: boolean;
  /** Best tier this job has for the user's country, across the ways the user accepts. */
  tier: EligibilityTier;
  wayOfWorking: DbWayOfWorking;
  reasonKey: EngineReasonKey | null;
  reasonParams: Record<string, string>;
}

type RawCandidateUser = {
  profile_id: string;
  user_id: string;
  display_name: string | null;
  residence_country: string;
  timezone: string | null;
  min_overlap_hours: number | null;
  ways_of_working: DbWayOfWorking[] | null;
  employment_types: DbEmploymentType[] | null;
  titles: string[] | null;
  seniority: DbSeniority | null;
  years_experience: number | null;
  stack: string[] | null;
  dealbreakers: string[] | null;
  min_rate: number | null;
  min_rate_currency: string | null;
  min_rate_period: DbPayPeriod | null;
  hide_no_salary: boolean;
  include_yellow: boolean;
  scoring_nudges: ScoringNudges | null;
  is_demo: boolean;
  tier: EligibilityTier;
  way_of_working: DbWayOfWorking;
  reason_key: EngineReasonKey | null;
  reason_params: Record<string, string> | null;
};

/**
 * The band a caller gets when it does not name one.
 *
 * Green and yellow, because PLAN D2 as amended on 2026-09-17 is that white and red never show,
 * and a candidate set is one step from a Brief. A default that quietly widened the band was a
 * default that could put a white post in front of someone; a caller that genuinely wants a wider
 * band for its own reasons still says so.
 */
const DEFAULT_USER_TIERS: readonly EligibilityTier[] = ["green", "yellow"];

/**
 * The inverse of `selectMatchCandidateJobs`: for one job, the users whose profile could possibly
 * match it. This is the read behind the fan-out that runs when a job is newly enriched.
 *
 * Applied in SQL: the job must have an eligibility row whose scope is the user's residence country
 * and whose way of working the user accepts; the job's seniority must be inside the same widened,
 * asymmetric band the seniority gate uses (see the condition below); and the user's ways of working
 * must overlap the job's. Enrichment leaves
 * `job_enrichment.ways_of_working` empty on most posts (staging: 2682 of 2959), so an empty array
 * there means "the post did not say" and skips that check instead of excluding everyone. A profile
 * with no seniority is kept for the same reason.
 *
 * Keyset-paginated by `profiles.id` ascending: pass the last `profileId` of a page as `afterId`.
 * No OFFSET, so paging stays flat as the user table grows.
 */
export async function selectMatchCandidateUsers(
  db: Db,
  params: MatchCandidateUserParams,
): Promise<MatchCandidateUser[]> {
  const { jobId, afterId, limit } = params;
  const allowedTiers = params.allowedTiers ?? DEFAULT_USER_TIERS;
  const onboardedOnly = params.onboardedOnly ?? true;
  if (allowedTiers.length === 0) return [];

  const conditions: SQL[] = [
    sql`p.residence_country is not null`,
    sql`cardinality(p.ways_of_working) > 0`,
    sql`(cardinality(jb.ways_of_working) = 0 or p.ways_of_working && jb.ways_of_working)`,
    // The seniority band, as `candidateSeniorities` in `apps/worker/src/match/map.ts` computes it
    // for the other direction. Asymmetric, because the gate is: `SENIORITY_DISTANCE` rungs down for
    // everyone, and upward `JUNIOR_SENIORITY_DISTANCE` rungs for an intern or a junior against
    // `SENIORITY_DISTANCE` for everyone else. The symmetric `<= 1` this replaces was narrower than
    // the gate in exactly that corner, so `match.job` never offered an intern a middle-level post
    // that `match.profile` matched them to — same user, same job, two answers depending on which
    // queue ran.
    //
    // A superset of the gate, deliberately, never an equal: this is a pre-filter, and a pre-filter
    // narrower than the gate silently drops pairs nothing downstream can recover. The gate's extra
    // `years_min <= JUNIOR_TOLERANCE_YEARS` condition on the junior allowance is therefore *not*
    // repeated here — it would narrow the band back below the gate's — and neither is the years
    // check itself. Both stay where they belong, in `@pemby/core`, and re-decide every pair.
    //
    // `::int` on the two rung counts is load-bearing, not decoration: node-postgres sends a bound
    // number as an untyped parameter, and a `case` whose branches are both untyped resolves to
    // `text`, which makes the comparison `integer <= text` and the statement fail outright.
    sql`(jb.seniority is null or p.seniority is null or (
          array_position(${SENIORITY_LADDER}, jb.seniority)
            - array_position(${SENIORITY_LADDER}, p.seniority)
            <= case when p.seniority = any(${seniorityArray(ENTRY_SENIORITIES)})
                    then ${JUNIOR_SENIORITY_DISTANCE}::int else ${SENIORITY_DISTANCE}::int end
          and array_position(${SENIORITY_LADDER}, p.seniority)
            - array_position(${SENIORITY_LADDER}, jb.seniority) <= ${SENIORITY_DISTANCE}::int))`,
  ];
  if (onboardedOnly) conditions.push(sql`p.onboarding_completed_at is not null`);
  if (afterId) conditions.push(sql`p.id > ${afterId}::uuid`);

  const result = await db.execute<RawCandidateUser>(sql`
    with jb as (
      select j.id, e.seniority, e.ways_of_working
      from jobs j
      join job_enrichment e on e.job_id = j.id
      where j.id = ${jobId}::uuid
    ),
    elig as (
      select el.scope, el.tier, el.way_of_working, el.reason_key, el.reason_params
      from job_eligibility el
      where el.job_id = ${jobId}::uuid
        and el.tier = any(${tierArray(allowedTiers)})
    )
    select distinct on (p.id)
      p.id as profile_id, p.user_id, p.display_name, p.residence_country, p.timezone,
      p.min_overlap_hours, p.titles, p.seniority,
      p.years_experience, p.stack, p.dealbreakers, p.min_rate, p.min_rate_currency,
      p.min_rate_period, p.hide_no_salary, p.include_yellow, p.scoring_nudges, p.is_demo,
      -- Cast for the same reason as in selectMatchCandidateJobs: enum arrays have no driver parser.
      p.ways_of_working::text[] as ways_of_working,
      p.employment_types::text[] as employment_types,
      el.tier, el.way_of_working, el.reason_key, el.reason_params
    from profiles p
    cross join jb
    join elig el
      on el.scope = p.residence_country
     and el.way_of_working = any(p.ways_of_working)
    where ${sql.join(conditions, sql` and `)}
    order by p.id, array_position(${TIER_RANK}, el.tier), el.way_of_working
    limit ${limit}
  `);

  return result.rows.map((r) => ({
    profileId: r.profile_id,
    userId: r.user_id,
    displayName: r.display_name,
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
    isDemo: r.is_demo,
    tier: r.tier,
    wayOfWorking: r.way_of_working,
    reasonKey: r.reason_key,
    reasonParams: r.reason_params ?? {},
  }));
}

// ---- 3. Embedding similarity ----------------------------------------------------------------

export interface JobSimilarityParams {
  profileId: string;
  jobIds: readonly string[];
}

export interface JobSimilarity {
  jobId: string;
  /** Cosine similarity, `1 - (embedding <=> embedding)`. */
  similarity: number;
}

/**
 * Cosine similarity between one profile's embedding and a given set of jobs (PLAN D19).
 *
 * A job with no `job_embeddings` row is **absent** from the result, never present with a
 * similarity of 0: zero is a real value on this scale and would read as "orthogonal" rather than
 * "no signal". The caller drops the `embeddingSimilarity` component for the ids it does not get
 * back. A profile with no embedding yields an empty result for the same reason.
 *
 * Distance uses the `<=>` operator `job_embeddings_hnsw_idx` was built for. With an explicit id
 * list Postgres reads those rows by primary key and computes exact distances; the HNSW index
 * serves approximate nearest-neighbour ordering, which is a different query from this one.
 */
export async function jobSimilarity(db: Db, params: JobSimilarityParams): Promise<JobSimilarity[]> {
  const { profileId, jobIds } = params;
  if (jobIds.length === 0) return [];

  const result = await db.execute<{ job_id: string; similarity: number }>(sql`
    select je.job_id, (1 - (je.embedding <=> pe.embedding))::float8 as similarity
    from profile_embeddings pe
    join job_embeddings je on je.job_id = any(${uuidArray(jobIds)})
    where pe.profile_id = ${profileId}::uuid
  `);
  return result.rows.map((r) => ({ jobId: r.job_id, similarity: Number(r.similarity) }));
}

// ---- 4. Bulk upsert of match rows ------------------------------------------------------------

export interface MatchUpsertRow {
  userId: string;
  jobId: string;
  kind: MatchKind;
  /** The one gate a near miss failed, or `score`. Null for a match. */
  blocker?: MatchGate | null;
  gateResults: GateResult[];
  /** 0..100. */
  score: number;
  scoreComponents?: Record<ScoreComponent, ScoreComponentResult> | null;
  tier: EligibilityTier;
  wayOfWorking?: DbWayOfWorking | null;
  /**
   * Top 3 templated reasons, rendered into English. The fallback column: `reasonKeys` and
   * `reasonParams` are what the UI renders through i18n, and are written from the same
   * `MatchScore.reasons` in the same order.
   */
  reasons?: string[];
  /** `ScoreReason.key` per entry of `reasons`, same order. */
  reasonKeys?: string[];
  /** `ScoreReason.params` per entry of `reasonKeys`, same order. */
  reasonParams?: Record<string, string>[];
  gap?: string | null;
  gapKey?: string | null;
  gapParams?: Record<string, string> | null;
  /** Used only when the row is new; a re-match never moves an existing delivery window. */
  deliverAfter?: Date | null;
  /**
   * `SCORER_VERSION` of the scorer that produced this row. Required, not defaulted: a caller that
   * forgot it would write a row that `retireStaleMatches` then treats as another scorer's leftover.
   */
  scorerVersion: number;
}

/** Postgres caps a statement at 65535 bind parameters; these rows bind 17 each. */
const UPSERT_CHUNK = 500;

/**
 * Insert or refresh match and near-miss rows on the `(user_id, job_id)` unique key.
 *
 * A re-match overwrites only what the matcher owns: kind, blocker, gate results, score, score
 * components, tier, way of working, reasons (both the keys and the English) and gap. Everything
 * the user owns is left exactly as
 * it was — `state`, `pass_reason`, `state_changed_at` and every `*_delivered_at` column — so a
 * saved, applied or passed job can never be reset to `new` by a re-run. `deliver_after` is filled
 * only when it was never set, so a re-run cannot push a pending delivery further out.
 *
 * `rows` is deduplicated on `(userId, jobId)` first, last occurrence winning. Postgres refuses an
 * `ON CONFLICT DO UPDATE` whose own statement proposes the same key twice (SQLSTATE 21000), and a
 * matcher that evaluates a job under two ways of working can easily produce that pair; failing the
 * whole batch over it would be the wrong answer.
 */
export async function upsertMatches(db: Db, rows: readonly MatchUpsertRow[]): Promise<void> {
  if (rows.length === 0) return;

  const byKey = new Map<string, MatchUpsertRow>();
  for (const row of rows) byKey.set(`${row.userId}\0${row.jobId}`, row);
  const deduped = [...byKey.values()];

  for (let i = 0; i < deduped.length; i += UPSERT_CHUNK) {
    const chunk = deduped.slice(i, i + UPSERT_CHUNK).map((r) => ({
      userId: r.userId,
      jobId: r.jobId,
      kind: r.kind,
      blocker: r.blocker ?? null,
      gateResults: r.gateResults,
      score: r.score,
      scoreComponents: r.scoreComponents ?? null,
      tier: r.tier,
      wayOfWorking: r.wayOfWorking ?? null,
      reasons: r.reasons ?? [],
      reasonKeys: r.reasonKeys ?? [],
      reasonParams: r.reasonParams ?? [],
      gap: r.gap ?? null,
      gapKey: r.gapKey ?? null,
      gapParams: r.gapParams ?? {},
      deliverAfter: r.deliverAfter ?? null,
      scorerVersion: r.scorerVersion,
    }));

    await db
      .insert(matches)
      .values(chunk)
      .onConflictDoUpdate({
        target: [matches.userId, matches.jobId],
        set: {
          kind: sql`excluded.kind`,
          blocker: sql`excluded.blocker`,
          gateResults: sql`excluded.gate_results`,
          score: sql`excluded.score`,
          scoreComponents: sql`excluded.score_components`,
          tier: sql`excluded.tier`,
          wayOfWorking: sql`excluded.way_of_working`,
          reasons: sql`excluded.reasons`,
          reasonKeys: sql`excluded.reason_keys`,
          reasonParams: sql`excluded.reason_params`,
          gap: sql`excluded.gap`,
          gapKey: sql`excluded.gap_key`,
          gapParams: sql`excluded.gap_params`,
          deliverAfter: sql`coalesce(${matches.deliverAfter}, excluded.deliver_after)`,
          scorerVersion: sql`excluded.scorer_version`,
          updatedAt: sql`now()`,
        },
      });
  }
}

// ---- 4b. Retiring verdicts a live scorer never produced --------------------------------------

export interface RetireStaleMatchesParams {
  /** Scope: one user's rows (the `match.profile` direction). */
  userId?: string;
  /** Scope: one job's rows (the `match.job` direction). */
  jobId?: string;
  /**
   * `SCORER_VERSION`.
   *
   * In **version mode** it is the staleness line: rows at or above it are the current scorer's own
   * and are never touched. In **named-pairs mode** it is the version stamped on a withdrawn row,
   * and a ceiling — a row a *newer* scorer wrote is never retired on an older scorer's say-so,
   * which is what keeps a rolling deploy from letting the old worker undo the new one.
   */
  scorerVersion: number;
  /**
   * Named-pairs mode, `match.profile` direction: the jobs this run evaluated for `userId` and
   * deliberately wrote **no row** for — `evaluatePair` returning `kind: "skip"`, in other words —
   * whatever version the row it is about to retire carries.
   *
   * Only ids the run actually judged. Never the complement of what it wrote, and never "everything
   * else for this user": see the note on the function below for why that distinction is the whole
   * safety argument.
   */
  noRowJobIds?: readonly string[];
  /** Named-pairs mode, `match.job` direction: the same list, users instead of jobs. */
  noRowUserIds?: readonly string[];
}

export interface RetiredMatches {
  /** Rows removed: pure matcher output, with nothing of the user's recorded on them. */
  deleted: number;
  /** Rows kept because the user acted on them, with the stale verdict withdrawn. */
  withdrawn: number;
}

/**
 * Retires match rows that no live scorer stands behind.
 *
 * **The defect this closes.** `matches` rows were only ever written, never reconciled. A pair drops
 * out of a re-match for reasons that have nothing to do with the row — the candidate query narrows
 * on role family, seniority and freshness, and a profile edit moves all three — so the row simply
 * stayed, at whatever the scorer of the day had said. After a scoring change that meant a Brief
 * could show a score the current scorer would never produce, for ever, with no path back.
 *
 * **Two modes, and the second one is the one the Brief needs.**
 *
 * *Version mode* (no list). One condition: `scorer_version` below the current one. `upsertMatches`
 * stamps the current version on every row it writes, so a pair this run has just re-scored is
 * already out of scope — no keep-list to build, no run timestamp to compare against, and therefore
 * no way for a clock or a truncated candidate page to retire something it should not. A row is
 * retired only if **no** run of the current scorer has ever confirmed it, whenever that run
 * happened. This is right for a scorer bump and wrong for nothing; it simply cannot see the case
 * below.
 *
 * *Named-pairs mode* (`noRowJobIds` / `noRowUserIds`). The gap version mode leaves: a row already
 * **at** the current version, on a pair a run has just evaluated and decided should no longer
 * exist. Nothing marks it, so it survives — and it survives on screen. Someone with 36 near misses
 * blocked on `eligibility` taps "include the likely matches", the matcher re-runs, correctly
 * concludes those 36 are not near misses any more and writes one row instead of 36; all 36 stale
 * rows stay, at the current version, and the group does not move. The one-tap fix is PLAN D7's
 * headline mechanism, and it visibly did nothing.
 *
 * **Why a positive list of judged pairs, and not the two shapes that suggest themselves.**
 *
 * The obvious shapes are the complement of what the run wrote (`exceptJobIds`) and a cutoff on
 * `updated_at` at the run's start time. Both say "retire everything in scope this run did not
 * write", and both are wrong for the same reason: **no run of either direction covers its whole
 * scope.** `match.profile` loads at most `MATCH_PROFILE_JOB_LIMIT` candidate jobs, so a user with
 * more eligible jobs than that always has rows the run never looked at; `match.job` pages until the
 * pages run out, which an interruption, an error or any future page budget ends early. Under either
 * shape those untouched pairs are retired for having been out of reach, and the next run rewrites a
 * different subset of them — not a rare interruption hazard but permanent churn. The `updated_at`
 * cutoff adds a second fault on top: it compares a timestamp the application produced against one
 * the database produced, so clock skew of a few seconds is enough to retire a row a concurrent run
 * has just written.
 *
 * A positive list of the pairs the run actually judged has neither fault, by construction rather
 * than by care:
 *
 * - **Interruption.** The list only ever contains pairs that were evaluated. A run that dies after
 *   three pages names the pairs in those three pages and nothing else; a run that dies before
 *   calling this function names nothing. Under-retiring is self-healing — the next run reaches the
 *   pair and judges it again — so partial completion costs a delay, never a wrong deletion.
 * - **Clock skew.** No timestamp appears in either statement. There is no clock to skew.
 * - **The sweep.** `selectJobsToMatch` re-offers a job on `min(scorer_version) < SCORER_VERSION` or
 *   `max(updated_at) < greatest(enrichment, embedding)`. Both arms below move a row *out* of that
 *   predicate: a withdrawn row takes the current version and `updated_at = now()`, and a deleted
 *   row stops being counted at all. The one case left is a job whose every row is deleted, which
 *   reads as "never matched" — exactly the "a fan-out legitimately writes no row" case
 *   `MATCH_RETRY_AFTER_HOURS` already bounds to once a day. No new loop.
 *
 * What the list cannot do is retire a pair the run never loaded — a job that closed, or one whose
 * eligibility no longer covers the user's country. Those rows are filtered on read (`selectBrief`
 * and `countNearMissesByBlocker` both require the job open and not superseded) and collected by
 * version mode on the next scorer bump. Reaching them sooner would mean guessing about pairs
 * nothing judged, which is the mistake this shape exists to avoid.
 *
 * **The one residual race.** Between a run judging a pair and naming it here, the *other* direction
 * can write a row for that same pair, and this will delete it. It takes the two directions
 * disagreeing about one pair inside a few seconds; the `scorer_version` ceiling rules out the
 * version-bump case, the preservation arm below rules out losing anything of the user's, and the
 * next run of either direction restores the row. It is a delay, not a loss.
 *
 * Call it after the run's own upsert, never before. Both modes may be used by one run: name the
 * pairs each page judged as it goes, then make one final version-mode call once the pages are done
 * — version mode assumes full coverage of its scope, so it belongs at the end and only at the end.
 *
 * **Why two arms, and why the second one is not a delete.** `state`, `pass_reason`,
 * `state_changed_at` and the three `*_delivered_at` columns record what the person did and what was
 * sent to them; `applications.match_id` and `kits.match_id` point at the row. A row carrying any of
 * those is the user's, not the matcher's, and deleting it would destroy a decision and un-link an
 * application (both foreign keys are `on delete set null`, so the damage would be silent). Those
 * rows are kept whole and only the **matcher's own** columns are cleared: the verdict is withdrawn
 * rather than replaced by a guess, which is why the score goes to 0 with `score_components` null
 * and no reasons — not "this job is bad", but "nothing current has judged this". `kind` becomes
 * `near_miss` so the Brief, which selects `kind = 'match'`, stops presenting it, and `deliver_after`
 * is cleared so a withdrawn verdict can never be delivered. `scorer_version` is set to the current
 * version, so the withdrawal happens once and the next run that reaches the pair overwrites it with
 * a real verdict.
 *
 * A row with no decision on it has nothing of the user's to lose, so it is deleted outright and the
 * table does not fill with withdrawn rows nobody will ever look at.
 */
export async function retireStaleMatches(
  db: Db,
  params: RetireStaleMatchesParams,
): Promise<RetiredMatches> {
  const { userId, jobId, scorerVersion, noRowJobIds, noRowUserIds } = params;
  if ((userId === undefined) === (jobId === undefined)) {
    throw new Error("retireStaleMatches needs exactly one of userId or jobId");
  }
  // A list names the *counterpart* of the scope, so the pairing is fixed and a caller that swaps
  // the two is stopped here rather than retiring an unrelated set.
  if (noRowJobIds !== undefined && noRowUserIds !== undefined) {
    throw new Error("retireStaleMatches takes at most one of noRowJobIds or noRowUserIds");
  }
  if (noRowJobIds !== undefined && userId === undefined) {
    throw new Error("retireStaleMatches: noRowJobIds names jobs, so it needs the userId scope");
  }
  if (noRowUserIds !== undefined && jobId === undefined) {
    throw new Error("retireStaleMatches: noRowUserIds names users, so it needs the jobId scope");
  }

  const named = noRowJobIds ?? noRowUserIds;
  // A run that judged nothing away has nothing to retire. Returning early rather than running
  // `= any('{}')` twice keeps a per-page caller from paying two statements per empty page.
  if (named !== undefined && named.length === 0) return { deleted: 0, withdrawn: 0 };

  const scope = userId === undefined ? sql`m.job_id = ${jobId}::uuid` : sql`m.user_id = ${userId}`;
  const stale =
    named === undefined
      ? sql`${scope} and m.scorer_version < ${scorerVersion}`
      : sql`${scope}
      and m.scorer_version <= ${scorerVersion}
      and ${
        noRowJobIds === undefined
          ? sql`m.user_id = any(${textArray(named)})`
          : sql`m.job_id = any(${uuidArray(named)})`
      }`;
  // Everything that makes a row the user's rather than the matcher's, in one predicate.
  const untouched = sql`m.state = 'new'
      and m.pass_reason is null
      and m.state_changed_at is null
      and m.telegram_delivered_at is null
      and m.email_delivered_at is null
      and m.push_delivered_at is null
      and not exists (select 1 from applications a where a.match_id = m.id)
      and not exists (select 1 from kits k where k.match_id = m.id)`;

  const deleted = await db.execute<{ id: string }>(sql`
    delete from matches m
     where ${stale} and (${untouched})
    returning m.id
  `);

  const withdrawn = await db.execute<{ id: string }>(sql`
    update matches m
       set kind = 'near_miss',
           blocker = null,
           score = 0,
           score_components = null,
           gate_results = '[]'::jsonb,
           reasons = '{}'::text[],
           reason_keys = '{}'::text[],
           reason_params = '[]'::jsonb,
           gap = null,
           gap_key = null,
           gap_params = '{}'::jsonb,
           deliver_after = null,
           scorer_version = ${scorerVersion},
           updated_at = now()
     where ${stale} and not (${untouched})
    returning m.id
  `);

  return { deleted: deleted.rows.length, withdrawn: withdrawn.rows.length };
}

// ---- 5. The Brief ----------------------------------------------------------------------------

/**
 * The only tiers a Brief or a near-miss group may name: PLAN D2 as amended 2026-09-17, white and
 * red never show. A stray row of either tier is filtered on read as well as never written, because
 * one of the two has to be the last line of defence and the read is the one closest to the reader.
 */
const BRIEF_TIERS: readonly EligibilityTier[] = ["green", "yellow"];

export interface NearMissCount {
  /** Null only for a row written without a blocker. */
  blocker: MatchGate | null;
  count: number;
}

export interface BriefMatch {
  matchId: string;
  jobId: string;
  title: string;
  companyId: string;
  companyName: string;
  url: string;
  applyUrl: string | null;
  locations: string[];
  roleFamily: string | null;
  seniority: DbSeniority | null;
  stack: string[];
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  salaryPeriod: DbPayPeriod | null;
  score: number;
  scoreComponents: Record<ScoreComponent, ScoreComponentResult> | null;
  tier: EligibilityTier;
  wayOfWorking: DbWayOfWorking | null;
  /** English, as the matcher rendered it. The fallback for rows written before migration 0009. */
  reasons: string[];
  /** `ScoreReason.key` per entry of `reasons`, same order. Empty on a pre-0009 row. */
  reasonKeys: string[];
  /** `ScoreReason.params`, positionally aligned with `reasonKeys`. */
  reasonParams: Record<string, string>[];
  gap: string | null;
  gapKey: string | null;
  gapParams: Record<string, string>;
  state: MatchState;
  passReason: MatchPassReason | null;
  deliverAfter: Date | null;
  firstSeenAt: Date;
  lastVerifiedLiveAt: Date | null;
  isDemo: boolean;
}

export interface Brief {
  matches: BriefMatch[];
  nearMisses: NearMissCount[];
  /** Sum of `nearMisses`, so a caller needs no second pass to render "12 near misses". */
  nearMissTotal: number;
}

export interface BriefParams {
  userId: string;
  /** Default 50. */
  limit?: number;
  /** Optional state filter, for example `["new","saved"]`. Omitted: every state. */
  states?: readonly MatchState[];
  /**
   * Include matches whose `deliver_after` is still in the future (PLAN D13). **Default false.**
   *
   * A free account's matches are delivered 24h after the post was first seen on every channel, so
   * a reader is a channel and a reader's default has to be "what is due". A caller that wants the
   * held ones — to count them, or to say when the next one lands — asks for them by name.
   */
  includeUndelivered?: boolean;
  /**
   * Tiers that may be returned. Default green and yellow: white and red never show (PLAN D2 as
   * amended 2026-09-17).
   */
  allowedTiers?: readonly EligibilityTier[];
  /**
   * Hours the post must have been verified live within, or null for no freshness filter. Defaults
   * to `FRESHNESS_HOURS`, the same bar the hard gate is decided on.
   *
   * The gate runs once, when the row is written, and the row then ages past the bar it cleared.
   * A row that has is not a match any more; it simply stops being returned here. Re-homing it
   * into the `freshness` near-miss group is the Brief page's own job, because only a reader that
   * renders groups can put it anywhere (`apps/web/app/api/brief/_lib/db.ts`).
   */
  freshnessHours?: number | null;
}

type RawBriefMatch = {
  match_id: string;
  job_id: string;
  title: string;
  company_id: string;
  company_name: string;
  url: string;
  apply_url: string | null;
  locations: string[] | null;
  role_family: string | null;
  seniority: DbSeniority | null;
  stack: string[] | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_currency: string | null;
  salary_period: DbPayPeriod | null;
  score: number;
  score_components: Record<ScoreComponent, ScoreComponentResult> | null;
  tier: EligibilityTier;
  way_of_working: DbWayOfWorking | null;
  reasons: string[] | null;
  reason_keys: string[] | null;
  reason_params: Record<string, string>[] | null;
  gap: string | null;
  gap_key: string | null;
  gap_params: Record<string, string> | null;
  state: MatchState;
  pass_reason: MatchPassReason | null;
  deliver_after_ms: string | null;
  first_seen_at_ms: string;
  last_verified_live_at_ms: string | null;
  is_demo: boolean;
};

/**
 * Everything the Brief page shows for one user: the matches with their job and company, best score
 * first and newest first inside a score, plus the near misses grouped by the gate that blocked
 * them. The two halves aggregate differently, so they are two statements running concurrently.
 */
export async function selectBrief(db: Db, params: BriefParams): Promise<Brief> {
  const { userId } = params;
  const limit = params.limit ?? 50;
  const includeUndelivered = params.includeUndelivered ?? false;
  const allowedTiers = params.allowedTiers ?? BRIEF_TIERS;
  const freshnessHours =
    params.freshnessHours === undefined ? FRESHNESS_HOURS : params.freshnessHours;

  // Everything the matcher decided once and cannot keep up to date: the post may have closed, been
  // merged into another one, or aged out of the freshness window since the row was written, and
  // the row itself says nothing about any of it (PLAN D6, section 4.5).
  const conditions: SQL[] = [
    sql`m.user_id = ${userId}`,
    sql`m.kind = 'match'`,
    sql`j.status = 'open'`,
    sql`j.duplicate_of_job_id is null`,
    sql`m.tier = any(${tierArray(allowedTiers)})`,
  ];
  if (params.states && params.states.length > 0) {
    conditions.push(sql`m.state = any(${sql.param([...params.states])}::match_state[])`);
  }
  if (!includeUndelivered) {
    conditions.push(sql`(m.deliver_after is null or m.deliver_after <= now())`);
  }
  if (freshnessHours !== null) {
    conditions.push(sql`j.last_verified_live_at is not null`);
    conditions.push(
      sql`j.last_verified_live_at >= now() - make_interval(hours => ${freshnessHours}::int)`,
    );
  }
  if (allowedTiers.length === 0) {
    return { matches: [], nearMisses: [], nearMissTotal: 0 };
  }

  const [matchRows, nearMisses] = await Promise.all([
    db.execute<RawBriefMatch>(sql`
      select
        m.id as match_id, m.score, m.score_components, m.tier, m.way_of_working, m.reasons,
        m.reason_keys, m.reason_params, m.gap, m.gap_key, m.gap_params, m.state, m.pass_reason,
        ${epochMs(sql`m.deliver_after`, "deliver_after_ms")},
        j.id as job_id, j.title, j.url, j.apply_url, j.locations, j.role_family, j.is_demo,
        ${epochMs(sql`j.first_seen_at`, "first_seen_at_ms")},
        ${epochMs(sql`j.last_verified_live_at`, "last_verified_live_at_ms")},
        c.id as company_id, c.name as company_name,
        e.seniority, e.stack,
        case when e.salary_min is null and e.salary_max is null
             then round(j.salary_min)::int else e.salary_min end as salary_min,
        case when e.salary_min is null and e.salary_max is null
             then round(j.salary_max)::int else e.salary_max end as salary_max,
        case when e.salary_min is null and e.salary_max is null
             then j.salary_currency else e.salary_currency end as salary_currency,
        case when e.salary_min is null and e.salary_max is null
             then j.salary_period else e.salary_period end as salary_period
      from matches m
      join jobs j on j.id = m.job_id
      join companies c on c.id = j.company_id
      left join job_enrichment e on e.job_id = j.id
      where ${sql.join(conditions, sql` and `)}
      order by m.score desc, j.first_seen_at desc, m.id
      limit ${limit}
    `),
    countNearMissesByBlocker(db, userId),
  ]);

  return {
    matches: matchRows.rows.map((r) => ({
      matchId: r.match_id,
      jobId: r.job_id,
      title: r.title,
      companyId: r.company_id,
      companyName: r.company_name,
      url: r.url,
      applyUrl: r.apply_url,
      locations: r.locations ?? [],
      roleFamily: r.role_family,
      seniority: r.seniority,
      stack: r.stack ?? [],
      salaryMin: r.salary_min,
      salaryMax: r.salary_max,
      salaryCurrency: r.salary_currency,
      salaryPeriod: r.salary_period,
      score: Number(r.score),
      scoreComponents: r.score_components,
      tier: r.tier,
      wayOfWorking: r.way_of_working,
      reasons: r.reasons ?? [],
      reasonKeys: r.reason_keys ?? [],
      reasonParams: r.reason_params ?? [],
      gap: r.gap,
      gapKey: r.gap_key,
      gapParams: r.gap_params ?? {},
      state: r.state,
      passReason: r.pass_reason,
      deliverAfter: toDate(r.deliver_after_ms),
      firstSeenAt: new Date(Number(r.first_seen_at_ms)),
      lastVerifiedLiveAt: toDate(r.last_verified_live_at_ms),
      isDemo: r.is_demo,
    })),
    nearMisses,
    nearMissTotal: nearMisses.reduce((sum, n) => sum + n.count, 0),
  };
}

// ---- 6. Near misses by blocker ---------------------------------------------------------------

/**
 * One user's near misses counted per blocking gate, biggest group first (PLAN D7). `selectBrief`
 * returns the same list; this is exported separately for the callers that want only the counts
 * (the Telegram digest and the teaser show them without the match list).
 *
 * Four rules decide what counts, and they are the same four the Brief page's own reader keeps
 * (`apps/web/app/api/brief/_lib/db.ts`), because two readers of one table that disagree about
 * what a near miss is will eventually show the person two different numbers:
 *
 * 1. **It names its gate.** A real near miss always does — `nearMissBlocker` returning null is
 *    what makes the matcher write no row at all — so a blocker-less near miss is either a verdict
 *    `retireStaleMatches` withdrew or a row from before blockers were recorded. Neither is
 *    something to put in front of the person as "one thing away".
 * 2. **Nobody has acted on it.** A near miss is a recommendation; a post the person saved, applied
 *    to or passed on is a decision they already made.
 * 3. **The post is still there**: open and not superseded by a duplicate (PLAN section 4.5).
 * 4. **It is a tier they may see**: green or yellow (PLAN D2).
 */
export async function countNearMissesByBlocker(db: Db, userId: string): Promise<NearMissCount[]> {
  const total = sql<string>`count(*)`;
  const rows = await db
    .select({ blocker: matches.blocker, count: total })
    .from(matches)
    .innerJoin(jobs, eq(jobs.id, matches.jobId))
    .where(
      and(
        eq(matches.userId, userId),
        eq(matches.kind, "near_miss"),
        isNotNull(matches.blocker),
        eq(matches.state, "new"),
        eq(jobs.status, "open"),
        isNull(jobs.duplicateOfJobId),
        inArray(matches.tier, [...BRIEF_TIERS]),
      ),
    )
    .groupBy(matches.blocker)
    .orderBy(desc(total), matches.blocker);
  return rows.map((r) => ({ blocker: r.blocker, count: Number(r.count) }));
}
