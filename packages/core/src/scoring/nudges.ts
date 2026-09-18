// "Not for me" feedback, as per-user score nudges (PLAN D6, section 4). Additive point deltas on
// namespaced keys, so the owner can read a nudge map and see exactly why a job scored lower.
//
// The map is bounded on every axis: a fixed step per event, a clamp per key, a cap on how many
// keys a user may hold, and a clamp on the total any one score can move. Without those it grows
// forever and eventually outweighs the real signal.

import { differenceBySlug, slug, slugSet } from "../matching/normalize";
import type { MatchJob, MatchPassReason } from "../matching/types";
import { jobListsSalary } from "../matching/types";
import type { RoleFamily } from "../roles";
import type { Seniority } from "../ways-of-working";

export const NUDGE_LIMITS = {
  /** Points a single "Not for me" removes from one key. */
  step: 3,
  /** Clamp on any one key's delta. */
  minPerKey: -15,
  maxPerKey: 15,
  /** Most keys one user's map may hold; the weakest signal is evicted first. */
  maxKeys: 100,
  /** Clamp on the sum applied to any one score, so nudges cannot swamp the real signal. */
  minTotal: -25,
  maxTotal: 25,
  /** Most `stack:` keys one "Not for me" may create. */
  maxStackKeysPerEvent: 3,
} as const;

/** The parts of a job a nudge key can name. `MatchJob` converts with `toNudgeJob`. */
export interface NudgeJob {
  companyId: string | null;
  roleFamily: RoleFamily | null;
  seniority: Seniority | null;
  stack: readonly string[];
  listsSalary: boolean;
}

export function toNudgeJob(job: MatchJob): NudgeJob {
  return {
    companyId: job.companyId,
    roleFamily: job.roleFamily,
    seniority: job.seniority,
    stack: job.stack,
    listsSalary: jobListsSalary(job),
  };
}

export interface PassFeedback {
  /** Exactly the `match_pass_reason` pg enum values (PLAN D6: no free text). */
  reason: MatchPassReason;
  job: NudgeJob;
  /** The user's own stack, so only technologies they lack earn a `stack:` nudge. */
  userStack: readonly string[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Keys one "Not for me" touches.
 *
 * - `location` earns nothing: disagreeing with the eligibility read is a flag (PLAN section 6),
 *   not a scoring preference, and the score has no location component to nudge.
 * - `already_applied` earns nothing either: the user liked the job enough to apply.
 * - `other` carries no signal by construction.
 */
export function nudgeKeysFor(feedback: PassFeedback): string[] {
  const { reason, job } = feedback;
  switch (reason) {
    case "stack": {
      const have = slugSet(feedback.userStack);
      return differenceBySlug(job.stack, have)
        .slice(0, NUDGE_LIMITS.maxStackKeysPerEvent)
        .map((name) => `stack:${slug(name)}`);
    }
    case "role":
      return job.roleFamily ? [`family:${job.roleFamily}`] : [];
    case "company":
      return job.companyId ? [`company:${job.companyId}`] : [];
    case "seniority":
      return job.seniority ? [`seniority:${job.seniority}`] : [];
    case "salary":
      return job.listsSalary ? [] : ["signal:no-salary-listed"];
    case "location":
    case "already_applied":
    case "other":
      return [];
  }
}

/** Keys a job can be nudged by, in the order they are summed. */
export function nudgeKeysOfJob(job: NudgeJob): string[] {
  const keys: string[] = [];
  if (job.companyId) keys.push(`company:${job.companyId}`);
  if (job.roleFamily) keys.push(`family:${job.roleFamily}`);
  if (job.seniority) keys.push(`seniority:${job.seniority}`);
  for (const name of job.stack) {
    const s = slug(name);
    if (s.length > 0) keys.push(`stack:${s}`);
  }
  if (!job.listsSalary) keys.push("signal:no-salary-listed");
  return [...new Set(keys)];
}

/** Drops anything unusable that came back from jsonb and clamps what is left. */
function sanitize(nudges: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, value] of Object.entries(nudges)) {
    if (key.length === 0 || typeof value !== "number" || !Number.isFinite(value)) continue;
    const delta = clamp(Math.round(value), NUDGE_LIMITS.minPerKey, NUDGE_LIMITS.maxPerKey);
    if (delta !== 0) out[key] = delta;
  }
  return out;
}

/** Evicts the weakest keys until the map fits `maxKeys`. Ties break on key name, so it is stable. */
function evict(nudges: Record<string, number>): Record<string, number> {
  const entries = Object.entries(nudges);
  if (entries.length <= NUDGE_LIMITS.maxKeys) return nudges;
  entries.sort((a, b) => {
    const strength = Math.abs(b[1]) - Math.abs(a[1]);
    return strength !== 0 ? strength : a[0].localeCompare(b[0]);
  });
  return Object.fromEntries(entries.slice(0, NUDGE_LIMITS.maxKeys));
}

/**
 * The user's new nudge map after one "Not for me". Pure: the input map is never mutated. An
 * unchanged map comes back when the reason names nothing about this job.
 */
export function applyPassFeedback(
  nudges: Record<string, number>,
  feedback: PassFeedback,
): Record<string, number> {
  const next = sanitize(nudges);
  for (const key of nudgeKeysFor(feedback)) {
    const delta = clamp(
      (next[key] ?? 0) - NUDGE_LIMITS.step,
      NUDGE_LIMITS.minPerKey,
      NUDGE_LIMITS.maxPerKey,
    );
    if (delta === 0) delete next[key];
    else next[key] = delta;
  }
  return evict(next);
}

export interface AppliedNudge {
  key: string;
  delta: number;
}

export interface NudgeTotal {
  /** Sum of the matching deltas, clamped to `NUDGE_LIMITS.minTotal..maxTotal`. */
  total: number;
  /** Every key that matched this job, so the adjustment is fully explainable. */
  applied: readonly AppliedNudge[];
}

/** What a nudge map does to one job's score, and why. */
export function nudgeForJob(job: NudgeJob, nudges: Record<string, number> = {}): NudgeTotal {
  const clean = sanitize(nudges);
  const applied: AppliedNudge[] = [];
  let sum = 0;
  for (const key of nudgeKeysOfJob(job)) {
    const delta = clean[key];
    if (delta === undefined) continue;
    applied.push({ key, delta });
    sum += delta;
  }
  return { total: clamp(sum, NUDGE_LIMITS.minTotal, NUDGE_LIMITS.maxTotal), applied };
}
