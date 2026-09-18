// Embedding queues. `embed.job` carries one job id, `embed.profile` one profile id, and
// `embed.sweep` finds both and enqueues them.
//
// A queue's policy is immutable once the queue exists (`ensureQueue` below re-applies everything
// except `policy`), so each one is picked here deliberately and changing it later means a new queue
// name and a migration of the pending jobs.
import type { PgBoss, Queue } from "pg-boss";

export const EMBED_JOB_QUEUE = "embed.job";
export const EMBED_PROFILE_QUEUE = "embed.profile";
export const EMBED_SWEEP_QUEUE = "embed.sweep";

/** Every 15 minutes, UTC. */
export const EMBED_SWEEP_CRON = "*/15 * * * *";

export interface EmbedJobData {
  jobId: string;
}

export interface EmbedProfileData {
  profileId: string;
}

/**
 * One embedding request per job posting.
 *
 * - `standard`, not `exclusive` or `singleton`: after the daily cap (or the embed sub-budget) the
 *   handler re-sends the job with `startAfter` and the same `singletonKey` while the original is
 *   still active, which an exclusive policy would refuse. The sweep does its own de-duplication by
 *   reading `pgboss.job` for the same singleton key.
 * - `retryLimit: 3` with backoff from 60 s: the failures worth retrying are transient (HTTP 5xx,
 *   a provider timeout, a dropped connection); a post that produces the same text fails the same
 *   way and is caught by the content-hash skip instead.
 * - `expireInSeconds: 5 * 60`: one request with a 60 s timeout plus the database work, with room
 *   for a slow provider. Well above the handler's own ceiling, so expiry is a backstop.
 * - `deleteAfterSeconds: 3 days`, like enrich.job: job post text is public, so a completed or
 *   failed row can stay around as long as the enrichment ones do.
 */
export const EMBED_JOB_QUEUE_OPTIONS = {
  policy: "standard",
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 3600,
  expireInSeconds: 5 * 60,
  deleteAfterSeconds: 3 * 24 * 3600,
} satisfies Omit<Queue, "name">;

/**
 * One embedding request per profile. **Personal data**: the values are CV-derived.
 *
 * Same `standard` policy and reasoning as `embed.job`, with two differences:
 * - `retryLimit: 2`, like `cv.parse`: fewer chances to keep a personal-data payload moving.
 * - `deleteAfterSeconds: 3600`, exactly like the cv queues. A failed job keeps whatever the handler
 *   threw in `pgboss.job.output`, so the handler throws a sanitized label and the row is dropped
 *   after an hour anyway.
 */
export const EMBED_PROFILE_QUEUE_OPTIONS = {
  policy: "standard",
  retryLimit: 2,
  retryDelay: 60,
  retryBackoff: true,
  expireInSeconds: 5 * 60,
  deleteAfterSeconds: 3600,
} satisfies Omit<Queue, "name">;

/**
 * The sweep is a cron that only selects and enqueues.
 * - `exclusive`: at most one sweep queued at a time, so a slow sweep never stacks up behind its own
 *   schedule (the enrich sweep is set up the same way).
 * - `retryLimit: 1`: the next cron tick is 15 minutes away and selects the same rows.
 */
export const EMBED_SWEEP_QUEUE_OPTIONS = {
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

/** createQueue for the three embed queues; they must exist before send() or schedule(). */
export async function createEmbedQueues(boss: PgBoss): Promise<void> {
  await ensureQueue(boss, EMBED_JOB_QUEUE, EMBED_JOB_QUEUE_OPTIONS);
  await ensureQueue(boss, EMBED_PROFILE_QUEUE, EMBED_PROFILE_QUEUE_OPTIONS);
  await ensureQueue(boss, EMBED_SWEEP_QUEUE, EMBED_SWEEP_QUEUE_OPTIONS);
}
