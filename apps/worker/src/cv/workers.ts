// Registers the CV queues' handlers (extract, cleanup, and B2's parse) on one pg-boss instance.
import type { Db } from "@pemby/db";
import type { JobWithMetadata, PgBoss } from "pg-boss";

import { createCvBucket } from "./bucket";
import { runCvCleanup } from "./cleanup";
import { readCvAnonTtlHours, type CvEnv } from "./env";
import { extractCv } from "./extract";
import { failStaleCvParses, startCvParseWorkers } from "./parse";
import { CV_CLEANUP_CRON, CV_CLEANUP_QUEUE, CV_EXTRACT_QUEUE, type CvJobData } from "./queues";

/**
 * A label safe to throw and log: the error's name plus, for a database error, its SQLSTATE. Never
 * the message, which for a driver error quotes the query parameters (the CV text).
 */
export function safeErrorLabel(error: unknown): string {
  const name =
    error instanceof Error
      ? (error.constructor.name ?? error.name)
      : typeof error === "object"
        ? "error"
        : "error";
  // Drizzle wraps a driver error, so the SQLSTATE sits on `cause`.
  const codeOf = (value: unknown): string =>
    value && typeof value === "object" && "code" in value && typeof value.code === "string"
      ? value.code
      : "";
  const code = codeOf(error) || codeOf(error instanceof Error ? error.cause : undefined);
  return /^[A-Za-z0-9_]{1,12}$/.test(code) ? `${name}:${code}` : name;
}

export interface CvWorkerDeps {
  boss: PgBoss;
  db: Db;
  env: CvEnv;
}

/**
 * With the drop disabled (flag off or production) nothing is registered and the cleanup schedule
 * is removed. Queues must already exist (`createCvQueues`).
 */
export async function startCvWorkers(deps: CvWorkerDeps): Promise<void> {
  const { boss, db, env } = deps;
  if (!env.enabled || !env.bucket) {
    await boss.unschedule(CV_CLEANUP_QUEUE);
    return;
  }
  const bucket = createCvBucket(env.bucket);

  await boss.work(
    CV_EXTRACT_QUEUE,
    // One extraction at a time per process: each one forks a child that may use up to 400 MB.
    { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: 1, includeMetadata: true },
    async ([job]: JobWithMetadata<CvJobData>[]) => {
      if (!job) return;
      const { cvId } = job.data;
      try {
        const outcome = await extractCv({ db, boss, bucket }, cvId, {
          lastAttempt: job.retryCount >= job.retryLimit,
          signal: job.signal,
        });
        switch (outcome.kind) {
          case "skipped":
            console.log(`cv.extract cv=${cvId} skipped: ${outcome.reason}`);
            break;
          case "parsing":
            console.log(
              `cv.extract cv=${cvId} status=parsing chars=${outcome.chars} peakRssMb=${outcome.peakRssMb} ms=${outcome.ms}`,
            );
            break;
          case "unreadable":
            console.log(
              `cv.extract cv=${cvId} status=unreadable code=${outcome.code}${outcome.errorName ? ` err=${outcome.errorName}` : ""}${outcome.peakRssMb === undefined ? "" : ` peakRssMb=${outcome.peakRssMb}`} ms=${outcome.ms}`,
            );
            break;
          case "failed":
            console.warn(
              `cv.extract cv=${cvId} status=failed code=${outcome.code} err=${outcome.errorName} ms=${outcome.ms}`,
            );
            break;
        }
      } catch (error) {
        // Never rethrow the original: pg-boss stores a failed job's error in `pgboss.job.output`,
        // and a database driver's message can quote the query parameters, which hold the CV text.
        const label = safeErrorLabel(error);
        console.error(`cv.extract cv=${cvId} error (will retry): ${label}`);
        throw new Error(label);
      }
    },
  );

  await boss.work(CV_CLEANUP_QUEUE, { pollingIntervalSeconds: 30 }, async () => {
    const started = Date.now();
    try {
      const staleParses = await failStaleCvParses(db);
      const r = await runCvCleanup(db, bucket, { ttlHours: readCvAnonTtlHours() });
      console.log(
        `cv.cleanup: staleParses=${staleParses} staleExtracts=${r.staleExtracts} users=${r.users} cvFiles=${r.cvFiles} objects=${r.objects} orphanObjects=${r.orphanObjects} rateLimits=${r.rateLimits} failed=${r.failed} ms=${Date.now() - started}`,
      );
    } catch (error) {
      // Sanitized for the same reason as cv.extract: pg-boss persists the thrown error.
      const label = safeErrorLabel(error);
      console.error(`cv.cleanup error: ${label}`);
      throw new Error(label);
    }
  });
  await boss.schedule(CV_CLEANUP_QUEUE, CV_CLEANUP_CRON, {}, { tz: "UTC" });

  await startCvParseWorkers({ boss, db, env });
}
