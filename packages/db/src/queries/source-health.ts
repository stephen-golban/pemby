// Source health for the admin page (phase 09 serves it as JSON). Read-only; the worker writes
// `company_source_health` while it reads public job-board APIs.
import { and, asc, count, eq, isNotNull, sql } from "drizzle-orm";
import type { Db } from "../client";
import { companies, companySourceHealth, jobs } from "../schema";

export type BoardStatus = (typeof companySourceHealth.$inferSelect)["boardStatus"];

export interface SourceHealthRow {
  companyId: string;
  companyName: string;
  slug: string;
  ats: string;
  boardToken: string;
  region: string;
  ingestEnabled: boolean;
  sourceList: string | null;
  /** Null until the worker first reads the board. */
  boardStatus: BoardStatus | null;
  lastAttemptAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorKind: string | null;
  lastErrorMessage: string | null;
  consecutiveErrors: number;
  totalErrors: number;
  totalRuns: number;
  jobsListed: number;
  jobsKept: number;
  jobsOpen: number;
  consecutiveEmptyLists: number;
}

export interface SourceHealthTotals {
  /** Non-demo companies with an ATS board. */
  companies: number;
  /** Ingest enabled and the last read succeeded (board active or empty) or none yet. */
  active: number;
  /** Last read failed with a transient error. */
  erroring: number;
  /** Board not found, or disabled after repeated not-found reads. */
  dead: number;
  /** Ingest disabled (dropped from the source list, or dead). */
  disabled: number;
  /** Open, non-demo jobs from ATS boards. */
  openJobs: number;
  openJobsByAts: Record<string, number>;
}

export interface SourceHealth {
  generatedAt: Date;
  rows: SourceHealthRow[];
  totals: SourceHealthTotals;
}

/** Per-company board health plus totals, for every non-demo company with an ATS board. */
export async function getSourceHealth(db: Db): Promise<SourceHealth> {
  const boardCompany = and(
    eq(companies.isDemo, false),
    isNotNull(companies.atsType),
    isNotNull(companies.atsBoardToken),
  );

  const [rawRows, openByAts] = await Promise.all([
    db
      .select({
        companyId: companies.id,
        companyName: companies.name,
        slug: companies.slug,
        ats: companies.atsType,
        boardToken: companies.atsBoardToken,
        region: companies.atsRegion,
        ingestEnabled: companies.ingestEnabled,
        sourceList: companies.sourceList,
        boardStatus: companySourceHealth.boardStatus,
        lastAttemptAt: companySourceHealth.lastAttemptAt,
        lastSuccessAt: companySourceHealth.lastSuccessAt,
        lastErrorAt: companySourceHealth.lastErrorAt,
        lastErrorKind: companySourceHealth.lastErrorKind,
        lastErrorMessage: companySourceHealth.lastErrorMessage,
        consecutiveErrors: companySourceHealth.consecutiveErrors,
        totalErrors: companySourceHealth.totalErrors,
        totalRuns: companySourceHealth.totalRuns,
        jobsListed: companySourceHealth.jobsListed,
        jobsKept: companySourceHealth.jobsKept,
        jobsOpen: companySourceHealth.jobsOpen,
        consecutiveEmptyLists: companySourceHealth.consecutiveEmptyLists,
      })
      .from(companies)
      .leftJoin(companySourceHealth, eq(companySourceHealth.companyId, companies.id))
      .where(boardCompany)
      .orderBy(asc(companies.atsType), asc(companies.name)),
    db
      .select({ ats: jobs.source, open: count() })
      .from(jobs)
      .innerJoin(companies, eq(companies.id, jobs.companyId))
      .where(and(boardCompany, eq(jobs.status, "open"), eq(jobs.isDemo, false)))
      .groupBy(jobs.source),
  ]);

  const rows: SourceHealthRow[] = rawRows.map((r) => ({
    ...r,
    ats: r.ats ?? "other",
    boardToken: r.boardToken ?? "",
    consecutiveErrors: r.consecutiveErrors ?? 0,
    totalErrors: r.totalErrors ?? 0,
    totalRuns: r.totalRuns ?? 0,
    jobsListed: r.jobsListed ?? 0,
    jobsKept: r.jobsKept ?? 0,
    jobsOpen: r.jobsOpen ?? 0,
    consecutiveEmptyLists: r.consecutiveEmptyLists ?? 0,
  }));

  const openJobsByAts: Record<string, number> = {};
  let openJobs = 0;
  for (const { ats, open } of openByAts) {
    openJobsByAts[ats] = open;
    openJobs += open;
  }

  const totals: SourceHealthTotals = {
    companies: rows.length,
    active: 0,
    erroring: 0,
    dead: 0,
    disabled: 0,
    openJobs,
    openJobsByAts,
  };
  for (const row of rows) {
    if (!row.ingestEnabled) totals.disabled++;
    if (row.boardStatus === "not-found") totals.dead++;
    else if (row.boardStatus === "erroring") totals.erroring++;
    else if (row.ingestEnabled) totals.active++;
  }

  return { generatedAt: new Date(), rows, totals };
}

/** Open, non-demo ATS jobs per PLAN D10 role family (null family counted as "unclassified"). */
export async function countOpenJobsByRoleFamily(
  db: Db,
): Promise<Array<{ ats: string; roleFamily: string; open: number }>> {
  const family = sql<string>`coalesce(${jobs.roleFamily}, 'unclassified')`;
  const rows = await db
    .select({ ats: jobs.source, roleFamily: family, open: count() })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(
      and(
        eq(jobs.status, "open"),
        eq(jobs.isDemo, false),
        eq(companies.isDemo, false),
        isNotNull(companies.atsType),
      ),
    )
    .groupBy(jobs.source, family)
    .orderBy(asc(jobs.source), asc(family));
  return rows;
}
