// Registers the match sweep and the two match handlers on one pg-boss instance.
//
// Three `boss.work` calls. No `@pemby/ai` anywhere in this module: matching never calls a model
// (PLAN D18), so there is no ledger, no cap guard and no daily-cap deferral to handle.
import { loadScoringWeights } from "@pemby/core/private-config";
import type { Db } from "@pemby/db";
import type { PgBoss } from "pg-boss";

import { safeErrorLabel } from "../cv/workers";
import type { MatchEnv } from "./env";
import { formatMatchJob, matchOneJob } from "./match-job";
import { formatMatchProfile, matchOneProfile } from "./match-profile";
import {
  MATCH_JOB_QUEUE,
  MATCH_PROFILE_QUEUE,
  MATCH_SWEEP_CRON,
  MATCH_SWEEP_QUEUE,
  type MatchJobData,
  type MatchProfileData,
} from "./queues";
import { sweepMatch } from "./sweep";

export interface MatchWorkerDeps {
  boss: PgBoss;
  db: Db;
  env: MatchEnv;
}

/** Registers the sweep cron when MATCH_ENABLED, and removes it otherwise (as enrich does). */
export async function scheduleMatchSweep(boss: PgBoss, env: MatchEnv): Promise<void> {
  if (!env.enabled) {
    await boss.unschedule(MATCH_SWEEP_QUEUE);
    return;
  }
  await boss.schedule(MATCH_SWEEP_QUEUE, MATCH_SWEEP_CRON, {}, { tz: "UTC" });
}

/**
 * A label safe to log and safe to throw.
 *
 * Both handlers read profiles, and a driver error's message quotes its query parameters — which
 * here are profile fields. `safeErrorLabel` (from the CV drop, which had the same problem first)
 * reduces an error to its constructor name plus a SQLSTATE, and nothing else.
 */
export function describeMatchError(error: unknown): string {
  return `status=${safeErrorLabel(error)}`;
}

export async function startMatchWorkers(deps: MatchWorkerDeps): Promise<void> {
  const { boss, db, env } = deps;

  await boss.work(MATCH_SWEEP_QUEUE, { pollingIntervalSeconds: 30 }, async () => {
    const r = await sweepMatch(boss, db, env.sweepLimit);
    console.log(`match.sweep: selected=${r.selected} enqueued=${r.enqueued}`);
  });

  await boss.work<MatchJobData>(
    MATCH_JOB_QUEUE,
    { batchSize: 1, localConcurrency: env.concurrency, pollingIntervalSeconds: 10 },
    async ([job]) => {
      if (!job) return;
      const { jobId } = job.data;
      try {
        // Loaded per run, not per page: the private-config loader caches, so this is one read.
        const weights = await loadScoringWeights();
        console.log(formatMatchJob(jobId, await matchOneJob({ db, weights }, jobId)));
      } catch (error) {
        // Never rethrow the original: pg-boss stores a failed job's error in `pgboss.job.output`.
        const label = safeErrorLabel(error);
        if (!job.signal.aborted) console.error(`match.job job=${jobId} failed: ${label}`);
        throw new Error(label);
      }
    },
  );

  await boss.work<MatchProfileData>(
    MATCH_PROFILE_QUEUE,
    // One at a time: personal data, and there are never many profile changes waiting at once.
    { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: 10 },
    async ([job]) => {
      if (!job) return;
      const { profileId } = job.data;
      try {
        const weights = await loadScoringWeights();
        const outcome = await matchOneProfile(
          { db, weights, jobLimit: env.profileJobLimit },
          { profileId },
        );
        console.log(formatMatchProfile(profileId, outcome));
      } catch (error) {
        const label = safeErrorLabel(error);
        if (!job.signal.aborted)
          console.error(`match.profile profile=${profileId} failed: ${label}`);
        throw new Error(label);
      }
    },
  );
}
