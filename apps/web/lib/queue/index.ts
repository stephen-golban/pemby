// Send-only pg-boss client for the web app. It never starts workers, schedules, supervision or
// migrations: the worker owns queue creation (apps/worker/src/cv/queues.ts) and processing.
import { PgBoss } from "pg-boss";
import type { SendOptions } from "pg-boss";

/** Queue names shared with apps/worker/src/cv/queues.ts. */
export const CV_EXTRACT_QUEUE = "cv.extract";
export const CV_PARSE_QUEUE = "cv.parse";

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
