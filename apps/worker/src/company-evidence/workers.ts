// pg-boss queues for company evidence: a per-company check and a daily sweep that enqueues stale
// companies. Nothing is enqueued at boot (deploy overlap: old and new containers share the queue).
import { AiPromptMissingError, DailyCapReachedError, createDailyCapGuard } from "@pemby/ai";
import { createAiUsageLedger, schema, type Db } from "@pemby/db";
import { and, asc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import type { PgBoss, Queue } from "pg-boss";
import { alertCapReached, recomputeEligibilityForCompany } from "../enrich";
import { checkCompany, loadCompanyForEvidence, persistCompanyEvidence } from "./check";
import type { CompanyEvidenceEnv } from "./env";

const { companies } = schema;

export const COMPANY_EVIDENCE_CHECK_QUEUE = "company-evidence.check";
export const COMPANY_EVIDENCE_SWEEP_QUEUE = "company-evidence.sweep";

export type CompanyEvidenceReason = "schedule" | "flag" | "manual";

export interface CompanyEvidenceJobData {
  companyId: string;
  reason: CompanyEvidenceReason;
}

/** Discovery and extraction together; the job aborts past this. */
export const COMPANY_EVIDENCE_DEADLINE_MS = 8 * 60 * 1000;
/** Per model attempt (a repair retry or fallback model gets its own). */
export const COMPANY_EVIDENCE_MODEL_TIMEOUT_MS = 60 * 1000;

/** Sweep jobs spread their checks over this window. */
const SWEEP_JITTER_SECONDS = 60 * 60;

/**
 * `stately` with the company id as singletonKey: at most one queued and one active check per
 * company. That lets a running check that hit the daily cap queue its own retry for 00:00 UTC.
 * A check stops at COMPANY_EVIDENCE_DEADLINE_MS (pages plus model call); persisting and the
 * eligibility recompute fit in the rest of the 12-minute expiry.
 */
const CHECK_QUEUE_OPTIONS = {
  policy: "stately",
  retryLimit: 2,
  retryDelay: 300,
  retryBackoff: true,
  retryDelayMax: 3600,
  expireInSeconds: 12 * 60,
  deleteAfterSeconds: 7 * 24 * 3600,
} satisfies Omit<Queue, "name">;

const SWEEP_QUEUE_OPTIONS = {
  policy: "exclusive",
  retryLimit: 2,
  retryDelay: 60,
  retryBackoff: true,
  retryDelayMax: 600,
  expireInSeconds: 15 * 60,
  deleteAfterSeconds: 2 * 24 * 3600,
} satisfies Omit<Queue, "name">;

async function ensure(boss: PgBoss, name: string, options: Omit<Queue, "name">): Promise<void> {
  await boss.createQueue(name, options);
  const { policy: _policy, ...updatable } = options;
  await boss.updateQueue(name, updatable);
}

export async function createCompanyEvidenceQueues(boss: PgBoss): Promise<void> {
  await ensure(boss, COMPANY_EVIDENCE_CHECK_QUEUE, CHECK_QUEUE_OPTIONS);
  await ensure(boss, COMPANY_EVIDENCE_SWEEP_QUEUE, SWEEP_QUEUE_OPTIONS);
}

/**
 * Queues a check for one company (PLAN section 6: one "doesn't hire from my country" flag re-runs
 * it). Returns the job id, or null when a check for that company is already queued.
 */
export async function requestCompanyEvidenceRecheck(
  boss: PgBoss,
  companyId: string,
  reason: CompanyEvidenceReason,
  options: { startAfter?: Date } = {},
): Promise<string | null> {
  return boss.send(
    COMPANY_EVIDENCE_CHECK_QUEUE,
    { companyId, reason } satisfies CompanyEvidenceJobData,
    {
      singletonKey: companyId,
      ...(options.startAfter ? { startAfter: options.startAfter } : {}),
    },
  );
}

/** Daily at 04:20 UTC when enabled; removes the schedule when disabled. */
export async function scheduleCompanyEvidenceSweep(
  boss: PgBoss,
  env: CompanyEvidenceEnv,
): Promise<void> {
  if (!env.enabled) {
    await boss.unschedule(COMPANY_EVIDENCE_SWEEP_QUEUE);
    return;
  }
  await boss.schedule(COMPANY_EVIDENCE_SWEEP_QUEUE, "20 4 * * *", {}, { tz: "UTC" });
}

/** Companies with a domain never checked or checked longer than `maxAgeDays` ago, oldest first. */
export async function sweepCompanyEvidence(
  boss: PgBoss,
  db: Db,
  env: CompanyEvidenceEnv,
): Promise<{ considered: number; enqueued: number }> {
  const stale = await db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        isNotNull(companies.domain),
        eq(companies.isDemo, false),
        or(
          isNull(companies.evidenceCheckedAt),
          lt(companies.evidenceCheckedAt, sql`now() - make_interval(days => ${env.maxAgeDays})`),
        ),
      ),
    )
    .orderBy(sql`${companies.evidenceCheckedAt} asc nulls first`, asc(companies.id))
    .limit(env.sweepLimit);
  if (stale.length === 0) return { considered: 0, enqueued: 0 };
  const now = Date.now();
  // insert() skips jobs whose singletonKey already has a queued check.
  const ids = await boss.insert(
    COMPANY_EVIDENCE_CHECK_QUEUE,
    stale.map((c) => ({
      data: { companyId: c.id, reason: "schedule" } satisfies CompanyEvidenceJobData,
      singletonKey: c.id,
      startAfter: new Date(now + Math.floor(Math.random() * SWEEP_JITTER_SECONDS * 1000)),
    })),
    { returnId: true },
  );
  return { considered: stale.length, enqueued: ids?.length ?? 0 };
}

export interface CompanyEvidenceDeps {
  boss: PgBoss;
  db: Db;
  env: CompanyEvidenceEnv;
  /** Checks at once in this process. Default 2 (each host is still limited to 1 request/s). */
  concurrency?: number;
}

/** Error name and code only: messages from the database driver or the model can carry data. */
export function errorLabel(error: unknown): string {
  if (!(error instanceof Error)) return "error";
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" || typeof code === "number"
    ? `${error.name} code=${code}`
    : error.name;
}

export async function startCompanyEvidenceWorkers(deps: CompanyEvidenceDeps): Promise<void> {
  const { boss, db, env } = deps;
  const ledger = createAiUsageLedger(db);
  const capGuard = createDailyCapGuard({ ledger });

  await boss.work<CompanyEvidenceJobData>(
    COMPANY_EVIDENCE_CHECK_QUEUE,
    { batchSize: 1, localConcurrency: deps.concurrency ?? 2, pollingIntervalSeconds: 30 },
    async ([job]) => {
      if (!job) return;
      const { companyId, reason } = job.data;
      const started = Date.now();
      const company = await loadCompanyForEvidence(db, companyId);
      if (!company || company.isDemo) {
        console.log(`company-evidence company=${companyId} skipped: no domain or demo`);
        return;
      }
      try {
        const result = await checkCompany(company, {
          ledger,
          capGuard,
          runLabel: `company-evidence:${reason}`,
          signal: AbortSignal.any([job.signal, AbortSignal.timeout(COMPANY_EVIDENCE_DEADLINE_MS)]),
          timeoutMs: COMPANY_EVIDENCE_MODEL_TIMEOUT_MS,
        });
        await persistCompanyEvidence(db, result);
        // Jobs of this company take the new evidence now. A failure here is logged, not retried:
        // retrying would re-run the whole check, and the next enrichment picks the evidence up.
        let recomputed = "-";
        if (result.status !== "fetch-failed") {
          try {
            recomputed = String((await recomputeEligibilityForCompany(db, companyId)).jobs);
          } catch (error) {
            console.error(
              `company-evidence company=${companyId} recompute failed: ${errorLabel(error)}`,
            );
          }
        }
        const ex = result.extraction;
        console.log(
          `company-evidence company=${companyId} reason=${reason} status=${result.status} recomputedJobs=${recomputed} pages=${result.discovery.pages.length} requests=${result.discovery.requests} kept=${ex?.kept.length ?? 0} dropped=${ex?.dropped.length ?? 0} rows=${result.rows.length} cost=${(ex?.costUsd ?? 0).toFixed(5)} ms=${Date.now() - started}`,
        );
      } catch (error) {
        if (error instanceof DailyCapReachedError) {
          await alertCapReached(db, { spentUsd: error.spentUsd, capUsd: error.capUsd }, error.day);
          const id = await requestCompanyEvidenceRecheck(boss, companyId, reason, {
            startAfter: error.retryAt,
          });
          console.warn(
            `company-evidence company=${companyId} daily cap reached; ${id ? `rescheduled for ${error.retryAt.toISOString()}` : "a check is already queued"}`,
          );
          return;
        }
        if (error instanceof AiPromptMissingError) {
          // The prompt is optional in private config; retrying cannot help until a redeploy.
          console.warn(`company-evidence company=${companyId} skipped: ${errorLabel(error)}`);
          return;
        }
        if (!job.signal.aborted) {
          console.error(`company-evidence company=${companyId} failed: ${errorLabel(error)}`);
        }
        throw error;
      }
    },
  );

  await boss.work(COMPANY_EVIDENCE_SWEEP_QUEUE, { pollingIntervalSeconds: 60 }, async () => {
    if (!env.enabled) {
      console.log("company-evidence sweep: disabled (COMPANY_EVIDENCE_ENABLED)");
      return;
    }
    const r = await sweepCompanyEvidence(boss, db, env);
    console.log(`company-evidence sweep: stale=${r.considered} enqueued=${r.enqueued}`);
  });
}
