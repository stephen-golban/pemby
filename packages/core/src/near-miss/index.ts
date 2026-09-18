// Near misses (PLAN D7, section 4.6): jobs that failed exactly one gate, or that cleared every gate
// and scored between `nearMissMin` and the match threshold. Grouped by blocker for the Brief, so
// each group can carry one one-tap fix ("6 had no pay listed, show them?").
//
// The blocker vocabulary is the `match_gate` pg enum in full: the seven hard gates plus `score`.

import type { GateOutcome } from "../gates";
import { DB_HARD_GATES, HARD_GATES, fromDbGate, toDbGate } from "../gates";

export const NEAR_MISS_BLOCKERS = [...HARD_GATES, "score"] as const;
export type NearMissBlocker = (typeof NEAR_MISS_BLOCKERS)[number];

/** `match_gate` pg enum values, in full. */
export const DB_NEAR_MISS_BLOCKERS = [...DB_HARD_GATES, "score"] as const;
export type DbNearMissBlocker = (typeof DB_NEAR_MISS_BLOCKERS)[number];

export function toDbBlocker(blocker: NearMissBlocker): DbNearMissBlocker {
  return blocker === "score" ? "score" : toDbGate(blocker);
}

export function fromDbBlocker(blocker: DbNearMissBlocker): NearMissBlocker {
  return blocker === "score" ? "score" : fromDbGate(blocker);
}

export interface NearMiss {
  jobId: string;
  blocker: NearMissBlocker;
  score: number;
}

export interface NearMissGroup {
  blocker: NearMissBlocker;
  count: number;
  jobIds: readonly string[];
}

/** The `thresholds` half of the private-config scoring weights. */
export interface MatchThresholds {
  match: number;
  nearMissMin: number;
}

/**
 * The blocker to record for one evaluated job, or null when the job is a match, is dropped, or is
 * too far off to be worth showing.
 *
 * A job rejected outright (a post asking the candidate for money, PLAN D11) is never a near miss.
 */
export function nearMissBlocker(
  outcome: GateOutcome,
  score: number,
  thresholds: MatchThresholds,
): NearMissBlocker | null {
  if (outcome.rejected !== null) return null;
  if (outcome.soleFailure !== null) return outcome.soleFailure;
  if (outcome.failed.length > 0) return null;
  if (score >= thresholds.match) return null;
  return score >= thresholds.nearMissMin ? "score" : null;
}

/** Groups near misses by blocker, largest group first, ties in `NEAR_MISS_BLOCKERS` order. */
export function groupNearMisses(items: readonly NearMiss[]): NearMissGroup[] {
  const byBlocker = new Map<NearMissBlocker, string[]>();
  for (const item of items) {
    const jobIds = byBlocker.get(item.blocker);
    if (jobIds) jobIds.push(item.jobId);
    else byBlocker.set(item.blocker, [item.jobId]);
  }
  const groups: NearMissGroup[] = [];
  for (const blocker of NEAR_MISS_BLOCKERS) {
    const jobIds = byBlocker.get(blocker);
    if (jobIds && jobIds.length > 0) groups.push({ blocker, count: jobIds.length, jobIds });
  }
  return groups.sort((a, b) => b.count - a.count);
}
