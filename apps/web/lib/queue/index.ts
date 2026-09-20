// Send-only pg-boss client for the web app. It never starts workers, schedules, supervision or
// migrations: the worker owns queue creation (apps/worker/src/cv/queues.ts) and processing.
import { PgBoss } from "pg-boss";
import type { SendOptions } from "pg-boss";

/** Queue names shared with apps/worker/src/cv/queues.ts. */
export const CV_EXTRACT_QUEUE = "cv.extract";
export const CV_PARSE_QUEUE = "cv.parse";

/** Queue name shared with apps/worker/src/match/queues.ts. See `./match.ts` for the only sender. */
export const MATCH_PROFILE_QUEUE = "match.profile";

/**
 * Queue name shared with the worker's tracker module. Sender:
 * `app/api/applications/_lib/sync.ts`.
 *
 * A tracker state change on the web has to reach the Telegram card the worker already sent, or the
 * two ends disagree about whether a job is applied to — the bot writes the same database, so
 * Telegram → web needs nothing, and this is the other direction. The worker reads
 * `delivery_log.provider_message_id` and edits the sent card's markup.
 *
 * **This client does not create the queue.** It runs `createSchema: false` / `migrate: false` and
 * owns no queue's policy (see `createHandle` below); the worker creates every queue at boot, and a
 * queue's options are immutable after creation, so a second creator here would be at best a no-op
 * and at worst a silent policy disagreement. Until the worker registers this name, a send is a
 * no-op against a queue that does not exist — the correct failure, and one that costs the user
 * nothing because `enqueueTrackerSync` never fails the write it follows.
 */
export const TRACKER_SYNC_QUEUE = "tracker.sync";

/** The payload of one `tracker.sync` job. The worker resolves everything else from the match. */
export interface TrackerSyncData {
  matchId: string;
}

type BossHandle = { boss: PgBoss; started: Promise<PgBoss> };

const globalForQueue = globalThis as typeof globalThis & { __pembyQueue?: BossHandle };

function createHandle(): BossHandle {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const boss = new PgBoss({
    connectionString,
    max: 2,
    application_name: "pemby-web-queue",
    supervise: false,
    schedule: false,
    migrate: false,
    createSchema: false,
  });
  boss.on("error", (error: Error) => {
    console.error(`pg-boss (web) error: ${error.name}`);
  });
  const handle: BossHandle = { boss, started: boss.start() };
  // A failed start is not cached: the next send creates a fresh instance.
  handle.started.catch(() => {
    if (globalForQueue.__pembyQueue === handle) globalForQueue.__pembyQueue = undefined;
  });
  return handle;
}

/** One instance per process, kept on globalThis so dev hot reloads reuse it. */
async function getBoss(): Promise<PgBoss> {
  globalForQueue.__pembyQueue ??= createHandle();
  return globalForQueue.__pembyQueue.started;
}

/** Sends one job; returns its id (null when a queue policy refused it). Throws on failure. */
export async function sendJob(
  name: string,
  data: object,
  options: SendOptions = {},
): Promise<string | null> {
  const boss = await getBoss();
  return boss.send(name, data, options);
}
