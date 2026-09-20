// Flag-rule queues. `flags.sweep` re-weighs the open backlog, claims flags and enqueues them;
// `flags.process` runs PLAN section 6's rule for exactly one flag.
//
// A queue's policy is immutable once the queue exists (`ensureQueue` below drops `policy` before
// `updateQueue`, exactly as every other module does), so each one is picked here deliberately and
// changing it later means a new queue name, not an edited constant.
import type { PgBoss, Queue } from "pg-boss";

export const FLAG_SWEEP_QUEUE = "flags.sweep";
export const FLAG_PROCESS_QUEUE = "flags.process";

/** Every 5 minutes, UTC. A report is a person waiting; a 20-minute sweep would read as broken. */
export const FLAG_SWEEP_CRON = "*/5 * * * *";

export interface FlagProcessData {
  flagId: string;
}

/**
 * One rule run for one flag.
 *
 * - `exclusive`, keyed on the flag id: at most one created, retrying or active job per flag, so a
 *   sweep that runs while the previous batch is still draining cannot enqueue the same flag twice.
 *   This is the **second** of three guards, and it is the weakest one — it is deliberately not
 *   relied on. The database claim (`claimFlagsToProcess`, `for update of c skip locked`) is what
 *   actually partitions the set between processes, and `recordFlagOutcome`'s own race is what stops
 *   a second verdict being written if both somehow ran — for an automation caller its legal
 *   starting states are exactly `['open']`, so the loser's update matches nothing.
 *   `exclusive` is affordable here because nothing in this module re-sends a flag while its job is
 *   still active — which is exactly the reason `enrich.job` and `embed.job` had to be `standard`.
 * - `retryLimit: 3` with backoff from 60 s: the failures worth retrying are a board read timing
 *   out, a provider hiccup, a dropped connection. A rule that decides "I cannot tell" does not
 *   throw; it writes `needs_review` and stops.
 * - `expireInSeconds: 15 * 60`: a `closed_or_fake` flag makes a full ATS board read, which on a
 *   large Lever or Greenhouse board is tens of seconds and on a paginated one can be minutes. Kept
 *   under `FLAGS_CLAIM_STALE_MINUTES`, whose default is 30, so expiry always fires first.
 * - `deleteAfterSeconds: 3 days`: the payload is one flag id and nothing else. The flag row itself
 *   is the durable record.
 */
export const FLAG_PROCESS_QUEUE_OPTIONS = {
  policy: "exclusive",
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 900,
  expireInSeconds: 15 * 60,
  deleteAfterSeconds: 3 * 24 * 3600,
} satisfies Omit<Queue, "name">;

/**
 * The sweep: re-weigh, claim, enqueue. `exclusive` so a slow sweep never stacks up behind its own
 * 5-minute schedule, and `retryLimit: 1` because the next tick claims the same rows anyway.
 */
export const FLAG_SWEEP_QUEUE_OPTIONS = {
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

/** createQueue for both flag queues; they must exist before send() or schedule(). */
export async function createFlagQueues(boss: PgBoss): Promise<void> {
  await ensureQueue(boss, FLAG_PROCESS_QUEUE, FLAG_PROCESS_QUEUE_OPTIONS);
  await ensureQueue(boss, FLAG_SWEEP_QUEUE, FLAG_SWEEP_QUEUE_OPTIONS);
}
