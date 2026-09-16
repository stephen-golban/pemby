// Queue names and settings. pg-boss queue names allow only letters, digits, "_", "-", "." and
// "/", so the phase file's `ingest:<source>` is spelled `ingest.<ats>`.
import type { AtsKind } from "@pemby/core/private-config";
import type { PgBoss, Queue } from "pg-boss";

export const INGEST_QUEUE_PREFIX = "ingest.";

/** One queue per ATS kind, so a slow or rate-limited vendor never starves the others. */
export function ingestQueue(ats: AtsKind): string {
  return `${INGEST_QUEUE_PREFIX}${ats}`;
}

export const SCHEDULE_INGEST_QUEUE = "schedule-ingest";
export const VERIFY_LIVE_QUEUE = "verify-live";
export const SYNC_COMPANIES_QUEUE = "sync-companies";
export const SOURCE_HEALTH_QUEUE = "source-health";

export interface IngestJobData {
  companyId: string;
}

/**
 * Board reads. `exclusive` allows one created, retrying or active job per singletonKey (the
 * company id), so schedule-ingest and verify-live never read the same board twice at once.
 * Lever or Greenhouse boards with hundreds of jobs take tens of seconds per request, and
 * SmartRecruiters needs one call per job, so a read may run long: 30 minutes before expiry.
 */
export const INGEST_QUEUE_OPTIONS = {
  policy: "exclusive",
  retryLimit: 3,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 1800,
  expireInSeconds: 30 * 60,
  deleteAfterSeconds: 2 * 24 * 3600,
} satisfies Omit<Queue, "name">;

/** Fan-out and bookkeeping queues: one pending or running job at a time, short expiry. */
export const MAINTENANCE_QUEUE_OPTIONS = {
  policy: "exclusive",
  retryLimit: 2,
  retryDelay: 30,
  retryBackoff: true,
  retryDelayMax: 600,
  expireInSeconds: 15 * 60,
  deleteAfterSeconds: 2 * 24 * 3600,
} satisfies Omit<Queue, "name">;

/**
 * createQueue is `INSERT ... ON CONFLICT DO NOTHING`, so it never changes an existing queue.
 * updateQueue afterwards applies changed retry and expiry settings (policy cannot change).
 */
export async function ensureQueue(
  boss: PgBoss,
  name: string,
  options: typeof INGEST_QUEUE_OPTIONS | typeof MAINTENANCE_QUEUE_OPTIONS,
): Promise<void> {
  await boss.createQueue(name, options);
  const { policy: _policy, ...updatable } = options;
  await boss.updateQueue(name, updatable);
}
