// Reads one company's public job board and brings its jobs in the database up to date: role
// filter, detail reads where the list lacks descriptions, upsert, safe closing of jobs that
// disappeared, dedupe, and source health. No AI here.
import {
  boardRefFromSource,
  contentHash,
  getConnector,
  isAtsError,
  type AtsConnector,
  type AtsError,
  type BoardRef,
  type HttpClient,
  type NormalizedJob,
} from "@pemby/ats";
import { classifyRole, type RoleFamily } from "@pemby/core";
import { ATS_KINDS, type AtsKind } from "@pemby/core/private-config";
import { schema, type Db, type NewJob } from "@pemby/db";
import { and, count, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { Tx } from "./db-types";
import { dedupeJob, dedupeKey } from "./dedupe";

const { companies, companySourceHealth, jobs } = schema;

/** Detail reads older than this are refreshed. */
const DETAIL_MAX_AGE_MS = 7 * 24 * 3600 * 1000;
/** A Retry-After up to this long is waited out in the handler; longer ones go to queue backoff. */
const MAX_INLINE_RETRY_AFTER_MS = 2 * 60 * 1000;
/**
 * Close-safety guard (see `decideClosing`). **Exported** because `./job-live.ts` applies the same
 * test to a single posting: two copies of "what makes a board read look false" would drift, and the
 * per-job path exists precisely so one person's report can close a posting.
 */
export const SUSPECT_MIN_OPEN = 3;
export const SUSPECT_MISSING_SHARE = 0.8;
const SUSPECT_CONFIRM_AFTER_MS = 3600 * 1000;
/**
 * Consecutive `board-not-found` reads before the board is disabled and its jobs closed, and the
 * span that streak must cover.
 *
 * **Exported for the same reason as the suspect constants**: `./job-live.ts` asks whether one
 * posting's 404 may be believed, and it must ask it at the bar the bulk path already uses. A second
 * number would mean the board-wide path demands three reads over a day while one person's report
 * acts on the first.
 */
export const NOT_FOUND_DISABLE_AFTER = 3;
export const NOT_FOUND_MIN_SPAN_MS = 24 * 3600 * 1000;
/** Vendor-wide breaker: this share of a vendor's enabled boards not-found in the last hour... */
const VENDOR_NOT_FOUND_SHARE = 0.3;
/** ...counted only once at least this many boards are affected (one board is not an outage). */
const VENDOR_NOT_FOUND_MIN_BOARDS = 3;
/** A board read fails when more than this share of attempted detail reads failed. */
const DETAIL_FAILURE_SHARE = 0.25;
const ERROR_MESSAGE_MAX = 200;
const CHUNK = 200;

export interface IngestContext {
  db: Db;
  http: HttpClient;
  signal: AbortSignal;
  /** Read the board even when ingest is disabled for the company (manual runs). */
  force?: boolean;
}

export interface IngestBoardResult {
  companyId: string;
  ats: AtsKind | null;
  outcome: "ok" | "not-found" | "skipped";
  skipReason?: string;
  listed: number;
  kept: number;
  inserted: number;
  updated: number;
  unchanged: number;
  reopened: number;
  closed: number;
  merged: number;
  detailsFetched: number;
  detailsFailed: number;
  /** The list looked falsely empty and closing was held back. */
  closingHeld: boolean;
  /** The board was disabled after repeated not-found reads. */
  disabled: boolean;
  /** Not-found was due, but the vendor-wide breaker held it back. */
  breakerTripped?: boolean;
}

interface KeptJob {
  job: NormalizedJob;
  family: RoleFamily;
  /** Detail was read in this run. */
  detailFetched: boolean;
  /** List-only data for a job whose stored detail is still fresh: touch liveness only. */
  touchOnly: boolean;
}

function emptyResult(companyId: string, ats: AtsKind | null): IngestBoardResult {
  return {
    companyId,
    ats,
    outcome: "ok",
    listed: 0,
    kept: 0,
    inserted: 0,
    updated: 0,
    unchanged: 0,
    reopened: 0,
    closed: 0,
    merged: 0,
    detailsFetched: 0,
    detailsFailed: 0,
    closingHeld: false,
    disabled: false,
  };
}

export async function ingestCompanyBoard(
  ctx: IngestContext,
  companyId: string,
): Promise<IngestBoardResult> {
  const { db, signal } = ctx;
  const [company] = await db
    .select({
      id: companies.id,
      ats: companies.atsType,
      token: companies.atsBoardToken,
      region: companies.atsRegion,
      ingestEnabled: companies.ingestEnabled,
      isDemo: companies.isDemo,
    })
    .from(companies)
    .where(eq(companies.id, companyId));

  const skip = (reason: string, ats: AtsKind | null = null): IngestBoardResult => ({
    ...emptyResult(companyId, ats),
    outcome: "skipped",
    skipReason: reason,
  });
  if (!company) return skip("company not found");
  if (company.isDemo) return skip("demo company");
  if (!company.ats || !company.token || !isAtsKind(company.ats)) return skip("no ATS board");
  const ats = company.ats;
  if (!company.ingestEnabled && !ctx.force) return skip("ingest disabled", ats);

  const ref = boardRefFromSource({
    ats,
    boardToken: company.token,
    region: company.region === "eu" ? "eu" : "us",
  });
  const result = emptyResult(companyId, ats);
  const attemptAt = new Date();

  let listed: NormalizedJob[];
  let kept: KeptJob[];
  let existing: ExistingJob[];
  try {
    const connector = getConnector(ats);
    listed = uniqueByExternalId(
      await withRetryAfter(signal, () => connector.listJobs(ref, { http: ctx.http, signal })),
    );
    result.listed = listed.length;

    existing = await loadExistingJobs(db, companyId, ats);
    const byExternalId = new Map(existing.map((e) => [e.externalId, e]));

    kept = [];
    for (const job of listed) {
      const verdict = classifyRole({ title: job.title, department: job.department });
      if (!verdict.keep || !verdict.family) continue;
      kept.push({ job, family: verdict.family, detailFetched: false, touchOnly: false });
    }
    result.kept = kept.length;

    kept = await readDetails(ctx, connector, ref, kept, byExternalId, result);
  } catch (error) {
    if (signal.aborted) throw error;
    if (isAtsError(error) && error.kind === "board-not-found") {
      return handleNotFound(db, companyId, ats, attemptAt, error, result);
    }
    await recordFailure(db, companyId, attemptAt, error);
    throw error;
  }

  try {
    await db.transaction(async (tx) => {
      await writeBoard(tx, companyId, ats, attemptAt, listed, kept, existing, result);
    });
  } catch (error) {
    if (signal.aborted) throw error;
    await recordFailure(db, companyId, attemptAt, error);
    throw error;
  }
  return result;
}

interface ExistingJob {
  id: string;
  externalId: string;
  status: "open" | "closed" | "quarantined" | "merged";
  title: string;
  url: string;
  applyUrl: string | null;
  contentHash: string;
  roleFamily: string | null;
  dedupeKey: string | null;
  detailFetchedAt: Date | null;
}

function loadExistingJobs(db: Db, companyId: string, ats: AtsKind): Promise<ExistingJob[]> {
  return db
    .select({
      id: jobs.id,
      externalId: jobs.externalId,
      status: jobs.status,
      title: jobs.title,
      url: jobs.url,
      applyUrl: jobs.applyUrl,
      contentHash: jobs.contentHash,
      roleFamily: jobs.roleFamily,
      dedupeKey: jobs.dedupeKey,
      detailFetchedAt: jobs.detailFetchedAt,
    })
    .from(jobs)
    .where(and(eq(jobs.companyId, companyId), eq(jobs.source, ats), eq(jobs.isDemo, false)));
}

/**
 * For vendors whose list lacks descriptions, read detail for kept jobs that are new, whose title
 * changed, or whose last detail read is older than 7 days; one at a time (the HTTP client limits
 * the rate). A job whose detail read fails is left out when new, or only marked live when already
 * stored. The board fails (for a queue retry) when more than 25% of attempted detail reads failed,
 * or at once on a rate limit the handler could not wait out, so it stops calling the vendor.
 */
async function readDetails(
  ctx: IngestContext,
  connector: AtsConnector,
  ref: BoardRef,
  kept: KeptJob[],
  byExternalId: ReadonlyMap<string, ExistingJob>,
  result: IngestBoardResult,
): Promise<KeptJob[]> {
  const fetchDetail = connector.fetchJobDetail?.bind(connector);
  const now = Date.now();
  const out: KeptJob[] = [];
  let attempted = 0;
  let lastError: unknown;
  for (const item of kept) {
    if (item.job.detailComplete || !fetchDetail) {
      out.push(item);
      continue;
    }
    const prev = byExternalId.get(item.job.externalId);
    const stale =
      !prev ||
      !prev.detailFetchedAt ||
      now - prev.detailFetchedAt.getTime() > DETAIL_MAX_AGE_MS ||
      prev.title !== item.job.title;
    if (!stale) {
      out.push({ ...item, touchOnly: true });
      continue;
    }
    attempted++;
    try {
      const job = await withRetryAfter(ctx.signal, () =>
        fetchDetail(ref, item.job, { http: ctx.http, signal: ctx.signal }),
      );
      result.detailsFetched++;
      out.push({ ...item, job, detailFetched: true });
    } catch (error) {
      if (ctx.signal.aborted) throw error;
      if (!isAtsError(error) || error.kind === "rate-limited" || error.kind === "board-not-found") {
        throw error;
      }
      lastError = error;
      result.detailsFailed++;
      if (prev) out.push({ ...item, touchOnly: true });
    }
  }
  if (attempted > 0 && result.detailsFailed > DETAIL_FAILURE_SHARE * attempted) throw lastError;
  return out;
}

function jobColumns(item: KeptJob, ats: AtsKind, now: Date) {
  const { job } = item;
  return {
    source: ats,
    externalId: job.externalId,
    url: job.url,
    applyUrl: job.applyUrl,
    title: job.title,
    locationText: job.locations.length > 0 ? job.locations.join("; ") : null,
    rawText: job.descriptionText,
    descriptionHtml: job.descriptionHtml,
    locations: job.locations,
    workplaceType: job.workplaceType,
    department: job.department,
    employmentType: job.employmentType,
    salaryMin: job.salary?.min ?? null,
    salaryMax: job.salary?.max ?? null,
    salaryCurrency: job.salary?.currency ?? null,
    salaryPeriod: job.salary?.period ?? null,
    salaryText: job.salary?.text ?? null,
    contentHash: contentHash(job),
    postedAt: job.postedAt,
    sourceUpdatedAt: job.updatedAt,
    roleFamily: item.family,
    dedupeKey: dedupeKey(job.title, job.locations),
    lastVerifiedLiveAt: now,
    ...(item.detailFetched ? { detailFetchedAt: now } : {}),
  } satisfies Partial<NewJob>;
}

const STALE_CANONICAL_MS = 12 * 3600 * 1000;

/**
 * Exported for `check:sql`, which drives this against real rows rather than re-typing its two
 * UPDATEs into a fixture. The statements here are the ones that decide whether a quarantine can be
 * undone with nobody deciding it, and `tsc` cannot see inside either of them.
 */
export async function promoteMergedJobs(
  tx: Tx,
  companyId: string,
  ats: AtsKind,
  externalIds: readonly string[],
  now: Date,
): Promise<string[]> {
  const promotedIds: string[] = [];
  const canonical = alias(jobs, "canonical");
  for (let i = 0; i < externalIds.length; i += 5000) {
    const rows = await tx
      .select({
        id: jobs.id,
        canonicalId: canonical.id,
        canonicalStatus: canonical.status,
        canonicalVerifiedAt: canonical.lastVerifiedLiveAt,
      })
      .from(jobs)
      .leftJoin(canonical, eq(canonical.id, jobs.duplicateOfJobId))
      .where(
        and(
          eq(jobs.companyId, companyId),
          eq(jobs.source, ats),
          eq(jobs.status, "merged"),
          inArray(jobs.externalId, externalIds.slice(i, i + 5000)),
        ),
      );

    for (const row of rows) {
      if (!row.canonicalId || row.canonicalStatus === "closed") {
        const done = await tx
          .update(jobs)
          .set({ status: "open", duplicateOfJobId: null, closedAt: null })
          .where(and(eq(jobs.id, row.id), eq(jobs.status, "merged")))
          .returning({ id: jobs.id });
        if (done.length > 0) {
          promotedIds.push(row.id);
          // Siblings that pointed at the closed canonical follow this job.
          if (row.canonicalId) {
            await tx
              .update(jobs)
              .set({ duplicateOfJobId: row.id })
              .where(
                and(
                  eq(jobs.duplicateOfJobId, row.canonicalId),
                  ne(jobs.id, row.id),
                  eq(jobs.status, "merged"),
                ),
              );
          }
        }
        continue;
      }
      const stale =
        row.canonicalStatus === "open" &&
        (!row.canonicalVerifiedAt ||
          now.getTime() - row.canonicalVerifiedAt.getTime() > STALE_CANONICAL_MS);
      if (!stale) continue;

      // Swap: this copy takes the stale canonical's place, and the canonical is merged into it.
      //
      // **Promote first, and guarded.** The two halves have different standing and it matters which
      // is which, so that nobody later reads this comment as evidence of a bug that was happening.
      //
      // The `status` predicate is **defensive, and no current writer can reach past it.** The
      // promote used to have none, which made it the one status write in this file that could move
      // a job out of `quarantined` with nobody deciding it. But the SELECT above already filters
      // `status = 'merged'`, and nothing in the codebase moves a job `merged -> quarantined`:
      // `dedupeJob` and `quarantineJob` both require `status = 'open'`. So reaching it needs a
      // concurrent writer that does not exist today. It is a latent hazard, not a demonstrated
      // one — it could not be made to fail — and the guard is here because every sibling write has
      // one (the demote below on `open`, the promote at the top of this function on `merged`, both
      // close paths on `open`) and because the next writer should not have to rediscover why.
      //
      // The **ordering** is a fix for a real problem. With the demote first, a guarded promote that
      // matched nothing left the canonical demoted and **no open job in the group at all**. In this
      // order, a promote that matches nothing changes nothing and the loop moves on.
      //
      const promoted = await tx
        .update(jobs)
        .set({ status: "open", duplicateOfJobId: null, closedAt: null })
        .where(and(eq(jobs.id, row.id), eq(jobs.status, "merged")))
        .returning({ id: jobs.id });
      if (promoted.length === 0) continue;

      const demoted = await tx
        .update(jobs)
        .set({ status: "merged", duplicateOfJobId: row.id })
        .where(and(eq(jobs.id, row.canonicalId), eq(jobs.status, "open")))
        .returning({ id: jobs.id });

      // A demote that matched nothing means the canonical changed under us, and the group now holds
      // two open jobs for one moment. That is recoverable and is recovered: `row.id` goes into
      // `toDedupe` below, and `dedupeJob` re-merges the group at the end of the board write. The
      // siblings are only re-pointed when the swap actually happened.
      if (demoted.length > 0) {
        await tx
          .update(jobs)
          .set({ duplicateOfJobId: row.id })
          .where(
            and(
              eq(jobs.duplicateOfJobId, row.canonicalId),
              ne(jobs.id, row.id),
              eq(jobs.status, "merged"),
            ),
          );
      }
      promotedIds.push(row.id);
    }
  }
  return promotedIds;
}

interface ClosingDecision {
  suspect: boolean;
  allowClose: boolean;
  consecutiveEmptyLists: number;
  emptyListSince: Date | null;
}

/**
 * Guard against closing a board's jobs because of one bad read. A successful read is suspect
 * when the company had at least 3 open jobs and the board came back empty, or more than 80% of
 * them are missing from the listed jobs or from the jobs the role filter kept (SmartRecruiters
 * answers 200 [] for unknown companies; Personio can look empty; a broken mapping or filter
 * change can drop every job).
 * Jobs then close only when a second consecutive suspect read comes at least 1 hour after the
 * first; verify-live re-reads such a board hourly because its jobs stay unverified.
 */
function decideClosing(
  open: readonly ExistingJob[],
  listed: readonly NormalizedJob[],
  kept: readonly KeptJob[],
  health: { consecutiveEmptyLists: number; emptyListSince: Date | null } | undefined,
  now: Date,
): ClosingDecision {
  const listedIds = new Set(listed.map((j) => j.externalId));
  const keptIds = new Set(kept.map((k) => k.job.externalId));
  const missingListed = open.filter((j) => !listedIds.has(j.externalId)).length;
  const missingKept = open.filter((j) => !keptIds.has(j.externalId)).length;
  const limit = SUSPECT_MISSING_SHARE * open.length;
  const suspect =
    open.length >= SUSPECT_MIN_OPEN &&
    (listed.length === 0 || missingListed > limit || missingKept > limit);
  if (!suspect) {
    return { suspect, allowClose: true, consecutiveEmptyLists: 0, emptyListSince: null };
  }
  const streak = (health?.consecutiveEmptyLists ?? 0) + 1;
  const since = health?.emptyListSince ?? now;
  const allowClose = streak >= 2 && now.getTime() - since.getTime() >= SUSPECT_CONFIRM_AFTER_MS;
  return { suspect, allowClose, consecutiveEmptyLists: streak, emptyListSince: since };
}

async function writeBoard(
  tx: Tx,
  companyId: string,
  ats: AtsKind,
  now: Date,
  listed: readonly NormalizedJob[],
  kept: readonly KeptJob[],
  existing: readonly ExistingJob[],
  result: IngestBoardResult,
): Promise<void> {
  const byExternalId = new Map(existing.map((e) => [e.externalId, e]));
  const toDedupe = new Set<string>();

  // New jobs.
  const fresh = kept.filter((k) => !byExternalId.has(k.job.externalId));
  for (let i = 0; i < fresh.length; i += CHUNK) {
    const rows = await tx
      .insert(jobs)
      .values(
        fresh.slice(i, i + CHUNK).map((k) => ({
          ...jobColumns(k, ats, now),
          companyId,
          firstSeenAt: now,
        })),
      )
      .onConflictDoNothing({ target: [jobs.companyId, jobs.source, jobs.externalId] })
      .returning({ id: jobs.id });
    result.inserted += rows.length;
    for (const r of rows) toDedupe.add(r.id);
  }

  // Reopen decided at write time: a job merged or quarantined since it was loaded stays as it is.
  const reopenIfClosed = {
    status: sql`case when ${jobs.status} = 'closed' then 'open'::job_status else ${jobs.status} end`,
    closedAt: sql`case when ${jobs.status} = 'closed' then null else ${jobs.closedAt} end`,
    duplicateOfJobId: sql`case when ${jobs.status} = 'closed' then null else ${jobs.duplicateOfJobId} end`,
  };

  // Stored jobs: full update when something changed, otherwise only liveness.
  const touchIds: string[] = [];
  for (const item of kept) {
    const prev = byExternalId.get(item.job.externalId);
    if (!prev) continue;
    const reopen = prev.status === "closed";
    if (reopen) result.reopened++;

    const cols = item.touchOnly ? null : jobColumns(item, ats, now);
    const changed =
      cols !== null &&
      (cols.contentHash !== prev.contentHash ||
        cols.roleFamily !== prev.roleFamily ||
        cols.dedupeKey !== prev.dedupeKey ||
        cols.url !== prev.url ||
        cols.applyUrl !== prev.applyUrl ||
        item.detailFetched);

    if (cols && changed) {
      await tx
        .update(jobs)
        .set({ ...cols, ...reopenIfClosed })
        .where(eq(jobs.id, prev.id));
      result.updated++;
      if (cols.contentHash !== prev.contentHash || cols.dedupeKey !== prev.dedupeKey || reopen) {
        toDedupe.add(prev.id);
      }
    } else {
      touchIds.push(prev.id);
      result.unchanged++;
      if (reopen) toDedupe.add(prev.id);
    }
  }
  for (let i = 0; i < touchIds.length; i += 1000) {
    await tx
      .update(jobs)
      .set({ lastVerifiedLiveAt: now, ...reopenIfClosed })
      .where(inArray(jobs.id, touchIds.slice(i, i + 1000)));
  }

  // A merged job still on the board takes its canonical's place when the canonical is gone or
  // closed (never when it is quarantined), or when the canonical is open but has not been verified
  // live for 12 hours while this copy just was.
  const keptExternalIds = kept.map((k) => k.job.externalId);
  for (const id of await promoteMergedJobs(tx, companyId, ats, keptExternalIds, now)) {
    toDedupe.add(id);
  }

  // Close open jobs that left the board (or the role filter), unless the read looks false.
  const [health] = await tx
    .select({
      consecutiveEmptyLists: companySourceHealth.consecutiveEmptyLists,
      emptyListSince: companySourceHealth.emptyListSince,
    })
    .from(companySourceHealth)
    .where(eq(companySourceHealth.companyId, companyId));
  const open = existing.filter((e) => e.status === "open");
  const decision = decideClosing(open, listed, kept, health, now);
  result.closingHeld = !decision.allowClose;
  if (decision.allowClose) {
    const keptSet = new Set(keptExternalIds);
    const gone = open.filter((e) => !keptSet.has(e.externalId)).map((e) => e.id);
    for (let i = 0; i < gone.length; i += 1000) {
      const closed = await tx
        .update(jobs)
        .set({ status: "closed", closedAt: now })
        .where(and(inArray(jobs.id, gone.slice(i, i + 1000)), eq(jobs.status, "open")))
        .returning({ id: jobs.id });
      result.closed += closed.length;
    }
  }

  for (const id of toDedupe) {
    const merged = await dedupeJob(tx, id);
    if (merged) result.merged += merged.mergedIds.length;
  }

  const [openCount] = await tx
    .select({ n: count() })
    .from(jobs)
    .where(and(eq(jobs.companyId, companyId), eq(jobs.status, "open"), eq(jobs.isDemo, false)));

  const healthValues = {
    lastAttemptAt: now,
    lastSuccessAt: now,
    consecutiveErrors: 0,
    consecutiveNotFound: 0,
    notFoundSince: null,
    jobsListed: listed.length,
    jobsKept: result.kept,
    jobsOpen: openCount?.n ?? 0,
    boardStatus: listed.length === 0 ? ("empty" as const) : ("active" as const),
    consecutiveEmptyLists: decision.consecutiveEmptyLists,
    emptyListSince: decision.emptyListSince,
  };
  await tx
    .insert(companySourceHealth)
    .values({ companyId, ...healthValues, totalRuns: 1 })
    .onConflictDoUpdate({
      target: companySourceHealth.companyId,
      set: { ...healthValues, totalRuns: sql`${companySourceHealth.totalRuns} + 1` },
    });
}

/**
 * The board root answered 404/410 (or the vendor's equivalent). Jobs stay open until the streak
 * has 3 consecutive not-found reads spanning at least 24 hours; then its open jobs close and the
 * board is disabled. Never while the vendor looks down as a whole: when at least 3 boards and
 * more than 30% of the vendor's enabled boards were not-found within the last hour.
 */
async function handleNotFound(
  db: Db,
  companyId: string,
  ats: AtsKind,
  now: Date,
  error: AtsError,
  result: IngestBoardResult,
): Promise<IngestBoardResult> {
  return db.transaction(async (tx) => {
    const message = safeErrorMessage(error);
    const [row] = await tx
      .insert(companySourceHealth)
      .values({
        companyId,
        lastAttemptAt: now,
        lastErrorAt: now,
        lastErrorKind: error.kind,
        lastErrorMessage: message,
        consecutiveErrors: 1,
        consecutiveNotFound: 1,
        notFoundSince: now,
        totalErrors: 1,
        totalRuns: 1,
        boardStatus: "not-found",
      })
      .onConflictDoUpdate({
        target: companySourceHealth.companyId,
        set: {
          lastAttemptAt: now,
          lastErrorAt: now,
          lastErrorKind: error.kind,
          lastErrorMessage: message,
          consecutiveErrors: sql`${companySourceHealth.consecutiveErrors} + 1`,
          consecutiveNotFound: sql`${companySourceHealth.consecutiveNotFound} + 1`,
          notFoundSince: sql`coalesce(${companySourceHealth.notFoundSince}, ${now.toISOString()}::timestamptz)`,
          totalErrors: sql`${companySourceHealth.totalErrors} + 1`,
          totalRuns: sql`${companySourceHealth.totalRuns} + 1`,
          boardStatus: "not-found",
          consecutiveEmptyLists: 0,
          emptyListSince: null,
        },
      })
      .returning({
        consecutiveNotFound: companySourceHealth.consecutiveNotFound,
        notFoundSince: companySourceHealth.notFoundSince,
      });

    const out: IngestBoardResult = { ...result, outcome: "not-found" };
    const since = row?.notFoundSince ?? now;
    const due =
      (row?.consecutiveNotFound ?? 0) >= NOT_FOUND_DISABLE_AFTER &&
      now.getTime() - since.getTime() >= NOT_FOUND_MIN_SPAN_MS;
    if (!due) return out;

    const [vendor] = await tx
      .select({
        enabled: count(),
        notFound:
          sql<number>`count(*) filter (where ${companySourceHealth.boardStatus} = 'not-found' and ${companySourceHealth.lastErrorAt} >= ${now.toISOString()}::timestamptz - interval '1 hour')`.mapWith(
            Number,
          ),
      })
      .from(companies)
      .leftJoin(companySourceHealth, eq(companySourceHealth.companyId, companies.id))
      .where(
        and(
          eq(companies.atsType, ats),
          eq(companies.ingestEnabled, true),
          eq(companies.isDemo, false),
          isNotNull(companies.atsBoardToken),
        ),
      );
    const notFound = vendor?.notFound ?? 0;
    const enabled = vendor?.enabled ?? 0;
    if (notFound >= VENDOR_NOT_FOUND_MIN_BOARDS && notFound > VENDOR_NOT_FOUND_SHARE * enabled) {
      console.warn(
        `not-found breaker: ${ats} has ${notFound}/${enabled} enabled boards not-found in the last hour; not disabling company=${companyId}`,
      );
      out.breakerTripped = true;
      return out;
    }

    const closed = await tx
      .update(jobs)
      .set({ status: "closed", closedAt: now })
      .where(
        and(
          eq(jobs.companyId, companyId),
          eq(jobs.source, ats),
          eq(jobs.status, "open"),
          eq(jobs.isDemo, false),
        ),
      )
      .returning({ id: jobs.id });
    await tx
      .update(companies)
      .set({ ingestEnabled: false })
      .where(and(eq(companies.id, companyId), eq(companies.isDemo, false)));
    await tx
      .update(companySourceHealth)
      .set({ jobsOpen: 0 })
      .where(eq(companySourceHealth.companyId, companyId));
    out.closed = closed.length;
    out.disabled = true;
    return out;
  });
}

/** Records a failed read in a write of its own (the board transaction, if any, rolled back). */
async function recordFailure(db: Db, companyId: string, now: Date, error: unknown): Promise<void> {
  const kind = isAtsError(error) ? error.kind : "internal";
  const message = safeErrorMessage(error);
  try {
    await db
      .insert(companySourceHealth)
      .values({
        companyId,
        lastAttemptAt: now,
        lastErrorAt: now,
        lastErrorKind: kind,
        lastErrorMessage: message,
        consecutiveErrors: 1,
        totalErrors: 1,
        totalRuns: 1,
        boardStatus: "erroring",
      })
      .onConflictDoUpdate({
        target: companySourceHealth.companyId,
        set: {
          lastAttemptAt: now,
          lastErrorAt: now,
          lastErrorKind: kind,
          lastErrorMessage: message,
          consecutiveErrors: sql`${companySourceHealth.consecutiveErrors} + 1`,
          // Any other failure breaks a not-found streak.
          consecutiveNotFound: 0,
          notFoundSince: null,
          totalErrors: sql`${companySourceHealth.totalErrors} + 1`,
          totalRuns: sql`${companySourceHealth.totalRuns} + 1`,
          boardStatus: "erroring",
        },
      });
  } catch (writeError) {
    // The original error matters more; the queue retries either way.
    console.error(
      `source health write failed for company=${companyId}: ${writeError instanceof Error ? writeError.name : "error"}`,
    );
  }
}

/** Short and body-free: parse errors can quote the response, so they keep only their kind. */
export function safeErrorMessage(error: unknown): string {
  let message: string;
  if (isAtsError(error)) {
    message =
      error.kind === "parse"
        ? "response did not match the expected shape"
        : error.message.replace(/^\[[^\]]*\]\s*[a-z-]+:\s*/, "");
  } else if (error instanceof Error) {
    message = `${error.name}: ${error.message}`;
  } else {
    message = "unknown error";
  }
  return message.replace(/\s+/g, " ").slice(0, ERROR_MESSAGE_MAX);
}

function isAtsKind(value: string): value is AtsKind {
  return (ATS_KINDS as readonly string[]).includes(value);
}

function uniqueByExternalId(list: NormalizedJob[]): NormalizedJob[] {
  const seen = new Set<string>();
  return list.filter((j) => (seen.has(j.externalId) ? false : (seen.add(j.externalId), true)));
}

/** Runs `fn`; on a short Retry-After, waits it out once and runs it again. */
async function withRetryAfter<T>(signal: AbortSignal, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (
      isAtsError(error) &&
      error.kind === "rate-limited" &&
      error.retryAfterMs !== undefined &&
      error.retryAfterMs <= MAX_INLINE_RETRY_AFTER_MS
    ) {
      await sleep(error.retryAfterMs, signal);
      return fn();
    }
    throw error;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
