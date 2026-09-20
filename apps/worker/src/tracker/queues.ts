// The tracker-sync queue. **`apps/web` sends; this process creates the queue and drains it.**
//
// The web app's pg-boss client runs with `createSchema: false` and `migrate: false` (see
// `apps/web/lib/queue/index.ts`), so it can send and cannot create. That is deliberate: a web
// process that can create queues can create a queue whose policy nobody chose. The consequence is
// that the queue must exist before the first send, and the send is a no-op against a missing queue
// until it does — which is the right failure while the two orders are in flight, and the reason
// `createTrackerQueues` is called near the top of `apps/worker/src/index.ts` rather than beside the
// handler that drains it.
import type { PgBoss, Queue } from "pg-boss";

export const TRACKER_SYNC_QUEUE = "tracker.sync";

export interface TrackerSyncData {
  matchId: string;
}

/**
 * One card edit per match.
 *
 * - `exclusive`, keyed on the match id. Someone dragging a card across three columns in five
 *   seconds produces three sends; only the first is queued and the rest collapse into it, and the
 *   handler reads the state as it stands when it runs. Under `standard` all three would run and the
 *   card would be edited three times, the last edit winning by luck of scheduling. The state is
 *   read at run time, never carried in the payload, precisely so that collapsing is safe.
 * - `retryLimit: 3` with backoff from 30 s: a Telegram 5xx or a timeout is worth another go. The
 *   two permanent answers — the message is too old to edit, or nothing changed — are not thrown.
 * - `expireInSeconds: 2 * 60`: one `editMessageReplyMarkup` call and two small reads.
 * - `deleteAfterSeconds: 3600`, like the cv and embed.profile queues: the payload names a match,
 *   which is personal (it says a specific person was shown a specific job). A completed row has no
 *   reason to sit in `pgboss.job` for days.
 */
export const TRACKER_SYNC_QUEUE_OPTIONS = {
  policy: "exclusive",
  retryLimit: 3,
  retryDelay: 30,
  retryBackoff: true,
  retryDelayMax: 600,
  expireInSeconds: 2 * 60,
  deleteAfterSeconds: 3600,
} satisfies Omit<Queue, "name">;

async function ensureQueue(boss: PgBoss, name: string, options: Omit<Queue, "name">) {
  await boss.createQueue(name, options);
  const { policy: _policy, ...updatable } = options;
  await boss.updateQueue(name, updatable);
}

/** createQueue for `tracker.sync`. Must run before any sender starts. */
export async function createTrackerQueues(boss: PgBoss): Promise<void> {
  await ensureQueue(boss, TRACKER_SYNC_QUEUE, TRACKER_SYNC_QUEUE_OPTIONS);
}
