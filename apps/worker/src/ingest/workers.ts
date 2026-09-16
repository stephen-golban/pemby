// Registers queues, schedules and handlers for ingestion on one pg-boss instance.
import type { HttpClient } from "@pemby/ats";
import { ATS_KINDS, loadPrivateConfig, type AtsKind } from "@pemby/core/private-config";
import type { Db } from "@pemby/db";
import type { PgBoss } from "pg-boss";
import type { WorkerEnv } from "../env";
import {
  activeAtsKinds,
  closeUnreadBoardJobs,
  ingestUnreadBoards,
  logSourceHealth,
  scheduleIngest,
  verifyLive,
} from "./fan-out";
import { ingestCompanyBoard, safeErrorMessage } from "./ingest-board";
import {
  ensureQueue,
  INGEST_QUEUE_OPTIONS,
  ingestQueue,
  MAINTENANCE_QUEUE_OPTIONS,
  SCHEDULE_INGEST_QUEUE,
  SOURCE_HEALTH_QUEUE,
  SYNC_COMPANIES_QUEUE,
  VERIFY_LIVE_QUEUE,
  type IngestJobData,
} from "./queues";
import { syncCompanies } from "./sync-companies";

/**
 * Every local worker polls on its own connection from the pg-boss pool (6 ATS x concurrency plus
 * 4 maintenance queues). Board reads and fan-out are not latency-sensitive, so poll slowly and
 * leave the pool room for job completion writes.
 */
const MAINTENANCE_WORK_OPTIONS = { pollingIntervalSeconds: 30 };

const MAINTENANCE_QUEUES = [
  SCHEDULE_INGEST_QUEUE,
  VERIFY_LIVE_QUEUE,
  SYNC_COMPANIES_QUEUE,
  SOURCE_HEALTH_QUEUE,
] as const;

export interface IngestDeps {
  boss: PgBoss;
  db: Db;
  http: HttpClient;
  env: WorkerEnv;
}

/** createQueue for every queue: they must exist before send() or schedule(). */
export async function createIngestQueues(boss: PgBoss): Promise<void> {
  for (const ats of ATS_KINDS) await ensureQueue(boss, ingestQueue(ats), INGEST_QUEUE_OPTIONS);
  for (const name of MAINTENANCE_QUEUES) await ensureQueue(boss, name, MAINTENANCE_QUEUE_OPTIONS);
}

/** UTC; `missed: "once"` sends one catch-up job for occurrences missed while no worker ran. */
const SCHEDULE_OPTIONS = { tz: "UTC", missed: "once" } as const;

/** Vendors whose boards return multi-megabyte bodies: one read at a time per process. */
const LARGE_PAYLOAD_ATS: ReadonlySet<AtsKind> = new Set(["greenhouse", "lever", "ashby"]);

/** Cron schedules, UTC. `schedule` upserts by name, so a changed interval replaces the old one. */
export async function scheduleIngestJobs(
  boss: PgBoss,
  env: WorkerEnv,
  configId: string,
): Promise<void> {
  await boss.schedule(
    SCHEDULE_INGEST_QUEUE,
    `0 */${env.ingestIntervalHours} * * *`,
    {},
    { tz: "UTC" },
  );
  await boss.schedule(VERIFY_LIVE_QUEUE, "15 * * * *", {}, SCHEDULE_OPTIONS);
  await boss.schedule(
    SYNC_COMPANIES_QUEUE,
    "30 3 * * *",
    { configId } satisfies SyncCompaniesJobData,
    SCHEDULE_OPTIONS,
  );
  await boss.schedule(SOURCE_HEALTH_QUEUE, "45 * * * *", {}, SCHEDULE_OPTIONS);
}

export interface SyncCompaniesJobData {
  /** Private config `version.id` of the process that registered the schedule. */
  configId?: string;
}

/** Company sync plus a read of boards never read yet, with the usual log lines. */
export async function runCompanySync(
  deps: IngestDeps,
  trigger: "boot" | "scheduled",
): Promise<void> {
  const { boss, db, env } = deps;
  const r = await syncCompanies(db, env.sourceLists);
  const config = `config=${r.configId.slice(0, 12)} trigger=${trigger}`;
  if (r.skipped) {
    console.warn(
      `sync-companies: skipped, lists found=${r.listsRead} entries=${r.entries} (nothing disabled) ${config}`,
    );
  } else {
    console.log(
      `sync-companies: lists=${r.listsRead} entries=${r.entries} upserted=${r.upserted} disabled=${r.disabled} jobsClosed=${r.jobsClosed} ${config}`,
    );
    if (r.disableSkipped) console.warn(`sync-companies: disable step skipped: ${r.disableSkipped}`);
  }
  const unread = await ingestUnreadBoards(boss, db, env);
  console.log(`sync-companies: unread boards=${unread.considered} enqueued=${unread.enqueued}`);
}

export async function startIngestWorkers(deps: IngestDeps): Promise<void> {
  const { boss, db, http, env } = deps;

  const active = activeAtsKinds(env);
  for (const ats of active) {
    await boss.work<IngestJobData>(
      ingestQueue(ats),
      {
        batchSize: 1,
        localConcurrency: LARGE_PAYLOAD_ATS.has(ats) ? 1 : env.ingestConcurrency,
        pollingIntervalSeconds: 15,
      },
      async ([job]) => {
        if (!job) return;
        const started = Date.now();
        try {
          const r = await ingestCompanyBoard({ db, http, signal: job.signal }, job.data.companyId);
          const ms = Date.now() - started;
          if (r.outcome === "skipped") {
            console.log(`ingest ${ats} company=${r.companyId} skipped: ${r.skipReason}`);
          } else if (r.outcome === "not-found") {
            console.log(
              `ingest ${ats} company=${r.companyId} board not found${r.disabled ? `: disabled, closed=${r.closed}` : ""}`,
            );
          } else {
            console.log(
              `ingest ${ats} company=${r.companyId} listed=${r.listed} kept=${r.kept} new=${r.inserted} updated=${r.updated} unchanged=${r.unchanged} reopened=${r.reopened} closed=${r.closed} merged=${r.merged} details=${r.detailsFetched}/${r.detailsFailed}${r.closingHeld ? " closing-held" : ""} ms=${ms}`,
            );
          }
        } catch (error) {
          if (!job.signal.aborted) {
            console.error(
              `ingest ${ats} company=${job.data.companyId} failed: ${safeErrorMessage(error)}`,
            );
          }
          throw error;
        }
      },
    );
  }
  const skipped = ATS_KINDS.filter((k) => !active.includes(k));
  console.log(
    `ingest workers: ${active.join(",") || "none"}${skipped.length ? ` (not reading: ${skipped.join(",")})` : ""}`,
  );

  await boss.work(SCHEDULE_INGEST_QUEUE, MAINTENANCE_WORK_OPTIONS, async () => {
    const r = await scheduleIngest(boss, db, env);
    console.log(`schedule-ingest: boards=${r.considered} enqueued=${r.enqueued}`);
  });

  await boss.work(VERIFY_LIVE_QUEUE, MAINTENANCE_WORK_OPTIONS, async () => {
    const r = await verifyLive(boss, db, env);
    console.log(`verify-live: stale boards=${r.considered} enqueued=${r.enqueued}`);
    const orphaned = await closeUnreadBoardJobs(db, env);
    if (orphaned.closed > 0) {
      console.log(
        `verify-live: closed ${orphaned.closed} jobs unverified for ${orphaned.maxAgeHours}h on boards not being read`,
      );
    }
  });

  await boss.work<SyncCompaniesJobData>(
    SYNC_COMPANIES_QUEUE,
    MAINTENANCE_WORK_OPTIONS,
    async ([job]) => {
      // The schedule carries the config id of the process that registered it last (the newest
      // boot). A process holding a different config (an old container during a deploy) skips.
      const expected = job?.data?.configId;
      const { version } = await loadPrivateConfig();
      if (expected && expected !== version.id) {
        console.warn(
          `sync-companies: skipped, loaded config=${version.shortId} differs from scheduled config=${expected.slice(0, 12)}`,
        );
        return;
      }
      await runCompanySync(deps, "scheduled");
    },
  );

  await boss.work(SOURCE_HEALTH_QUEUE, MAINTENANCE_WORK_OPTIONS, async () => {
    await logSourceHealth(db);
  });
}
