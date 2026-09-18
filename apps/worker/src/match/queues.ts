// Matcher queues. `match.job` carries one job id (fan out over every eligible user), `match.profile`
// one profile id (fan out over the open jobs), and `match.sweep` finds enriched jobs nobody has
// matched yet and enqueues them.
//
// A queue's policy is immutable once the queue exists (`ensureQueue` below re-applies everything
// except `policy`), so each one is chosen here deliberately; changing one later means a new queue
// name. What a policy actually does in pg-boss 12 is create one partial unique index on
// `(name, coalesce(singleton_key, ''))`; `standard` creates none, which is why a `standard` queue
// cannot be de-duplicated by `insert()`'s `ON CONFLICT DO NOTHING` at all.
import type { PgBoss, Queue } from "pg-boss";

export const MATCH_JOB_QUEUE = "match.job";
export const MATCH_PROFILE_QUEUE = "match.profile";
export const MATCH_SWEEP_QUEUE = "match.sweep";

/** Every 10 minutes, UTC. Between the enrich sweep (20 min) and the embed sweep (15 min). */
export const MATCH_SWEEP_CRON = "*/10 * * * *";

export interface MatchJobData {
  jobId: string;
}

export interface MatchProfileData {
  profileId: string;
}

/**
 * One fan-out of one job over every eligible user. No model call ever (PLAN D18), so there is no
 * cap deferral to design around and nothing here re-sends itself.
 *
 * - `exclusive` (unique on the singleton key while created **or** active): the sweep enqueues in
 *   slices with `insert()` and leans on `ON CONFLICT DO NOTHING`, exactly like `ingest/fan-out.ts`.
 *   A second fan-out of a job that is already queued or already running is pure duplicate work —
 *   the running one reads the users as they are now — so dropping it is correct, not a loss.
 * - `retryLimit: 3` with backoff from 30 s: the failures worth retrying are a lost connection or a
 *   lock timeout. A deterministic failure fails the same way and lands in the dead letter.
 * - `expireInSeconds: 15 * 60`: the same ceiling as `enrich.job`. The fan-out is paged, so its
 *   duration grows with the user count; measured at ~4 ms a user, 15 minutes covers ~200k users.
 * - `deleteAfterSeconds: 24 hours`, matching `MATCH_RETRY_AFTER_HOURS` in `sweep.ts`: the sweep
 *   backs off from a job it already tried by looking that row up, so shortening this silently
 *   turns the back-off off. The payload is a public job id and every error the handler throws is
 *   already a sanitized label, so a day of retention leaves nothing personal behind (which is why
 *   `match.profile` below, whose payload names a person, still keeps the cv queues' one hour).
 */
export const MATCH_JOB_QUEUE_OPTIONS = {
  policy: "exclusive",
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  retryDelayMax: 900,
  expireInSeconds: 15 * 60,
  deleteAfterSeconds: 24 * 3600,
} satisfies Omit<Queue, "name">;

/**
 * One user's profile against the open jobs. **Personal data** throughout.
 *
 * - `short`, not `exclusive` (unique on the singleton key only while `created`): a duplicate
 *   request that is still queued is dropped, but an edit made *while* a run is active still
 *   schedules a fresh run, so the last thing the person typed always gets matched. `exclusive`
 *   would swallow that second edit and leave the Brief built from the profile before it.
 * - `retryLimit: 2`, like `cv.parse` and `embed.profile`: fewer chances to keep a personal-data
 *   payload moving through the queue.
 * - `deleteAfterSeconds: 3600`, exactly like the cv queues.
 */
export const MATCH_PROFILE_QUEUE_OPTIONS = {
  policy: "short",
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  expireInSeconds: 10 * 60,
  deleteAfterSeconds: 3600,
} satisfies Omit<Queue, "name">;

/**
 * The sweep is a cron that only selects and enqueues.
 * - `exclusive` with no singleton key: at most one sweep created or active at a time, so a slow
 *   sweep never stacks up behind its own schedule (enrich.sweep and embed.sweep are the same).
 * - `retryLimit: 1`: the next tick is 10 minutes away and selects the same rows.
 */
export const MATCH_SWEEP_QUEUE_OPTIONS = {
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

/** createQueue for the three match queues; they must exist before send(), insert() or schedule(). */
export async function createMatchQueues(boss: PgBoss): Promise<void> {
  await ensureQueue(boss, MATCH_JOB_QUEUE, MATCH_JOB_QUEUE_OPTIONS);
  await ensureQueue(boss, MATCH_PROFILE_QUEUE, MATCH_PROFILE_QUEUE_OPTIONS);
  await ensureQueue(boss, MATCH_SWEEP_QUEUE, MATCH_SWEEP_QUEUE_OPTIONS);
}
