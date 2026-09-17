// Enrichment queues. `enrich.job` carries one job id; `enrich.sweep` finds jobs to enqueue.
import type { PgBoss, Queue } from "pg-boss";

export const ENRICH_JOB_QUEUE = "enrich.job";
export const ENRICH_SWEEP_QUEUE = "enrich.sweep";

/** Every 20 minutes, UTC. */
export const ENRICH_SWEEP_CRON = "*/20 * * * *";

export interface EnrichJobData {
  jobId: string;
}

/**
 * One model call chain per job. Standard policy: a job rescheduled after the daily cap is sent
 * while the original is still active, which an exclusive policy would refuse. The sweep avoids
 * duplicates itself (it skips job ids with a queued, active or recently failed `enrich.job`).
 * Expiry covers two models with a repair retry each at up to 180 s per request.
 */
export const ENRICH_JOB_QUEUE_OPTIONS = {
  policy: "standard",
  retryLimit: 3,
  retryDelay: 120,
  retryBackoff: true,
  retryDelayMax: 3600,
  expireInSeconds: 15 * 60,
  deleteAfterSeconds: 3 * 24 * 3600,
} satisfies Omit<Queue, "name">;

export const ENRICH_SWEEP_QUEUE_OPTIONS = {
  policy: "exclusive",
  retryLimit: 1,
  retryDelay: 60,
  expireInSeconds: 5 * 60,
  deleteAfterSeconds: 2 * 24 * 3600,
} satisfies Omit<Queue, "name">;

async function ensureQueue(boss: PgBoss, name: string, options: Omit<Queue, "name">) {
  await boss.createQueue(name, options);
  const { policy: _policy, ...updatable } = options;
  await boss.updateQueue(name, updatable);
}

/** createQueue for both queues; they must exist before send() or schedule(). */
export async function createEnrichQueues(boss: PgBoss): Promise<void> {
  await ensureQueue(boss, ENRICH_JOB_QUEUE, ENRICH_JOB_QUEUE_OPTIONS);
  await ensureQueue(boss, ENRICH_SWEEP_QUEUE, ENRICH_SWEEP_QUEUE_OPTIONS);
}
