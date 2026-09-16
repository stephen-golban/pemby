// Scheduled fan-out: which boards to read, and when.
import { isConnectorImplemented } from "@pemby/ats";
import { ATS_KINDS, type AtsKind } from "@pemby/core/private-config";
import { getSourceHealth, schema, type Db } from "@pemby/db";
import {
  and,
  eq,
  exists,
  inArray,
  isNotNull,
  isNull,
  lt,
  not,
  notExists,
  or,
  sql,
} from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { WorkerEnv } from "../env";
import { ingestQueue, type IngestJobData } from "./queues";

const { companies, companySourceHealth, jobs } = schema;

/** schedule-ingest spreads its board reads over this window. */
const INGEST_JITTER_SECONDS = 30 * 60;
/** verify-live reads are more urgent: a shorter spread. */
const VERIFY_JITTER_SECONDS = 5 * 60;

/** ATS kinds this worker reads: implemented and not switched off by INGEST_DISABLED_ATS. */
export function activeAtsKinds(env: WorkerEnv): AtsKind[] {
  return ATS_KINDS.filter((kind) => !env.disabledAts.has(kind) && isConnectorImplemented(kind));
}

interface BoardRow {
  id: string;
  ats: string | null;
}

async function enqueueBoards(
  boss: PgBoss,
  env: WorkerEnv,
  boards: readonly BoardRow[],
  jitterSeconds: number,
  priority: number,
): Promise<{ considered: number; enqueued: number }> {
  const active = new Set<string>(activeAtsKinds(env));
  const byAts = new Map<AtsKind, BoardRow[]>();
  for (const board of boards) {
    if (!board.ats || !active.has(board.ats)) continue;
    const kind = board.ats as AtsKind;
    const list = byAts.get(kind) ?? [];
    list.push(board);
    byAts.set(kind, list);
  }

  let enqueued = 0;
  const now = Date.now();
  for (const [ats, list] of byAts) {
    for (let i = 0; i < list.length; i += 500) {
      // insert() ends in ON CONFLICT DO NOTHING, so a board that already has a queued, retrying
      // or running read (exclusive policy, keyed by company) is skipped, not doubled.
      const ids = await boss.insert(
        ingestQueue(ats),
        list.slice(i, i + 500).map((board) => ({
          data: { companyId: board.id } satisfies IngestJobData,
          singletonKey: board.id,
          priority,
          startAfter: new Date(now + Math.floor(Math.random() * jitterSeconds * 1000)),
        })),
        { returnId: true },
      );
      enqueued += ids?.length ?? 0;
    }
  }
  return { considered: boards.length, enqueued };
}

const enabledBoard = and(
  eq(companies.ingestEnabled, true),
  eq(companies.isDemo, false),
  isNotNull(companies.atsType),
  isNotNull(companies.atsBoardToken),
);

/** Every enabled board, spread over 30 minutes. */
export async function scheduleIngest(boss: PgBoss, db: Db, env: WorkerEnv) {
  const boards = await db
    .select({ id: companies.id, ats: companies.atsType })
    .from(companies)
    .where(enabledBoard);
  return enqueueBoards(boss, env, boards, INGEST_JITTER_SECONDS, 0);
}

/** Enabled boards never read yet (new in the source list), right after a company sync. */
export async function ingestUnreadBoards(boss: PgBoss, db: Db, env: WorkerEnv) {
  const boards = await db
    .select({ id: companies.id, ats: companies.atsType })
    .from(companies)
    .where(
      and(
        enabledBoard,
        notExists(
          db
            .select({ one: sql`1` })
            .from(companySourceHealth)
            .where(eq(companySourceHealth.companyId, companies.id)),
        ),
      ),
    );
  return enqueueBoards(boss, env, boards, INGEST_JITTER_SECONDS, 0);
}

/**
 * Enabled boards with an open job not verified live within VERIFY_LIVE_MAX_AGE_HOURS. A board read
 * verifies every job on it, so this is what holds the 12-hour freshness promise (PLAN section 4
 * rule 5) after failed or held-back reads.
 */
export async function verifyLive(boss: PgBoss, db: Db, env: WorkerEnv) {
  const cutoff = sql`now() - make_interval(hours => ${env.verifyLiveMaxAgeHours})`;
  const boards = await db
    .select({ id: companies.id, ats: companies.atsType })
    .from(companies)
    .where(
      and(
        enabledBoard,
        exists(
          db
            .select({ one: sql`1` })
            .from(jobs)
            .where(
              and(
                eq(jobs.companyId, companies.id),
                eq(jobs.status, "open"),
                eq(jobs.isDemo, false),
                or(isNull(jobs.lastVerifiedLiveAt), lt(jobs.lastVerifiedLiveAt, cutoff)),
              ),
            ),
        ),
      ),
    );
  return enqueueBoards(boss, env, boards, VERIFY_JITTER_SECONDS, 1);
}

/** Open jobs on boards nobody reads are closed once unverified for this long. */
const UNREAD_BOARD_MAX_AGE_HOURS = 48;

/**
 * Closes open, non-demo jobs of ATS companies the worker does not read (ingest disabled, vendor
 * in INGEST_DISABLED_ATS, or connector not implemented) once they have gone 48 hours without a
 * live check (first_seen_at when never verified), so they cannot stay open forever.
 */
export async function closeUnreadBoardJobs(db: Db, env: WorkerEnv) {
  const active = activeAtsKinds(env);
  const cutoff = sql`now() - make_interval(hours => ${UNREAD_BOARD_MAX_AGE_HOURS})`;
  const unreadCompanies = db
    .select({ id: companies.id })
    .from(companies)
    .where(
      and(
        eq(companies.isDemo, false),
        inArray(companies.atsType, [...ATS_KINDS]),
        or(
          eq(companies.ingestEnabled, false),
          active.length > 0 ? not(inArray(companies.atsType, active)) : sql`true`,
        ),
      ),
    );
  const closed = await db
    .update(jobs)
    .set({ status: "closed", closedAt: sql`now()` })
    .where(
      and(
        eq(jobs.status, "open"),
        eq(jobs.isDemo, false),
        inArray(jobs.companyId, unreadCompanies),
        lt(sql`coalesce(${jobs.lastVerifiedLiveAt}, ${jobs.firstSeenAt})`, cutoff),
      ),
    )
    .returning({ id: jobs.id });
  return { closed: closed.length, maxAgeHours: UNREAD_BOARD_MAX_AGE_HOURS };
}

/** Totals only: counts, no company names or tokens. */
export async function logSourceHealth(db: Db): Promise<void> {
  const { totals } = await getSourceHealth(db);
  const perAts = Object.entries(totals.openJobsByAts)
    .map(([ats, n]) => `${ats}=${n}`)
    .join(" ");
  console.log(
    `source health: companies=${totals.companies} active=${totals.active} erroring=${totals.erroring} dead=${totals.dead} disabled=${totals.disabled} openJobs=${totals.openJobs}${perAts ? ` ${perAts}` : ""}`,
  );
}
