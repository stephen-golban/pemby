// Dispatcher queues. `deliver.sweep` is a cron that releases stale claims and then asks each live
// channel to drain; `deliver.channel` is one drain of one channel type.
//
// A queue's policy is immutable once the queue exists (`ensureQueue` below re-applies everything
// except `policy`), so each one is chosen here deliberately; changing one later means a new queue
// name. What a policy actually does in pg-boss 12 is create one partial unique index on
// `(name, coalesce(singleton_key, ''))`; `standard` creates none.
import type { PgBoss, Queue } from "pg-boss";
import type { ChannelType } from "@pemby/db";

export const DELIVER_SWEEP_QUEUE = "deliver.sweep";
export const DELIVER_CHANNEL_QUEUE = "deliver.channel";

/**
 * Every minute, UTC — the tightest cron pg-boss offers, and therefore the delivery latency floor.
 *
 * PLAN section 4 wants a pass holder's match "the moment it is created". The honest number is
 * "within a minute of the matcher committing the row, plus the drain's own time": nothing here
 * watches for a new match, and the matcher (which this order does not own) does not enqueue a
 * delivery. A push from `match.job` would cut that to seconds and is the obvious next move.
 */
export const DELIVER_SWEEP_CRON = "* * * * *";

export interface DeliverChannelData {
  channelType: ChannelType;
}

/**
 * The sweep: releases claims a crashed dispatcher left behind, then enqueues one drain per channel.
 * It never touches a provider itself.
 *
 * - `exclusive` with no singleton key: at most one sweep created or active at a time, so a slow
 *   sweep does not stack up behind its own schedule (enrich.sweep, embed.sweep and match.sweep are
 *   all the same shape).
 * - `retryLimit: 1`: the next tick is sixty seconds away and does the same thing.
 * - `expireInSeconds: 60`: it does two statements and three sends; a minute is already generous,
 *   and expiring inside its own period is what keeps one stuck sweep from blocking the next.
 * - `deleteAfterSeconds: 6 hours`: a once-a-minute cron writes 1,440 rows a day, and nothing reads
 *   them back (unlike `match.job`, whose rows are the matcher's own back-off record).
 */
export const DELIVER_SWEEP_QUEUE_OPTIONS = {
  policy: "exclusive",
  retryLimit: 1,
  retryDelay: 60,
  expireInSeconds: 60,
  deleteAfterSeconds: 6 * 3600,
} satisfies Omit<Queue, "name">;

/**
 * One drain of one channel type. The payload is a channel *type* — "telegram" — and never an
 * address, a chat id or a user id, so nothing personal reaches `pgboss.job.data`.
 *
 * - `exclusive` with `singletonKey` = the channel type: one drain per channel created **or**
 *   active. That is what stops the next minute's sweep from starting a second Telegram drain beside
 *   a slow one, and it is why the three channels never wait on each other. It is a scheduling
 *   convenience only — correctness under concurrent dispatchers (two processes, two containers
 *   mid-deploy) rests on `claimDelivery`, not on this.
 * - `retryLimit: 1` with a 60 s delay: a drain that failed has left every match it did not reach
 *   exactly where it found it, and the next minute's sweep selects the same rows. Retrying harder
 *   would only mean two drains of the same channel racing for the same claims.
 * - `expireInSeconds: 600`: comfortably beyond `DRAIN_BUDGET_MS` in `dispatch.ts` (4 minutes), which
 *   is what actually ends a drain. The gap is deliberate — pg-boss expiry does not stop a running
 *   handler, it only frees the queue, so an expiry that could fire during a normal drain would let
 *   a second drain start beside the first.
 * - `deleteAfterSeconds: 6 hours`: same reasoning as the sweep.
 */
export const DELIVER_CHANNEL_QUEUE_OPTIONS = {
  policy: "exclusive",
  retryLimit: 1,
  retryDelay: 60,
  expireInSeconds: 600,
  deleteAfterSeconds: 6 * 3600,
} satisfies Omit<Queue, "name">;

async function ensureQueue(boss: PgBoss, name: string, options: Omit<Queue, "name">) {
  await boss.createQueue(name, options);
  const { policy: _policy, ...updatable } = options;
  await boss.updateQueue(name, updatable);
}

/** createQueue for the two deliver queues; they must exist before send(), insert() or schedule(). */
export async function createDeliverQueues(boss: PgBoss): Promise<void> {
  await ensureQueue(boss, DELIVER_SWEEP_QUEUE, DELIVER_SWEEP_QUEUE_OPTIONS);
  await ensureQueue(boss, DELIVER_CHANNEL_QUEUE, DELIVER_CHANNEL_QUEUE_OPTIONS);
}
