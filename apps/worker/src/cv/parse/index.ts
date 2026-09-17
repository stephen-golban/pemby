// `cv.parse` handler (phase 06 contract, flow step 5).
//
// Retry policy, on top of CV_PARSE_QUEUE_OPTIONS (retryLimit 2, backoff from 10 s):
// - AiOutputInvalidError: no retry. The streamed request already fell back to the non-streaming
//   chain with one repair call; the same text and prompt fail the same way. Row -> `failed`.
// - AiCallError (every model failed: network, HTTP, timeout): one queue retry. On the retry the
//   row is marked `failed` instead of throwing again.
// - DailyCapReachedError: nothing was sent. Row -> `queued` with `queued_until`, owner alerted once
//   per UTC day, and a new `cv.parse` sent with `startAfter` at 00:00 UTC (singletonKey = cv id).
// - The sub-budget `CV_PARSE_DAILY_BUDGET_USD` (default $1/day of the global cap) is treated exactly
//   like the cap: anonymous uploads must not be able to spend the whole day's AI budget.
// - Anything else (database, abort on expiry, prompt missing): thrown for the queue's retries; on
//   the last allowed attempt the row is marked `failed` first (`parse_timeout` when the job's signal
//   was aborted, else `parse_failed`) so the browser stops polling. Rows a dead worker left in
//   `parsing` are failed by `failStaleCvParses`, which the cv.cleanup cron calls.
import { createDailyCapGuard } from "@pemby/ai";
import { createAiUsageLedger, type Db } from "@pemby/db";
import type { JobWithMetadata, PgBoss } from "pg-boss";

import { alertCapReached } from "../../enrich/workers";
import type { CvEnv } from "../env";
import { CV_PARSE_QUEUE, type CvJobData } from "../queues";
import {
  CV_PARSE_TIMEOUT_CODE,
  failStaleCvParses as failStale,
  markCvParseFailed,
  parseCv,
  type CvParseMetrics,
} from "./parse-cv";

export {
  parseCv,
  readCvParseBudgetUsd,
  sanitizeParsedProfile,
  type CvParseOutcome,
} from "./parse-cv";

/**
 * Marks `parsing` rows older than `olderThanMinutes` (default 10) as `failed` with
 * `error_code = 'parse_timeout'`. Called by the cv.cleanup cron. Logs the count only.
 */
export async function failStaleCvParses(
  db: Db,
  opts?: { olderThanMinutes?: number },
): Promise<number> {
  const count = await failStale(db, opts);
  console.log(`cv.parse stale: failed=${count}`);
  return count;
}

/** Queue retries allowed for an AiCallError (network, HTTP, timeout). */
const AI_CALL_RETRIES = 1;

function formatMetrics(m: CvParseMetrics): string {
  return [
    `ms=${m.ms}`,
    `firstPartialMs=${m.firstPartialMs ?? "-"}`,
    `partialWrites=${m.partialWrites}`,
    `streamed=${m.streamed ?? "-"}`,
    `cost=${m.costUsd === null ? "-" : m.costUsd.toFixed(6)}`,
  ].join(" ");
}

export async function startCvParseWorkers(deps: {
  boss: PgBoss;
  db: Db;
  env: CvEnv;
}): Promise<void> {
  const { boss, db, env } = deps;
  if (!env.enabled) return;
  const ledger = createAiUsageLedger(db);
  const capGuard = createDailyCapGuard({ ledger });

  await boss.work(
    CV_PARSE_QUEUE,
    { batchSize: 1, localConcurrency: 2, pollingIntervalSeconds: 2, includeMetadata: true },
    async ([job]: JobWithMetadata<CvJobData>[]) => {
      if (!job) return;
      const { cvId } = job.data;
      const lastAttempt = job.retryCount >= job.retryLimit;
      try {
        const outcome = await parseCv({ db, ledger, capGuard }, cvId, {
          signal: job.signal,
          mayRetry: job.retryCount < Math.min(AI_CALL_RETRIES, job.retryLimit),
        });
        switch (outcome.kind) {
          case "skipped":
            console.log(`cv.parse cv=${cvId} skipped: ${outcome.reason}`);
            return;
          case "parsed":
            console.log(
              `cv.parse cv=${cvId} status=${outcome.written ? "parsed" : "not-written"} ${formatMetrics(outcome.metrics)} profileFilled=${outcome.profileFilled.length}`,
            );
            return;
          case "failed":
            console.warn(
              `cv.parse cv=${cvId} status=failed error=${outcome.reason} ${formatMetrics(outcome.metrics)}`,
            );
            return;
          case "queued": {
            const { error } = outcome;
            const alert = await alertCapReached(db, error, error.day);
            await boss.send(CV_PARSE_QUEUE, { cvId } satisfies CvJobData, {
              startAfter: error.retryAt,
              singletonKey: cvId,
            });
            console.warn(
              `cv.parse cv=${cvId} status=queued retryAt=${error.retryAt.toISOString()}${alert.claimed ? ` alert=${alert.deliveredVia}` : ""}`,
            );
            return;
          }
          case "retry":
            throw outcome.error;
        }
      } catch (error) {
        // Never rethrow the original: a driver error's message quotes its parameters (the parsed
        // profile), and pg-boss serializes what the handler throws into pgboss.job.output for days.
        const name = error instanceof Error ? error.name : "error";
        if (lastAttempt) {
          // Expiry aborts job.signal; failStaleCvParses covers a worker that died instead.
          const code = job.signal.aborted ? CV_PARSE_TIMEOUT_CODE : undefined;
          await markCvParseFailed(db, cvId, code).catch(() => undefined);
          console.error(
            `cv.parse cv=${cvId} status=failed error=${name}${code ? ` code=${code}` : ""} attempts exhausted`,
          );
          throw new Error(code ?? name);
        }
        if (!job.signal.aborted) {
          console.warn(`cv.parse cv=${cvId} retrying error=${name} retry=${job.retryCount}`);
        }
        throw new Error(name);
      }
    },
  );
}
