// `match.job`: one newly enriched job against every eligible user.
//
// This is the fan-out that has to scale. Users are read one keyset page at a time
// (`selectMatchCandidateUsers`' `afterId`), never all at once, and every per-user lookup the page
// needs — similarity, CV domains, passes — is one batched query for the whole page rather than one
// per user. A page therefore costs a fixed 5 round trips whatever its size, so the run is linear in
// users with a small constant and flat in memory.
//
// No model call (PLAN D18). Nothing in this file or its imports touches `@pemby/ai`.
import { SCORER_VERSION, fromDbWay, type ScoringWeights } from "@pemby/core";
import { loadScoringWeights } from "@pemby/core/private-config";
import {
  retireStaleMatches,
  selectMatchCandidateUsers,
  upsertMatches,
  type Db,
  type EligibilityTier,
  type MatchUpsertRow,
  type RetiredMatches,
} from "@pemby/db";
import { activePasses, matchJobRow, profileSimilarity, userDomains } from "./db";
import { evaluatePair, formatTally, newTally, tally, type MatchTally } from "./evaluate";
import { jobFactsFromRow, userFactsFromCandidate, withinFreshnessWindow } from "./map";

/**
 * Users read per keyset page. Not an environment knob: it trades round trips against the memory one
 * page holds, and neither side of that trade is deployment-specific. 200 profiles is a few hundred
 * kilobytes and five queries; the page size does not change what the run produces.
 */
export const USER_PAGE_SIZE = 200;

/**
 * The widened tier band the candidate query looks at, never the pass/fail line — `evaluateGates`
 * applies the user's own `allowedTiers` from `entitlementsFor`.
 *
 * Green and yellow only. A yellow job reaching a user who has not opted in fails exactly the
 * eligibility gate and becomes a near miss whose one-tap fix is "include yellow" (PLAN D7's worked
 * example, and the D13 amendment's whole mechanism). White and red are left out on purpose: they
 * never show (PLAN D2 amended 2026-09-17), so a near-miss row would leak their existence into a
 * count the user can see.
 */
export const MATCH_TIER_BAND: readonly EligibilityTier[] = ["green", "yellow"];

export interface MatchJobDeps {
  db: Db;
  /** Loaded once and reused; `loadScoringWeights` caches, so this is only for scripts. */
  weights?: ScoringWeights;
  now?: Date;
  /** Evaluate and count, write nothing. The debugging script's `--dry-run`. */
  dryRun?: boolean;
  /**
   * Also fan out over profiles that have not finished onboarding. Off in the queue handler (PLAN
   * D5: a Brief needs a finished profile), and the mirror of `MatchProfileDeps.includeUnonboarded`.
   * The debugging script turns it on to measure the fan-out against a larger user set than the
   * handful of finished profiles staging holds.
   */
  includeUnonboarded?: boolean;
  /**
   * Until phase 10, the user ids the entitlements module treats as pass holders
   * (`DELIVER_TEST_PASS_HOLDERS`). It reaches `deliverAfter`, so it is what makes a pass holder's
   * `matches.deliver_after` be `now` instead of `first_seen_at + 24h`.
   *
   * **Required** since phase 09. It was optional "so the debugging script keeps compiling", and
   * that convenience is exactly the defect: an omitted allowlist is indistinguishable from an empty
   * one, every user resolves to the free plan, and instant delivery silently does not exist. The
   * script passes `readMatchEnv().testPassHolders`, which is what the queue handler passes too, so
   * nothing had to be invented to make this required — and omitting it is now a compile error here
   * rather than a wrong `deliver_after` on staging.
   */
  testPassHolders: readonly string[];
}

export type MatchJobSkip =
  /** No such job, or it is closed, a duplicate, or has no enrichment row yet. */
  | "not-matchable"
  /** PLAN D11: the post asks the candidate for money. Dropped whole, before any user is read. */
  | "money-ask"
  /** Cannot clear the freshness gate for anyone, so the fan-out would write the same near miss N times. */
  | "stale";

export type MatchJobOutcome =
  | { kind: "skipped"; reason: MatchJobSkip }
  | {
      kind: "matched";
      users: number;
      pages: number;
      written: number;
      tally: MatchTally;
      /** Rows on this job the current scorer never produced and this run did not re-score. */
      retired: RetiredMatches;
      ms: number;
    };

/**
 * Matches one job against every eligible user and upserts the rows, a page at a time.
 *
 * Three whole-job skips happen before the first user is read, because all three would decide every
 * pair the same way: the job is not matchable at all, it asks the candidate for money (PLAN D11 —
 * no match row, no near-miss row, nothing), or it cannot clear the freshness gate.
 */
export async function matchOneJob(deps: MatchJobDeps, jobId: string): Promise<MatchJobOutcome> {
  const { db } = deps;
  const started = Date.now();
  const now = deps.now ?? new Date();

  const row = await matchJobRow(db, jobId);
  if (!row) return { kind: "skipped", reason: "not-matchable" };
  if (row.asksCandidateForMoney) return { kind: "skipped", reason: "money-ask" };
  if (!withinFreshnessWindow(row.lastVerifiedLiveAt, now)) {
    return { kind: "skipped", reason: "stale" };
  }

  const weights = deps.weights ?? (await loadScoringWeights());
  const thresholds = weights.thresholds;
  const job = jobFactsFromRow(row);

  const t = newTally();
  let users = 0;
  let pages = 0;
  let written = 0;
  let afterId: string | null = null;
  // Accumulated across the pages and then across the two retire modes, so the outcome reports one
  // pair of numbers whatever shape the run took.
  const retired: RetiredMatches = { deleted: 0, withdrawn: 0 };

  for (;;) {
    const page = await selectMatchCandidateUsers(db, {
      jobId,
      allowedTiers: MATCH_TIER_BAND,
      afterId,
      limit: USER_PAGE_SIZE,
      onboardedOnly: deps.includeUnonboarded !== true,
    });
    if (page.length === 0) break;
    pages += 1;
    users += page.length;
    afterId = page[page.length - 1]!.profileId;

    const profileIds = page.map((u) => u.profileId);
    const userIds = [...new Set(page.map((u) => u.userId))];
    const [similarity, domains, passes] = await Promise.all([
      profileSimilarity(db, jobId, profileIds),
      userDomains(db, userIds),
      activePasses(db, userIds),
    ]);

    const rows: MatchUpsertRow[] = [];
    // The users on this page that this run judged and deliberately wrote no row for. All four
    // `evaluatePair` skips belong here — each is a decision that the pair should not exist, not a
    // pair that went unexamined — and the `!facts` guard below does not, because nothing judged it.
    const noRowUserIds: string[] = [];
    for (const candidate of page) {
      const facts = userFactsFromCandidate(candidate, {
        domains: domains.get(candidate.userId) ?? [],
        pass: passes.get(candidate.userId) ?? null,
        now,
        testPassHolders: deps.testPassHolders,
      });
      // A profile with no residence country cannot be gated on eligibility at all; the candidate
      // query already requires one, so this is a guard, not a branch anyone reaches.
      if (!facts) continue;
      const result = evaluatePair({
        user: facts,
        job,
        tier: candidate.tier,
        // The way of working the eligibility row that matched this user was recorded under.
        wayOfWorking: fromDbWay(candidate.wayOfWorking),
        similarity: similarity.get(candidate.profileId) ?? null,
        weights,
        thresholds,
        now,
      });
      tally(t, result);
      if (result.kind === "row") rows.push(result.row);
      else noRowUserIds.push(candidate.userId);
    }

    if (deps.dryRun !== true) {
      await upsertMatches(db, rows);
      // Named mode, per page and right after that page's upsert: memory stays flat whatever the user
      // count, and a run that dies on page nine keeps the retirements pages one to eight earned.
      // Named mode is the half that reaches rows already at the current scorer version — a user who
      // has just been judged out of this job's near misses — which the version-mode call below
      // cannot see.
      //
      // `profiles.user_id` is unique and the page is `distinct on (p.id)`, so a user cannot be in
      // both lists; the filter is a cheap guard against that assumption changing, not a fix for a
      // known case.
      const writtenIds = new Set(rows.map((r) => r.userId));
      const named = await retireStaleMatches(db, {
        jobId,
        scorerVersion: SCORER_VERSION,
        noRowUserIds: noRowUserIds.filter((id) => !writtenIds.has(id)),
      });
      retired.deleted += named.deleted;
      retired.withdrawn += named.withdrawn;
    }
    written += rows.length;
    if (page.length < USER_PAGE_SIZE) break;
  }

  // This direction pages over **every** eligible user until the pages run out, so any row on this
  // job still below the current scorer version is a pair that no longer qualifies — the user's
  // country lost its eligibility row, their seniority moved, their ways of working changed. The
  // pages above have already stamped the current version on everyone who does qualify.
  //
  // It stays here, once, after the loop: version mode assumes it has seen the whole scope, and that
  // is only true once every page has run.
  if (deps.dryRun !== true) {
    const byVersion = await retireStaleMatches(db, { jobId, scorerVersion: SCORER_VERSION });
    retired.deleted += byVersion.deleted;
    retired.withdrawn += byVersion.withdrawn;
  }

  return { kind: "matched", users, pages, written, tally: t, retired, ms: Date.now() - started };
}

/** One line: ids, counts and milliseconds only. Never a title, a profile field or a reason. */
export function formatMatchJob(jobId: string, outcome: MatchJobOutcome): string {
  if (outcome.kind === "skipped") return `match.job job=${jobId} skipped: ${outcome.reason}`;
  const { users, pages, written, ms, retired } = outcome;
  const perUser = users > 0 ? (ms / users).toFixed(2) : "0.00";
  return `match.job job=${jobId} users=${users} pages=${pages} written=${written} ${formatTally(outcome.tally)} retired=${retired.deleted}/${retired.withdrawn} ms=${ms} msPerUser=${perUser}`;
}
