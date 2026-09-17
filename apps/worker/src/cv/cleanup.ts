// `cv.cleanup` (phase 06 contract, flow step 9): removes expired anonymous users with their CVs,
// and old rate-limit windows. Logs counts only.
import { schema, type Db } from "@pemby/db";
import { and, eq, sql } from "drizzle-orm";

import type { CvBucket } from "./bucket";

const { cvFiles, user } = schema;

export const CV_CLEANUP_BATCH_SIZE = 50;
/** Upper bound per run; the next run (10 minutes later) continues. */
const MAX_BATCHES_PER_RUN = 20;
const RATE_LIMIT_RETENTION = sql`interval '2 days'`;
/** Objects examined by the orphan sweep per run, and the age below which one is left alone. */
const ORPHAN_SCAN_MAX_OBJECTS = 2_000;
const ORPHAN_MIN_AGE_MINUTES = 60;

export interface CvCleanupOptions {
  ttlHours: number;
  /** Orphaned bucket objects younger than this are left alone (default 60; 0 for proofs). */
  orphanMinAgeMinutes?: number;
  /**
   * Debug scope: only these user ids are candidates, and rate limits are not purged. Used by
   * `cv:dev -- --cleanup-once --user <id>` to prove the job without touching anything else.
   */
  onlyUserIds?: string[];
}

export interface CvCleanupResult {
  users: number;
  cvFiles: number;
  objects: number;
  rateLimits: number;
  /** Bucket objects with no `cv_files` row, deleted by the orphan sweep. */
  orphanObjects: number;
  /** Rows left in `uploaded` or `extracting` for over 10 minutes, marked `failed`. */
  staleExtracts: number;
  failed: number;
}

/**
 * Anonymous users whose newest CV `expires_at` has passed, or, with no CV expiry, whose
 * `created_at + ttlHours` has. Seeded demo users (`demo_` ids) are never candidates.
 */
function expiredAnonymousUsers(
  ttlHours: number,
  scope: { onlyUserIds?: string[]; exclude: string[]; limit: number },
) {
  return sql`
    select u.id
      from "user" u
      left join cv_files c on c.user_id = u.id
     where u.is_anonymous = true
       and u.id not like 'demo\\_%'
       ${scope.onlyUserIds ? sql`and u.id in ${scope.onlyUserIds}` : sql``}
       ${scope.exclude.length > 0 ? sql`and u.id not in ${scope.exclude}` : sql``}
     group by u.id, u.created_at
    having coalesce(max(c.expires_at), u.created_at + make_interval(hours => ${ttlHours})) < now()
     order by u.created_at
     limit ${scope.limit}`;
}

type UserOutcome = { deleted: false } | { deleted: true; cvFiles: number; objects: number };

async function deleteExpiredUser(
  db: Db,
  bucket: CvBucket,
  userId: string,
  ttlHours: number,
): Promise<UserOutcome> {
  return db.transaction(async (tx) => {
    // Lock the user, then its CV rows, so an upload or a claim waits for this transaction.
    const locked = await tx
      .select({ id: user.id })
      .from(user)
      .where(and(eq(user.id, userId), eq(user.isAnonymous, true)))
      .for("update");
    if (locked.length === 0) return { deleted: false };
    const rows = await tx
      .select({ id: cvFiles.id, bucketKey: cvFiles.bucketKey })
      .from(cvFiles)
      .where(eq(cvFiles.userId, userId))
      .for("update");
    // Re-check under the lock: a new upload since selection moves the expiry forward.
    const still = await tx.execute<{ id: string }>(
      expiredAnonymousUsers(ttlHours, { onlyUserIds: [userId], exclude: [], limit: 1 }),
    );
    if (still.rows.length === 0) return { deleted: false };

    let objects = 0;
    for (const row of rows) {
      if (!row.bucketKey) continue;
      await bucket.delete(row.bucketKey);
      objects += 1;
    }
    if (rows.length > 0) await tx.delete(cvFiles).where(eq(cvFiles.userId, userId));
    // Cascades sessions, accounts, profiles and pending claims.
    await tx.delete(user).where(eq(user.id, userId));
    return { deleted: true, cvFiles: rows.length, objects };
  });
}

/**
 * Deletes bucket objects under `cv/` that no `cv_files` row points at: a crash between the upload
 * and the insert, or a delete that failed earlier, leaves personal data behind with nothing to
 * expire it. Only objects older than `minAgeMinutes` are considered, so an upload in flight is
 * never touched. Scoped mode looks under `cv/<userId>/` only.
 */
async function sweepOrphanObjects(
  db: Db,
  bucket: CvBucket,
  minAgeMinutes: number,
  onlyUserIds?: string[],
): Promise<{ deleted: number; failed: number; errorNames: string[] }> {
  const prefixes = onlyUserIds ? onlyUserIds.map((id) => `cv/${id}/`) : ["cv/"];
  const cutoff = Date.now() - minAgeMinutes * 60_000;
  let deleted = 0;
  let failed = 0;
  const errorNames = new Set<string>();
  let scanned = 0;

  for (const prefix of prefixes) {
    let token: string | undefined;
    do {
      const page = await bucket.list(prefix, { continuationToken: token, limit: 1000 });
      token = page.nextToken;
      scanned += page.objects.length;
      const candidates = page.objects.filter(
        (o) => o.lastModified !== null && o.lastModified.getTime() < cutoff,
      );
      if (candidates.length > 0) {
        const keys = candidates.map((o) => o.key);
        const known = await db.execute<{ bucket_key: string }>(
          sql`select bucket_key from cv_files where bucket_key in ${keys}`,
        );
        const live = new Set(known.rows.map((r) => r.bucket_key));
        for (const key of keys) {
          if (live.has(key)) continue;
          try {
            await bucket.delete(key);
            deleted += 1;
          } catch (error) {
            failed += 1;
            errorNames.add(error instanceof Error ? error.name : "error");
          }
        }
      }
    } while (token && scanned < ORPHAN_SCAN_MAX_OBJECTS);
  }
  return { deleted, failed, errorNames: [...errorNames] };
}

export async function runCvCleanup(
  db: Db,
  bucket: CvBucket,
  options: CvCleanupOptions,
): Promise<CvCleanupResult> {
  const result: CvCleanupResult = {
    users: 0,
    cvFiles: 0,
    objects: 0,
    rateLimits: 0,
    orphanObjects: 0,
    staleExtracts: 0,
    failed: 0,
  };
  const failedIds: string[] = [];
  const errorNames = new Set<string>();

  for (let batch = 0; batch < MAX_BATCHES_PER_RUN; batch++) {
    const selected = await db.execute<{ id: string }>(
      expiredAnonymousUsers(options.ttlHours, {
        onlyUserIds: options.onlyUserIds,
        exclude: failedIds,
        limit: CV_CLEANUP_BATCH_SIZE,
      }),
    );
    for (const { id } of selected.rows) {
      try {
        const outcome = await deleteExpiredUser(db, bucket, id, options.ttlHours);
        if (!outcome.deleted) {
          failedIds.push(id); // Not expired any more or gone: do not select it again this run.
          continue;
        }
        result.users += 1;
        result.cvFiles += outcome.cvFiles;
        result.objects += outcome.objects;
      } catch (error) {
        failedIds.push(id);
        result.failed += 1;
        errorNames.add(error instanceof Error ? error.name : "error");
      }
    }
    if (selected.rows.length < CV_CLEANUP_BATCH_SIZE) break;
  }

  try {
    const orphans = await sweepOrphanObjects(
      db,
      bucket,
      options.orphanMinAgeMinutes ?? ORPHAN_MIN_AGE_MINUTES,
      options.onlyUserIds,
    );
    result.orphanObjects = orphans.deleted;
    result.failed += orphans.failed;
    for (const name of orphans.errorNames) errorNames.add(name);
  } catch (error) {
    result.failed += 1;
    errorNames.add(error instanceof Error ? error.name : "error");
  }

  if (!options.onlyUserIds) {
    const purged = await db.execute(
      sql`delete from rate_limits where window_start < now() - ${RATE_LIMIT_RETENTION}`,
    );
    result.rateLimits = purged.rowCount ?? 0;
    // A worker that died mid-extraction (or never picked the job up) leaves the browser polling.
    const stale = await db.execute(sql`
      update cv_files set parse_status = 'failed', error_code = 'extract_timeout', updated_at = now()
       where parse_status in ('uploaded', 'extracting')
         and updated_at < now() - interval '10 minutes'`);
    result.staleExtracts = stale.rowCount ?? 0;
  }

  if (errorNames.size > 0) {
    console.warn(
      `cv.cleanup: ${result.failed} user(s) not deleted, errors=${[...errorNames].join(",")}`,
    );
  }
  return result;
}
