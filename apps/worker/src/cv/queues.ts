// CV drop queues (phase 06). `cv.extract` and `cv.parse` carry one cv_files id; `cv.cleanup` is a
// cron that removes expired anonymous users with their uploads.
//
// The web app sends `cv.extract` and `cv.parse` through its own send-only client
// (apps/web/lib/queue); the names and data shapes here are the contract between the two.
import type { PgBoss, Queue } from "pg-boss";

export const CV_EXTRACT_QUEUE = "cv.extract";
export const CV_PARSE_QUEUE = "cv.parse";
export const CV_CLEANUP_QUEUE = "cv.cleanup";

/** Every 10 minutes, UTC. */
export const CV_CLEANUP_CRON = "*/10 * * * *";

export interface CvJobData {
  cvId: string;
}

/** Hard ceiling on one extraction (download + parse), enforced inside the handler. */
export const CV_EXTRACT_TIMEOUT_MS = 20_000;

/**
 * Extraction is CPU-bound and deterministic: one retry covers a transient bucket or database error;
 * a hostile file that times out fails the same way again. Expiry is a backstop above the 20 s
 * in-handler timeout.
 */
export const CV_EXTRACT_QUEUE_OPTIONS = {
  policy: "standard",
  retryLimit: 1,
  retryDelay: 5,
  expireInSeconds: 120,
  // Completed and failed jobs are dropped after an hour: a failed job keeps the thrown error in
  // `pgboss.job.output`, and CV jobs must leave as little behind as possible.
  deleteAfterSeconds: 3600,
} satisfies Omit<Queue, "name">;

/**
 * One streamed model call per CV. Standard policy: after the AI cap the job re-sends itself with
 * `startAfter` while the original is still active. Expiry covers a slow stream plus a repair call.
 */
export const CV_PARSE_QUEUE_OPTIONS = {
  policy: "standard",
  retryLimit: 2,
  retryDelay: 10,
  retryBackoff: true,
  expireInSeconds: 10 * 60,
  deleteAfterSeconds: 3600,
} satisfies Omit<Queue, "name">;

export const CV_CLEANUP_QUEUE_OPTIONS = {
  policy: "exclusive",
  retryLimit: 0,
  expireInSeconds: 5 * 60,
  deleteAfterSeconds: 3600,
} satisfies Omit<Queue, "name">;

async function ensureQueue(boss: PgBoss, name: string, options: Omit<Queue, "name">) {
  await boss.createQueue(name, options);
  const { policy: _policy, ...updatable } = options;
  await boss.updateQueue(name, updatable);
}

/** createQueue for the three cv queues; they must exist before send() or schedule(). */
export async function createCvQueues(boss: PgBoss): Promise<void> {
  await ensureQueue(boss, CV_EXTRACT_QUEUE, CV_EXTRACT_QUEUE_OPTIONS);
  await ensureQueue(boss, CV_PARSE_QUEUE, CV_PARSE_QUEUE_OPTIONS);
  await ensureQueue(boss, CV_CLEANUP_QUEUE, CV_CLEANUP_QUEUE_OPTIONS);
}
