// Registers the enrichment sweep and the enrich.job handler on one pg-boss instance.
import {
  AiCallError,
  AiOutputInvalidError,
  AiPromptMissingError,
  DailyCapReachedError,
  alertOwnerCapReached,
  createDailyCapGuard,
  loadPrompt,
  type CapAlertResult,
  type CostLedger,
  type DailyCapGuard,
} from "@pemby/ai";
import {
  claimCapAlert,
  createAiUsageLedger,
  markCapAlertDelivered,
  schema,
  type Db,
} from "@pemby/db";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";

import {
  computeEnrichment,
  countEnrichedJobs,
  sampleSlotAvailable,
  writeEnrichment,
} from "./enrich-job";
import type { EnrichEnv } from "./env";
import {
  ENRICH_JOB_QUEUE,
  ENRICH_SWEEP_CRON,
  ENRICH_SWEEP_QUEUE,
  type EnrichJobData,
} from "./queues";

const { jobEnrichment, jobs } = schema;

export interface EnrichWorkerDeps {
  boss: PgBoss;
  db: Db;
  env: EnrichEnv;
  /** Defaults to the Postgres ledger and a guard reading AI_DAILY_CAP_USD. */
  ledger?: CostLedger;
  capGuard?: DailyCapGuard;
}

/** Registers the sweep cron when ENRICH_ENABLED, and removes it otherwise. */
export async function scheduleEnrichSweep(boss: PgBoss, env: EnrichEnv): Promise<void> {
  if (!env.enabled) {
    await boss.unschedule(ENRICH_SWEEP_QUEUE);
    return;
  }
  await boss.schedule(ENRICH_SWEEP_QUEUE, ENRICH_SWEEP_CRON, {}, { tz: "UTC" });
}

/** Error description safe to log: task, model, status, never request or response content. */
export function describeEnrichError(error: unknown): string {
  if (error instanceof AiCallError) {
    return `task=${error.task} model=${error.model} status=${error.status ?? "-"} type=${error.errorType ?? "-"}`;
  }
  if (error instanceof AiOutputInvalidError) {
    // Issue paths only ("eligibility.0.detail"); never zod messages, which can quote output.
    return `task=${error.task} model=${error.model} status=invalid-output issues=${error.issueCount} paths=${error.issuePaths.join(",") || "-"}`;
  }
  if (error instanceof AiPromptMissingError) return `task=${error.task} status=prompt-missing`;
  return `status=${error instanceof Error ? error.name : "error"}`;
}

/** Alerts the owner that the daily cap is reached: once per UTC day, marked when delivered. */
export function alertCapReached(
  db: Db,
  status: { spentUsd: number; capUsd: number },
  day: Date | string = new Date(),
): Promise<CapAlertResult> {
  return alertOwnerCapReached({
    day,
    spentUsd: status.spentUsd,
    capUsd: status.capUsd,
    claim: (c) => claimCapAlert(db, c),
    markDelivered: (d) => markCapAlertDelivered(db, d),
  });
}

/**
 * Open, non-demo, canonical jobs with no enrichment or a changed content hash, newest first. Skips:
 * - job ids that already have an `enrich.job` queued, active, retrying, or failed in the last 24
 *   hours (reads pg-boss's `pgboss.job` table); `skipQueued: false` drops that check (scripts
 *   running without pg-boss);
 * - job ids whose last 2 `job-enrichment` rows in `ai_usage` for `promptVersion` are both
 *   `invalid` and the older is under 7 days old (review minor 4): the model keeps failing the
 *   schema on that post with this prompt. A new prompt version clears it.
 */
export async function selectJobsToEnrich(
  db: Db,
  limit: number,
  options: { skipQueued?: boolean; promptVersion?: string | null } = {},
): Promise<string[]> {
  const skipQueued = options.skipQueued ?? true;
  const promptVersion = options.promptVersion ?? null;
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .leftJoin(jobEnrichment, eq(jobEnrichment.jobId, jobs.id))
    .where(
      and(
        eq(jobs.status, "open"),
        eq(jobs.isDemo, false),
        isNull(jobs.duplicateOfJobId),
        or(
          isNull(jobEnrichment.jobId),
          sql`${jobEnrichment.contentHash} is distinct from ${jobs.contentHash}`,
        ),
        skipQueued
          ? sql`not exists (
          select 1 from pgboss.job q
           where q.name = ${ENRICH_JOB_QUEUE}
             and q.singleton_key = ${jobs.id}::text
             and (q.state in ('created', 'retry', 'active')
                  or (q.state = 'failed' and q.completed_on > now() - interval '24 hours'))
            )`
          : undefined,
        promptVersion === null
          ? undefined
          : sql`not exists (
          select 1 from (
            select u.outcome, u.created_at from ai_usage u
             where u.job_id = ${jobs.id} and u.task = 'job-enrichment'
               and u.prompt_version = ${promptVersion}
             order by u.created_at desc
             limit 2
          ) last_two
          having count(*) = 2
             and bool_and(last_two.outcome = 'invalid')
             and min(last_two.created_at) > now() - interval '7 days'
            )`,
      ),
    )
    .orderBy(desc(jobs.firstSeenAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

export interface SweepResult {
  selected: number;
  enqueued: number;
  skipped: "capped" | "sample-limit" | null;
}

export async function sweepEnrich(
  boss: PgBoss,
  db: Db,
  env: EnrichEnv,
  capGuard: DailyCapGuard,
): Promise<SweepResult> {
  const cap = await capGuard.check();
  if (cap.state === "capped") {
    await alertCapReached(db, cap);
    return { selected: 0, enqueued: 0, skipped: "capped" };
  }
  let limit = env.sweepLimit;
  if (env.sampleMaxJobs !== null) {
    const remaining = env.sampleMaxJobs - (await countEnrichedJobs(db));
    if (remaining <= 0) return { selected: 0, enqueued: 0, skipped: "sample-limit" };
    limit = Math.min(limit, remaining);
  }
  const { versionId } = await loadPrompt("job-enrichment");
  const ids = await selectJobsToEnrich(db, limit, { promptVersion: versionId });
  let enqueued = 0;
  for (const jobId of ids) {
    const id = await boss.send(ENRICH_JOB_QUEUE, { jobId } satisfies EnrichJobData, {
      singletonKey: jobId,
    });
    if (id) enqueued += 1;
  }
  return { selected: ids.length, enqueued, skipped: null };
}

export async function startEnrichWorkers(deps: EnrichWorkerDeps): Promise<void> {
  const { boss, db, env } = deps;
  const ledger = deps.ledger ?? createAiUsageLedger(db);
  const capGuard = deps.capGuard ?? createDailyCapGuard({ ledger });

  await boss.work(ENRICH_SWEEP_QUEUE, { pollingIntervalSeconds: 30 }, async () => {
    const r = await sweepEnrich(boss, db, env, capGuard);
    console.log(
      `enrich.sweep: selected=${r.selected} enqueued=${r.enqueued}${r.skipped ? ` skipped=${r.skipped}` : ""}`,
    );
  });

  await boss.work<EnrichJobData>(
    ENRICH_JOB_QUEUE,
    { batchSize: 1, localConcurrency: env.concurrency, pollingIntervalSeconds: 10 },
    async ([job]) => {
      if (!job) return;
      const { jobId } = job.data;
      const started = Date.now();
      try {
        if (
          env.sampleMaxJobs !== null &&
          !(await sampleSlotAvailable(db, env.sampleMaxJobs, jobId))
        ) {
          console.log(`enrich job=${jobId} skipped: sample-limit`);
          return;
        }
        const result = await computeEnrichment(
          {
            db,
            ledger,
            capGuard,
            runLabel: env.sampleMaxJobs !== null ? "sample" : "sweep",
            abortSignal: job.signal,
          },
          jobId,
        );
        if (result.kind === "skipped") {
          console.log(`enrich job=${jobId} skipped: ${result.reason}`);
          return;
        }
        const c = result.value;
        const written = await writeEnrichment(db, c);
        if (written.skipped) {
          console.log(`enrich job=${jobId} not written: ${written.skipped}`);
          return;
        }
        const tiers = c.verdicts.reduce<Record<string, number>>((acc, v) => {
          acc[v.tier] = (acc[v.tier] ?? 0) + 1;
          return acc;
        }, {});
        console.log(
          `enrich job=${jobId} model=${c.ai.model} outcome=${c.ai.outcome} attempts=${c.ai.attempts} cost=${c.ai.costUsd.toFixed(6)} signals=${c.llm.signals.length} dropped=${c.llm.dropped} unverified=${c.llm.unverifiedQuotes} tiers=${JSON.stringify(tiers)} rows=${written.eligibilityRows}/${written.evidenceRows} ms=${Date.now() - started}`,
        );
      } catch (error) {
        if (error instanceof DailyCapReachedError) {
          // Nothing was sent. Alert once per UTC day and run the job again after 00:00 UTC.
          const alert = await alertCapReached(db, error, error.day);
          await boss.send(ENRICH_JOB_QUEUE, { jobId } satisfies EnrichJobData, {
            startAfter: error.retryAt,
            singletonKey: jobId,
          });
          console.warn(
            `enrich job=${jobId} deferred: daily cap reached, retry after ${error.retryAt.toISOString()}${alert.claimed ? ` alert=${alert.deliveredVia}` : ""}`,
          );
          return;
        }
        if (error instanceof AiOutputInvalidError) {
          // Not retried: the same post and prompt fail the same way. The sweep backs off from
          // this job for 7 days once its last two attempts are invalid.
          console.warn(`enrich job=${jobId} invalid output: ${describeEnrichError(error)}`);
          return;
        }
        if (!job.signal.aborted) {
          console.error(`enrich job=${jobId} failed: ${describeEnrichError(error)}`);
        }
        throw error;
      }
    },
  );
}
