// `match.profile`: one user whose profile changed, against the open jobs.
//
// The mirror of `match-job.ts`. Here the SQL pre-filter can do far more, because there is one user
// and the candidate query knows their country, ways of working, role families and seniority band;
// `selectMatchCandidateJobs` returns at most `MATCH_PROFILE_JOB_LIMIT` rows already narrowed on
// existing indexes, and only the verdict happens in memory.
//
// **Personal data**: this whole file works on one person's profile and CV. It logs ids, counts and
// milliseconds, and nothing else.
//
// No model call (PLAN D18).
import { FRESHNESS_HOURS, SCORER_VERSION, type ScoringWeights } from "@pemby/core";
import { loadScoringWeights } from "@pemby/core/private-config";
import {
  jobSimilarity,
  retireStaleMatches,
  selectMatchCandidateJobs,
  upsertMatches,
  type Db,
  type MatchUpsertRow,
  type RetiredMatches,
} from "@pemby/db";
import { activePasses, jobRedFlags, matchProfileRow, staleMatchJobIds, userDomains } from "./db";
import { evaluatePair, formatTally, newTally, tally, type MatchTally } from "./evaluate";
import { MATCH_TIER_BAND } from "./match-job";
import { candidateSeniorities, jobFactsFromCandidate, userFactsFromProfile } from "./map";

/**
 * Most stale rows one run will pull back into the candidate set. A cap, not a knob: these are rows
 * the user already has, so the number is small in practice, and a bound keeps one pathological
 * profile from turning a re-match into a full-table scan. Anything above it is retired this run and
 * re-scored by the next.
 */
const STALE_RESCORE_LIMIT = 200;

export interface MatchProfileDeps {
  db: Db;
  /** Candidate jobs loaded and scored in one run (`MATCH_PROFILE_JOB_LIMIT`). */
  jobLimit: number;
  weights?: ScoringWeights;
  now?: Date;
  /** Evaluate and count, write nothing. The debugging script's `--dry-run`. */
  dryRun?: boolean;
  /**
   * Match a profile that has not finished onboarding. Off in the queue handler (PLAN D5: a Brief
   * needs a finished profile); the debugging script turns it on so a half-filled profile can be
   * inspected without being delivered anything.
   */
  includeUnonboarded?: boolean;
}

export type MatchProfileSkip =
  | "not-found"
  /** PLAN D5: onboarding is what fills the fields every hard gate reads. */
  | "not-onboarded"
  /** No residence country, so the eligibility gate has nothing to decide on. */
  | "no-country"
  /** No ways of working, so no eligibility row can apply. */
  | "no-ways";

export type MatchProfileOutcome =
  | { kind: "skipped"; reason: MatchProfileSkip }
  | {
      kind: "matched";
      jobs: number;
      written: number;
      tally: MatchTally;
      /** Rows the current scorer never produced and this run could not re-score. */
      retired: RetiredMatches;
      ms: number;
    };

/** Matches one profile against the open jobs and upserts the rows in one batch. */
export async function matchOneProfile(
  deps: MatchProfileDeps,
  id: { profileId: string } | { userId: string },
): Promise<MatchProfileOutcome> {
  const { db } = deps;
  const started = Date.now();
  const now = deps.now ?? new Date();

  const profile = await matchProfileRow(db, id);
  if (!profile) return { kind: "skipped", reason: "not-found" };
  if (!profile.onboarded && deps.includeUnonboarded !== true) {
    return { kind: "skipped", reason: "not-onboarded" };
  }
  if (profile.waysOfWorking.length === 0) return { kind: "skipped", reason: "no-ways" };

  const [domains, passes] = await Promise.all([
    userDomains(db, [profile.userId]),
    activePasses(db, [profile.userId]),
  ]);
  const facts = userFactsFromProfile(profile, {
    domains: domains.get(profile.userId) ?? [],
    pass: passes.get(profile.userId) ?? null,
    now,
  });
  if (!facts) return { kind: "skipped", reason: "no-country" };

  const weights = deps.weights ?? (await loadScoringWeights());
  const thresholds = weights.thresholds;

  // Pairs this user already has a row for that no run of the current scorer has confirmed. They are
  // added to the candidate set so the run judges them properly instead of leaving them behind: the
  // pre-filters that dropped them (role family, seniority, freshness) are guesses about what is
  // worth looking at, and every one of them is re-decided by a gate. Whatever the run does not
  // reach this way — a job now closed, or one whose eligibility no longer covers this country — is
  // retired below rather than left at its old score.
  const stale = await staleMatchJobIds(db, profile.userId, SCORER_VERSION, STALE_RESCORE_LIMIT);

  // `facts.families` is `compatibleFamilies(titles)`: null means "skip the role filter", which is
  // exactly what this parameter means too, so it is passed straight through.
  const candidates = await selectMatchCandidateJobs(db, {
    residenceCountry: facts.user.residenceCountry ?? "",
    waysOfWorking: profile.waysOfWorking,
    allowedTiers: MATCH_TIER_BAND,
    roleFamilies: facts.families === null ? null : [...facts.families],
    seniorities: candidateSeniorities(facts.user.seniority),
    freshnessHours: FRESHNESS_HOURS,
    limit: deps.jobLimit,
    alsoJobIds: stale,
  });

  const jobIds = candidates.map((c) => c.jobId);
  const [similarity, redFlags] = await Promise.all([
    jobSimilarity(db, { profileId: profile.profileId, jobIds }),
    jobRedFlags(db, jobIds),
  ]);
  // A job absent from `jobSimilarity` has no embedding yet and gets null, never 0.
  const similarityById = new Map(similarity.map((s) => [s.jobId, s.similarity]));

  const t = newTally();
  const rows: MatchUpsertRow[] = [];
  // The other half of the run's verdict: the jobs this run judged and deliberately wrote no row for.
  // All four `evaluatePair` skips belong here — a money ask, a tier that never shows, a role family
  // the user is not open to and a pair that is not even close are each a decision that this pair
  // should not exist, not a pair that went unexamined. `selectMatchCandidateJobs` is
  // `distinct on (job_id)`, so a job lands in exactly one of the two lists.
  const noRowJobIds: string[] = [];
  for (const candidate of candidates) {
    const {
      facts: job,
      tier,
      wayOfWorking,
    } = jobFactsFromCandidate(candidate, redFlags.get(candidate.jobId) ?? []);
    const result = evaluatePair({
      user: facts,
      job,
      tier,
      wayOfWorking,
      similarity: similarityById.get(candidate.jobId) ?? null,
      weights,
      thresholds,
      now,
    });
    tally(t, result);
    if (result.kind === "row") rows.push(result.row);
    else noRowJobIds.push(candidate.jobId);
  }

  let retired: RetiredMatches = { deleted: 0, withdrawn: 0 };
  if (deps.dryRun !== true) {
    await upsertMatches(db, rows);
    // Both retire modes, named first and version second, and the order is load-bearing. A named row
    // that also sits below the current version is either deleted outright or withdrawn *and stamped*
    // at the current version, so by the time the version call runs there is nothing left of it for
    // that call to redo. The other way round, the version call would withdraw the row first and the
    // named call would then find an already-current row and withdraw it a second time.
    //
    // Named mode is what makes the one-tap near-miss fix visible: it reaches rows already at the
    // current version that this run has just judged out of existence, which version mode cannot see.
    // Version mode still runs, because it collects the pairs this run never loaded at all.
    const named = await retireStaleMatches(db, {
      userId: profile.userId,
      scorerVersion: SCORER_VERSION,
      noRowJobIds,
    });
    // After the upsert, so a pair this run re-scored is already current and out of scope.
    const byVersion = await retireStaleMatches(db, {
      userId: profile.userId,
      scorerVersion: SCORER_VERSION,
    });
    retired = {
      deleted: named.deleted + byVersion.deleted,
      withdrawn: named.withdrawn + byVersion.withdrawn,
    };
  }
  return {
    kind: "matched",
    jobs: candidates.length,
    written: rows.length,
    tally: t,
    retired,
    ms: Date.now() - started,
  };
}

/** One line: ids, counts and milliseconds only. Never a title, a profile field or a reason. */
export function formatMatchProfile(profileId: string, outcome: MatchProfileOutcome): string {
  if (outcome.kind === "skipped") {
    return `match.profile profile=${profileId} skipped: ${outcome.reason}`;
  }
  const { deleted, withdrawn } = outcome.retired;
  return `match.profile profile=${profileId} jobs=${outcome.jobs} written=${outcome.written} ${formatTally(outcome.tally)} retired=${deleted}/${withdrawn} ms=${outcome.ms}`;
}
