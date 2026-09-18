// One (user, job) pair, evaluated. Pure: plain data in, one `matches` row or null out, clock passed
// in. Both directions of the matcher (`match.job` fans a job over users, `match.profile` fans a user
// over jobs) go through this function, so the two can never disagree about a verdict.
//
// **No model call happens anywhere in this module or anything it imports** (PLAN D18): matching is
// hard gates, a weighted score over embeddings and rules, and templated reasons. `@pemby/ai` is not
// a dependency of `apps/worker/src/match/**` and must not become one.
//
// Personal data: a `MatchUser` is built from a profile and the CV behind it. Nothing here logs, and
// the strings it returns (`reasons`, `gap`) go into `matches`, never into a log line.
import {
  HARD_GATES,
  evaluateGates,
  nearMissBlocker,
  renderScoreReason,
  SCORER_VERSION,
  scoreMatch,
  toDbBlocker,
  toDbWay,
  type EligibilityTier,
  type MatchJob,
  type MatchScore,
  type MatchThresholds,
  type MatchUser,
  type RoleFamily,
  type ScoringWeights,
  type WayOfWorking,
} from "@pemby/core";
import type { MatchUpsertRow } from "@pemby/db";

/** The job half of a pair, with the two per-user fields (`tier`, `wayOfWorking`) left out. */
export interface JobFacts {
  jobId: string;
  /** `jobs.first_seen_at`: what `deliverAfter` is measured from (PLAN section 4.4), never `now`. */
  firstSeenAt: Date;
  base: Omit<MatchJob, "tier" | "wayOfWorking">;
}

/** The user half of a pair, already reduced to what the gates and the score read. */
export interface UserFacts {
  userId: string;
  profileId: string;
  user: MatchUser;
  /** From `entitlementsFor`: green, or green and yellow when the person opted in (PLAN D13). */
  allowedTiers: readonly EligibilityTier[];
  /** From `entitlementsFor` too; turned into `deliver_after` by `deliverAfter`. */
  deliverAfter: (jobFirstSeenAt: Date) => Date;
  /** `profiles.scoring_nudges`: the user's own "Not for me" feedback. */
  nudges: Record<string, number>;
  /**
   * `compatibleFamilies(titles)`, or null when the role filter is skipped. PLAN D10's role filter
   * is a pre-filter, not a gate, and `selectMatchCandidateJobs` applies it in SQL while
   * `selectMatchCandidateUsers` cannot (it has one job and many users). Applying it here keeps the
   * two directions producing the same rows.
   */
  families: readonly RoleFamily[] | null;
}

export interface EvaluateInput {
  user: UserFacts;
  job: JobFacts;
  /** Tier of the `job_eligibility` row that matched this user's country and way of working. */
  tier: EligibilityTier;
  wayOfWorking: WayOfWorking | null;
  /** Cosine similarity, or null when either side has no embedding. Never substitute 0. */
  similarity: number | null;
  weights: ScoringWeights;
  thresholds: MatchThresholds;
  now: Date;
}

export type EvaluateSkip =
  /** PLAN D11: the post asks the candidate for money. No match row, no near-miss row, nothing. */
  | "money-ask"
  /**
   * PLAN D2 (amended 2026-09-17): the job's eligibility tier is white or red, which never show.
   * `evaluateGates` refuses these where they cannot be reclassified as a near miss, so they arrive
   * as a `GateRejection` exactly as a money-ask post does. Counted apart from money-ask because the
   * two say completely different things about a run: one is a scam filter firing, the other is the
   * tier band doing its job, and a single counter reported the second as the first.
   */
  | "never-shown-tier"
  /** PLAN D10's role filter, applied in SQL in the other direction. */
  | "role-family"
  /** Failed more than one gate, or scored below `nearMissMin`. Not worth a row (PLAN section 4.6). */
  | "not-close";

export type EvaluateResult =
  | {
      kind: "row";
      row: MatchUpsertRow;
      score: number;
      blocker: string | null;
      /**
       * The full score behind the row: components, evidence and ceiling. The row stores the parts
       * the product needs; this carries the rest so the measurement script can say *why* a pair
       * landed where it did without re-scoring it. Nothing persists it.
       */
      detail: MatchScore;
    }
  | { kind: "skip"; reason: EvaluateSkip };

/**
 * Evaluates one pair and returns the row to upsert, or why there is none.
 *
 * A match is every hard gate passed **and** a score at or above `thresholds.match` (PLAN D6). A
 * near miss is exactly one failed gate, or every gate passed with a score between `nearMissMin` and
 * `match`; `nearMissBlocker` owns that decision and returns null when there is nothing to store.
 *
 * `deliver_after` is filled only for a match: near misses are never delivered, and the partial
 * index on `matches.deliver_after` is `where kind = 'match'`.
 */
export function evaluatePair(input: EvaluateInput): EvaluateResult {
  const { user, job, tier, wayOfWorking, similarity, weights, thresholds, now } = input;

  const family = job.base.roleFamily;
  if (family !== null && user.families !== null && !user.families.includes(family)) {
    return { kind: "skip", reason: "role-family" };
  }

  const matchJob: MatchJob = { ...job.base, tier, wayOfWorking };
  const outcome = evaluateGates({
    user: user.user,
    job: matchJob,
    allowedTiers: user.allowedTiers,
    now,
  });
  // Both rejection kinds mean the same thing to this function — drop the pair, write nothing — but
  // not to the tally, so the reason is carried through rather than flattened.
  if (outcome.rejected !== null) {
    return {
      kind: "skip",
      reason:
        outcome.rejected.kind === "asks-candidate-for-money" ? "money-ask" : "never-shown-tier",
    };
  }

  const score = scoreMatch(
    { user: user.user, job: matchJob, embeddingSimilarity: similarity },
    weights,
    user.nudges,
  );

  const isMatch = outcome.passed && score.total >= thresholds.match;
  const blocker = isMatch ? null : nearMissBlocker(outcome, score.total, thresholds);
  if (!isMatch && blocker === null) return { kind: "skip", reason: "not-close" };

  // Reasons are stored twice, on purpose. `reason_keys` / `reason_params` are the real payload —
  // `ScoreReason` exactly as the score produced it — and are what the Brief, Telegram and email
  // render through i18n. `reasons` / `gap` keep the English the matcher would have rendered, as the
  // fallback for rows written before migration 0009 and for a key a renderer does not know.
  const row: MatchUpsertRow = {
    userId: user.userId,
    jobId: job.jobId,
    kind: isMatch ? "match" : "near_miss",
    blocker: blocker === null ? null : toDbBlocker(blocker),
    gateResults: HARD_GATES.map((gate) => outcome.results[gate]),
    score: score.total,
    scoreComponents: score.components,
    tier,
    wayOfWorking: wayOfWorking === null ? null : toDbWay(wayOfWorking),
    reasons: score.reasons.map((r) => renderScoreReason(r.key, r.params)),
    reasonKeys: score.reasons.map((r) => r.key),
    reasonParams: score.reasons.map((r) => r.params),
    gap: score.gap === null ? null : renderScoreReason(score.gap.key, score.gap.params),
    gapKey: score.gap?.key ?? null,
    gapParams: score.gap?.params ?? {},
    deliverAfter: isMatch ? user.deliverAfter(job.firstSeenAt) : null,
    // Stamped on every row, so `retireStaleMatches` can tell this verdict from one an older scorer
    // left behind on a pair the matcher no longer reaches.
    scorerVersion: SCORER_VERSION,
  };
  return { kind: "row", row, score: score.total, blocker, detail: score };
}

/**
 * One pair explained, for the measurement script. Job id, component names and numbers only — no
 * title, no profile field, no rendered reason string, so a run can be pasted anywhere the tally
 * itself can.
 */
export interface ScoredPair {
  jobId: string;
  kind: "match" | "near_miss";
  blocker: string | null;
  total: number;
  /** The weighted fit before the ceiling, so `fit > ceiling` shows which of the two bound. */
  fit: number;
  ceiling: number;
  evidence: number;
  scored: readonly string[];
  notApplicable: readonly string[];
  missing: readonly string[];
  reasonCount: number;
}

/** How many of the run's best pairs `tally` keeps an explanation for. */
export const TOP_PAIRS = 8;

/** Counts for one run's log line: ids, counts and milliseconds only, never a title or a reason. */
export interface MatchTally {
  evaluated: number;
  matches: number;
  nearMisses: number;
  skippedMoneyAsk: number;
  /** Pairs dropped because the job's tier is white or red (PLAN D2): never a money-ask post. */
  skippedNeverShownTier: number;
  skippedRoleFamily: number;
  skippedNotClose: number;
  /** Near misses per blocker, in the database's spelling. */
  blockers: Record<string, number>;
  /** Scores of the rows written, for a distribution in the debugging script. */
  scores: number[];
  /**
   * The run's `TOP_PAIRS` highest-scoring rows, explained, for the same script. Bounded, so a
   * production run carries a handful of small objects and nothing more.
   */
  top: ScoredPair[];
  /**
   * Gate notes carried by the rows written, counted by reason key: `years-tolerated=12`. The notes
   * are the honest labels the gates attach to a verdict they let through ("the post asks 5 years;
   * your CV shows 4"), so this is how a run says how often the tolerances actually spoke. Keys are
   * `GateReasonKey` spellings, which are public vocabulary — no rendered sentence, no user text.
   */
  gateNotes: Record<string, number>;
  /** Rows written, counted by how many reason bullets they carry: index 0 to 3 (PLAN D6's top 3). */
  bullets: number[];
  /** The same, for matches alone — a match with one bullet is a thin thing to deliver. */
  matchBullets: number[];
}

export function newTally(): MatchTally {
  return {
    evaluated: 0,
    matches: 0,
    nearMisses: 0,
    skippedMoneyAsk: 0,
    skippedNeverShownTier: 0,
    skippedRoleFamily: 0,
    skippedNotClose: 0,
    blockers: {},
    gateNotes: {},
    scores: [],
    top: [],
    bullets: [0, 0, 0, 0],
    matchBullets: [0, 0, 0, 0],
  };
}

/** Keeps the run's best `TOP_PAIRS` pairs, highest score first. */
function keepTop(t: MatchTally, result: Extract<EvaluateResult, { kind: "row" }>): void {
  const { detail } = result;
  const fit = Object.values(detail.components).reduce((sum, c) => sum + c.points, 0);
  const pair: ScoredPair = {
    jobId: result.row.jobId,
    kind: result.row.kind,
    blocker: result.blocker,
    total: detail.total,
    fit,
    ceiling: detail.ceiling,
    evidence: detail.evidence,
    scored: Object.entries(detail.components)
      .filter(([, c]) => c.value !== null)
      .map(([key]) => key),
    notApplicable: detail.notApplicable,
    missing: detail.missing,
    reasonCount: detail.reasons.length,
  };
  t.top.push(pair);
  t.top.sort((a, b) => b.total - a.total || a.jobId.localeCompare(b.jobId));
  if (t.top.length > TOP_PAIRS) t.top.length = TOP_PAIRS;
}

export function tally(t: MatchTally, result: EvaluateResult): void {
  t.evaluated += 1;
  if (result.kind === "skip") {
    if (result.reason === "money-ask") t.skippedMoneyAsk += 1;
    else if (result.reason === "never-shown-tier") t.skippedNeverShownTier += 1;
    else if (result.reason === "role-family") t.skippedRoleFamily += 1;
    else t.skippedNotClose += 1;
    return;
  }
  t.scores.push(result.score);
  keepTop(t, result);
  for (const gate of result.row.gateResults) {
    for (const note of gate.notes) t.gateNotes[note.key] = (t.gateNotes[note.key] ?? 0) + 1;
  }
  const bullets = Math.min(t.bullets.length - 1, result.row.reasonKeys?.length ?? 0);
  t.bullets[bullets]! += 1;
  if (result.row.kind === "match") {
    t.matches += 1;
    t.matchBullets[bullets]! += 1;
    return;
  }
  t.nearMisses += 1;
  const key = result.row.blocker ?? "none";
  t.blockers[key] = (t.blockers[key] ?? 0) + 1;
}

/**
 * `matches=3 nearMisses=12 skipped=0/4/9/3 blockers=eligibility:9,salary_missing:3`. No user or job
 * text. The four skip counts are money-ask / never-shown-tier / role-family / not-close, in that
 * order — the second used to be folded into the first and made a tier band look like a scam filter.
 */
export function formatTally(t: MatchTally): string {
  const blockers = Object.entries(t.blockers)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, n]) => `${key}:${n}`)
    .join(",");
  return `evaluated=${t.evaluated} matches=${t.matches} nearMisses=${t.nearMisses} skipped=${t.skippedMoneyAsk}/${t.skippedNeverShownTier}/${t.skippedRoleFamily}/${t.skippedNotClose}${blockers ? ` blockers=${blockers}` : ""}`;
}
