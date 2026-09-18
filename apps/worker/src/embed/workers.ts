// Registers the embedding sweep and the embed.job / embed.profile handlers on one pg-boss instance.
//
// The three typed-error branches every AI handler in this repo implements (enrich/workers.ts:234):
// DailyCapReachedError -> alert once per UTC day and re-send with `startAfter` and the same
// singleton key; a permanent per-row failure -> warn and return; anything else -> throw for the
// queue's retries. `embed.profile` throws only sanitized labels, because pg-boss stores what a
// handler throws in `pgboss.job.output`.
import {
  AiCallError,
  AiEmbeddingInvalidError,
  DailyCapReachedError,
  EMBEDDING_MODEL,
  createDailyCapGuard,
  type CostLedger,
  type DailyCapGuard,
} from "@pemby/ai";
import { createAiUsageLedger, schema, type Db } from "@pemby/db";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";

import { safeErrorLabel } from "../cv/workers";
import { alertCapReached } from "../enrich/workers";
import {
  MATCH_JOB_QUEUE,
  MATCH_PROFILE_QUEUE,
  type MatchJobData,
  type MatchProfileData,
} from "../match/queues";
import { embedSpentTodayUsd } from "./budget";
import { embedJob, type EmbedDeps, type EmbedOutcome } from "./embed-job";
import { embedProfile } from "./embed-profile";
import type { EmbedEnv } from "./env";
import {
  EMBED_JOB_QUEUE,
  EMBED_PROFILE_QUEUE,
  EMBED_SWEEP_CRON,
  EMBED_SWEEP_QUEUE,
  type EmbedJobData,
  type EmbedProfileData,
} from "./queues";

const { cvFiles, jobEmbeddings, jobEnrichment, jobs, profileEmbeddings, profiles } = schema;

export interface EmbedWorkerDeps {
  boss: PgBoss;
  db: Db;
  env: EmbedEnv;
  /** Defaults to the Postgres ledger and a guard reading AI_DAILY_CAP_USD. */
  ledger?: CostLedger;
  capGuard?: DailyCapGuard;
}

/** Registers the sweep cron when EMBED_ENABLED, and removes it otherwise. */
export async function scheduleEmbedSweep(boss: PgBoss, env: EmbedEnv): Promise<void> {
  if (!env.enabled) {
    await boss.unschedule(EMBED_SWEEP_QUEUE);
    return;
  }
  await boss.schedule(EMBED_SWEEP_QUEUE, EMBED_SWEEP_CRON, {}, { tz: "UTC" });
}

/** Error description safe to log: task, model, status, counts; never request or response content. */
export function describeEmbedError(error: unknown): string {
  if (error instanceof AiCallError) {
    return `task=${error.task} model=${error.model} status=${error.status ?? "-"} type=${error.errorType ?? "-"}`;
  }
  if (error instanceof AiEmbeddingInvalidError) {
    return `task=${error.task} model=${error.model} status=invalid-embedding reason=${error.reason} expected=${error.expected} got=${error.received}`;
  }
  return `status=${safeErrorLabel(error)}`;
}

/** Skips ids that already have a job on `queue` queued, active, retrying or freshly failed. */
function notAlreadyQueued(queue: string, idColumn: ReturnType<typeof sql>) {
  return sql`not exists (
    select 1 from pgboss.job q
     where q.name = ${queue}
       and q.singleton_key = ${idColumn}::text
       and (q.state in ('created', 'retry', 'active')
            or (q.state = 'failed' and q.completed_on > now() - interval '24 hours'))
  )`;
}

/**
 * Open, non-demo, canonical jobs that are enriched and whose vector is missing, was built with
 * another model, or is older than the job row or its enrichment. The exact "did the text change"
 * answer needs the built text, so the handler makes it with the content hash; this only narrows the
 * candidates cheaply. `skipQueued: false` drops the `pgboss.job` check for scripts run without
 * pg-boss.
 */
export async function selectJobsToEmbed(
  db: Db,
  limit: number,
  options: { skipQueued?: boolean } = {},
): Promise<string[]> {
  const skipQueued = options.skipQueued ?? true;
  const rows = await db
    .select({ id: jobs.id })
    .from(jobs)
    .innerJoin(jobEnrichment, eq(jobEnrichment.jobId, jobs.id))
    .leftJoin(jobEmbeddings, eq(jobEmbeddings.jobId, jobs.id))
    .where(
      and(
        eq(jobs.status, "open"),
        eq(jobs.isDemo, false),
        isNull(jobs.duplicateOfJobId),
        or(
          isNull(jobEmbeddings.jobId),
          sql`${jobEmbeddings.model} is distinct from ${EMBEDDING_MODEL}`,
          sql`${jobEmbeddings.updatedAt} < greatest(${jobs.updatedAt}, ${jobEnrichment.updatedAt})`,
        ),
        skipQueued ? notAlreadyQueued(EMBED_JOB_QUEUE, sql`${jobs.id}`) : undefined,
      ),
    )
    .orderBy(desc(jobs.firstSeenAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

/**
 * Profiles with something to embed (a title, a stack or a parsed CV) whose vector is missing, was
 * built with another model, or is older than the profile row or its newest parsed CV.
 *
 * Seeded demo profiles are left out: the sweep must not spend the embedding budget on fixtures.
 * `includeDemo` is for a backfill run that wants the demo Brief scored on the same signals as a
 * real one — three rows, and the same ZDR route.
 */
export async function selectProfilesToEmbed(
  db: Db,
  limit: number,
  options: { skipQueued?: boolean; includeDemo?: boolean } = {},
): Promise<string[]> {
  const skipQueued = options.skipQueued ?? true;
  const includeDemo = options.includeDemo ?? false;
  const cvParsedAt = sql`(
    select max(c.updated_at) from ${cvFiles} c
     where c.user_id = ${profiles.userId} and c.parse_status = 'parsed'
  )`;
  const rows = await db
    .select({ id: profiles.id })
    .from(profiles)
    .leftJoin(profileEmbeddings, eq(profileEmbeddings.profileId, profiles.id))
    .where(
      and(
        includeDemo ? undefined : eq(profiles.isDemo, false),
        sql`(cardinality(${profiles.titles}) > 0 or cardinality(${profiles.stack}) > 0 or ${cvParsedAt} is not null)`,
        or(
          isNull(profileEmbeddings.profileId),
          sql`${profileEmbeddings.model} is distinct from ${EMBEDDING_MODEL}`,
          sql`${profileEmbeddings.updatedAt} < greatest(${profiles.updatedAt}, coalesce(${cvParsedAt}, ${profiles.updatedAt}))`,
        ),
        skipQueued ? notAlreadyQueued(EMBED_PROFILE_QUEUE, sql`${profiles.id}`) : undefined,
      ),
    )
    .orderBy(desc(profiles.updatedAt))
    .limit(limit);
  return rows.map((r) => r.id);
}

export interface EmbedSweepResult {
  jobsSelected: number;
  jobsEnqueued: number;
  profilesSelected: number;
  profilesEnqueued: number;
  skipped: "capped" | "budget" | null;
}

/**
 * Selects and enqueues. The global cap and the embed sub-budget are both checked first, so a capped
 * day queues nothing instead of queueing work that would immediately defer itself.
 */
export async function sweepEmbed(
  boss: PgBoss,
  db: Db,
  env: EmbedEnv,
  capGuard: DailyCapGuard,
): Promise<EmbedSweepResult> {
  const empty = { jobsSelected: 0, jobsEnqueued: 0, profilesSelected: 0, profilesEnqueued: 0 };
  const cap = await capGuard.check();
  if (cap.state === "capped") {
    await alertCapReached(db, cap);
    return { ...empty, skipped: "capped" };
  }
  if ((await embedSpentTodayUsd(db)) >= env.budgetUsd) return { ...empty, skipped: "budget" };

  // Profiles first: there are far fewer of them, and a user waiting for their first brief should
  // not sit behind a job backfill.
  const profileIds = await selectProfilesToEmbed(db, env.profileSweepLimit);
  let profilesEnqueued = 0;
  for (const profileId of profileIds) {
    const id = await boss.send(EMBED_PROFILE_QUEUE, { profileId } satisfies EmbedProfileData, {
      singletonKey: profileId,
    });
    if (id) profilesEnqueued += 1;
  }

  const jobIds = await selectJobsToEmbed(db, env.sweepLimit);
  let jobsEnqueued = 0;
  for (const jobId of jobIds) {
    const id = await boss.send(EMBED_JOB_QUEUE, { jobId } satisfies EmbedJobData, {
      singletonKey: jobId,
    });
    if (id) jobsEnqueued += 1;
  }

  return {
    jobsSelected: jobIds.length,
    jobsEnqueued,
    profilesSelected: profileIds.length,
    profilesEnqueued,
    skipped: null,
  };
}

/** One line per outcome. Ids, counts, cost and milliseconds only, never text. */
function formatOutcome(outcome: EmbedOutcome): string {
  switch (outcome.kind) {
    case "skipped":
      return `skipped: ${outcome.reason}`;
    case "unchanged":
      return "unchanged (no model call)";
    case "embedded":
      return `embedded chars=${outcome.chars} tokens=${outcome.inputTokens} cost=${outcome.costUsd.toFixed(6)} model=${outcome.model} requests=${outcome.requests} ms=${outcome.latencyMs}`;
  }
}

/**
 * A new vector is the moment a pair becomes scoreable, so it is the moment to re-match.
 *
 * `match.sweep` will not offer a job that has no `job_embeddings` row (`match/sweep.ts`), and a
 * profile's whole Brief was scored against the vector this run has just replaced. Both queues
 * de-duplicate on the singleton key — `match.job` is `exclusive`, `match.profile` is `short` — so a
 * request that is already waiting is dropped rather than doubled, and `send` returning null is the
 * queue saying exactly that.
 *
 * Only ever called after the vector is written and only for an `embedded` outcome: an `unchanged`
 * run changed nothing to re-score. A failure here is logged and swallowed. The embedding is
 * already committed, so failing the embed job would re-run a paid model call to fix a queue
 * hiccup, and the sweep offers the job again anyway.
 */
async function enqueueRematch(
  boss: PgBoss,
  target: { kind: "job"; id: string } | { kind: "profile"; id: string },
): Promise<void> {
  try {
    const sent =
      target.kind === "job"
        ? await boss.send(MATCH_JOB_QUEUE, { jobId: target.id } satisfies MatchJobData, {
            singletonKey: target.id,
          })
        : await boss.send(
            MATCH_PROFILE_QUEUE,
            { profileId: target.id } satisfies MatchProfileData,
            { singletonKey: target.id },
          );
    if (sent === null) console.log(`embed -> match.${target.kind} ${target.id}: already queued`);
  } catch (error) {
    console.error(
      `embed -> match.${target.kind} ${target.id} enqueue failed: ${describeEmbedError(error)}`,
    );
  }
}

export async function startEmbedWorkers(deps: EmbedWorkerDeps): Promise<void> {
  const { boss, db, env } = deps;
  const ledger = deps.ledger ?? createAiUsageLedger(db);
  const capGuard = deps.capGuard ?? createDailyCapGuard({ ledger });

  await boss.work(EMBED_SWEEP_QUEUE, { pollingIntervalSeconds: 30 }, async () => {
    const r = await sweepEmbed(boss, db, env, capGuard);
    console.log(
      `embed.sweep: jobs=${r.jobsEnqueued}/${r.jobsSelected} profiles=${r.profilesEnqueued}/${r.profilesSelected}${r.skipped ? ` skipped=${r.skipped}` : ""}`,
    );
  });

  await boss.work<EmbedJobData>(
    EMBED_JOB_QUEUE,
    { batchSize: 1, localConcurrency: env.concurrency, pollingIntervalSeconds: 10 },
    async ([job]) => {
      if (!job) return;
      const { jobId } = job.data;
      const embedDeps: EmbedDeps = {
        db,
        ledger,
        capGuard,
        budgetUsd: env.budgetUsd,
        runLabel: "sweep",
        abortSignal: job.signal,
      };
      try {
        const outcome = await embedJob(embedDeps, jobId);
        console.log(`embed.job job=${jobId} ${formatOutcome(outcome)}`);
        if (outcome.kind === "embedded") await enqueueRematch(boss, { kind: "job", id: jobId });
      } catch (error) {
        if (error instanceof DailyCapReachedError) {
          // Nothing was sent (global cap or the embed sub-budget). Alert once per UTC day and run
          // the job again after 00:00 UTC, on the same singleton key.
          const alert = await alertCapReached(db, error, error.day);
          await boss.send(EMBED_JOB_QUEUE, { jobId } satisfies EmbedJobData, {
            startAfter: error.retryAt,
            singletonKey: jobId,
          });
          console.warn(
            `embed.job job=${jobId} deferred: daily cap reached, retry after ${error.retryAt.toISOString()}${alert.claimed ? ` alert=${alert.deliveredVia}` : ""}`,
          );
          return;
        }
        if (error instanceof AiEmbeddingInvalidError) {
          // Not retried: the same text produces the same answer. A model or dimension change is a
          // deploy-level problem, and the sweep will pick the row up again after it.
          console.warn(`embed.job job=${jobId} invalid: ${describeEmbedError(error)}`);
          return;
        }
        if (!job.signal.aborted) {
          console.error(`embed.job job=${jobId} failed: ${describeEmbedError(error)}`);
        }
        throw error;
      }
    },
  );

  await boss.work<EmbedProfileData>(
    EMBED_PROFILE_QUEUE,
    // One at a time: personal data, and there are never many profiles waiting at once.
    { batchSize: 1, localConcurrency: 1, pollingIntervalSeconds: 10 },
    async ([job]) => {
      if (!job) return;
      const { profileId } = job.data;
      const embedDeps: EmbedDeps = {
        db,
        ledger,
        capGuard,
        budgetUsd: env.budgetUsd,
        runLabel: "sweep",
        abortSignal: job.signal,
      };
      try {
        const outcome = await embedProfile(embedDeps, profileId);
        console.log(`embed.profile profile=${profileId} ${formatOutcome(outcome)}`);
        if (outcome.kind === "embedded") {
          await enqueueRematch(boss, { kind: "profile", id: profileId });
        }
      } catch (error) {
        if (error instanceof DailyCapReachedError) {
          const alert = await alertCapReached(db, error, error.day);
          await boss.send(EMBED_PROFILE_QUEUE, { profileId } satisfies EmbedProfileData, {
            startAfter: error.retryAt,
            singletonKey: profileId,
          });
          console.warn(
            `embed.profile profile=${profileId} deferred: daily cap reached, retry after ${error.retryAt.toISOString()}${alert.claimed ? ` alert=${alert.deliveredVia}` : ""}`,
          );
          return;
        }
        if (error instanceof AiEmbeddingInvalidError) {
          console.warn(`embed.profile profile=${profileId} invalid: ${describeEmbedError(error)}`);
          return;
        }
        // Never rethrow the original: pg-boss stores a failed job's error in `pgboss.job.output`,
        // and a driver error's message quotes its parameters, which here are profile text.
        const label = safeErrorLabel(error);
        if (!job.signal.aborted) {
          console.error(`embed.profile profile=${profileId} failed: ${label}`);
        }
        throw new Error(label);
      }
    },
  );
}
