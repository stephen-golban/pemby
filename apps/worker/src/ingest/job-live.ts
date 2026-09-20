// Ask whether **one** posting is still on its board. The "closed or fake" flag rule's entry point.
//
// Everything else in `apps/worker/src/ingest/` is keyed on `companyId`: `verify-live` selects
// *boards* whose oldest open job is stale and enqueues a whole board read, and `ingestCompanyBoard`
// writes the answer for every job on that board at once. Nothing took a `jobId` and asked whether
// that one posting still resolves — so this is the one genuinely new entry point PLAN section 6
// needs, and it is deliberately the smallest thing that answers the question.
//
// **It reads and does not write.** No `jobs` row is touched, no `company_source_health` row is
// recorded, nothing is closed. The caller (`flags/rules.ts`) decides what to do with the verdict and
// closes through the kernel's `closeJob`. A read-only checker cannot half-apply a board read, cannot
// race `ingestCompanyBoard`'s transaction, and cannot make one person's report look like a
// scheduled ingestion run in the health table.
//
// **Why the whole board and not the job's own URL.** An ATS job page for a filled role usually still
// answers 200, with prose saying the role is gone; a handful of vendors 404 and a handful redirect
// to the board root. There is no cross-vendor way to read "gone" off one page, and guessing would
// close real jobs. The board listing is the vendor's own answer to exactly this question, it is the
// answer `ingestCompanyBoard` already trusts, and `@pemby/ats` already normalizes it. The cost is
// one board read per `closed_or_fake` flag, which is bounded by how many people file one.
import { getConnector, isAtsError, type BoardRef } from "@pemby/ats";
import { ATS_KINDS, type AtsKind } from "@pemby/core/private-config";
import { boardRefFromSource } from "@pemby/ats";
import { schema, type Db } from "@pemby/db";
import { and, eq } from "drizzle-orm";
import {
  NOT_FOUND_DISABLE_AFTER,
  NOT_FOUND_MIN_SPAN_MS,
  SUSPECT_MIN_OPEN,
  SUSPECT_MISSING_SHARE,
} from "./ingest-board";
import type { HttpClient } from "@pemby/ats";

const { companies, companySourceHealth, jobs } = schema;

const isAtsKind = (value: string): value is AtsKind =>
  (ATS_KINDS as readonly string[]).includes(value);

export type JobLiveVerdict =
  /** The board lists this posting's external id right now. */
  | { kind: "live" }
  /** The board answered, and this posting is not on it — or the board itself is gone. */
  | { kind: "gone"; reason: "not-listed" | "board-not-found" }
  /**
   * The board said the posting is not there, but **the read itself cannot be believed**. Absence
   * proves nothing here, so the caller must not close; it routes the flag to the owner instead.
   *
   * - `empty-or-partial-listing` — the listing came back empty, or most of this board's open
   *   postings are missing from it.
   * - `board-not-found-unconfirmed` — the vendor answered 404 for the whole board, but ingestion
   *   has not seen that persistently, so it may simply be a bad hour at the vendor.
   */
  | {
      kind: "suspect";
      reason: "empty-or-partial-listing";
      openJobs: number;
      missing: number;
      listed: number;
    }
  | { kind: "suspect"; reason: "board-not-found-unconfirmed"; streak: number; spanHours: number }
  /**
   * The question could not be asked. Never a network failure — those throw, so the queue retries.
   * These are standing facts about the row that another attempt will not change.
   */
  | {
      kind: "unknown";
      reason: "job-not-found" | "job-not-open" | "demo" | "no-board" | "connector-missing";
    };

export interface JobLiveDeps {
  db: Db;
  http: HttpClient;
  signal: AbortSignal;
}

/**
 * Whether `jobId` is still listed on its company's board.
 *
 * Throws on a transient board failure (a timeout, a 5xx, a rate limit that outlived its retries) so
 * the caller's queue retries rather than recording a verdict from a failed read. `board-not-found`
 * is not transient and is not an error: it is the vendor saying the whole board is gone, which is
 * the strongest possible "yes, this posting has closed".
 */
export async function checkJobLive(deps: JobLiveDeps, jobId: string): Promise<JobLiveVerdict> {
  const { db, http, signal } = deps;
  const [row] = await db
    .select({
      companyId: jobs.companyId,
      externalId: jobs.externalId,
      status: jobs.status,
      jobIsDemo: jobs.isDemo,
      ats: companies.atsType,
      token: companies.atsBoardToken,
      region: companies.atsRegion,
      companyIsDemo: companies.isDemo,
    })
    .from(jobs)
    .innerJoin(companies, eq(companies.id, jobs.companyId))
    .where(and(eq(jobs.id, jobId)));

  if (!row) return { kind: "unknown", reason: "job-not-found" };
  if (row.jobIsDemo || row.companyIsDemo) return { kind: "unknown", reason: "demo" };
  if (row.status !== "open") return { kind: "unknown", reason: "job-not-open" };
  if (!row.ats || !row.token || !isAtsKind(row.ats)) {
    return { kind: "unknown", reason: "no-board" };
  }

  let connector;
  try {
    connector = getConnector(row.ats);
  } catch {
    // An ATS kind in the database that this build has no connector for. Not an error to retry.
    return { kind: "unknown", reason: "connector-missing" };
  }

  const ref: BoardRef = boardRefFromSource({
    ats: row.ats,
    boardToken: row.token,
    region: row.region === "eu" ? "eu" : "us",
  });

  let listed;
  try {
    listed = await connector.listJobs(ref, { http, signal });
  } catch (error) {
    if (isAtsError(error) && error.kind === "board-not-found") {
      return confirmedNotFound(db, row.companyId);
    }
    throw error;
  }

  // `listJobs` returns every **open** job on the board, so absence is the vendor's own "closed".
  // Compared on `external_id`, the key `ingestCompanyBoard` matches on, not on title or URL: a
  // vendor that re-slugs a URL has not closed the role.
  if (listed.some((j) => j.externalId === row.externalId)) return { kind: "live" };

  return suspectRead(db, row.companyId, row.ats, listed);
}

/**
 * May a 404 for the whole board be treated as this posting being gone?
 *
 * **Only when ingestion has seen the same thing persistently**, at the bar `handleNotFound` already
 * uses and imported from it: `NOT_FOUND_DISABLE_AFTER` consecutive not-found reads spanning at least
 * `NOT_FOUND_MIN_SPAN_MS`. Below that, this returns `suspect` and the caller closes nothing.
 *
 * Without this, the two paths disagreed by a factor no one could defend: the board-wide path needs
 * three not-found reads over a day before it will disable a board and close its postings, while one
 * person's report closed a posting on the **first** 404 it happened to catch. A vendor having a bad
 * hour — an outage, a botched deploy, a CDN rule — answers 404 for boards that are perfectly alive,
 * and a single report must not be able to act on that.
 *
 * **Read-only, like the rest of this file.** It does not stamp `company_source_health`: a person
 * reporting a posting is not a board read, and recording it as one would let flag volume move the
 * streak that ingestion's own decision depends on.
 */
async function confirmedNotFound(db: Db, companyId: string): Promise<JobLiveVerdict> {
  const [health] = await db
    .select({
      streak: companySourceHealth.consecutiveNotFound,
      since: companySourceHealth.notFoundSince,
    })
    .from(companySourceHealth)
    .where(eq(companySourceHealth.companyId, companyId));

  const streak = health?.streak ?? 0;
  const since = health?.since ?? null;
  const spanMs = since === null ? 0 : Date.now() - since.getTime();
  const confirmed = streak >= NOT_FOUND_DISABLE_AFTER && spanMs >= NOT_FOUND_MIN_SPAN_MS;

  return confirmed
    ? { kind: "gone", reason: "board-not-found" }
    : {
        kind: "suspect",
        reason: "board-not-found-unconfirmed",
        streak,
        spanHours: Math.floor(spanMs / 3_600_000),
      };
}

/**
 * Was that read good enough to close a posting on?
 *
 * **The same test as the bulk path's `decideClosing`**, over the same two constants, imported rather
 * than copied: a board with at least `SUSPECT_MIN_OPEN` open postings that answers with an empty
 * listing, or one missing more than `SUSPECT_MISSING_SHARE` of them, is not reporting a closure — it
 * is malfunctioning. SmartRecruiters answers `200 []` for an unknown company, Personio can look
 * empty, and a pagination bug drops a page. Without this, one report from one person closed a real
 * posting on one unlucky read.
 *
 * **Deliberately weaker than the bulk path, and the difference is the point.** `decideClosing`
 * refuses to close on a suspect read *and* requires a second consecutive suspect read at least an
 * hour later before it will act, because it closes every missing posting on the board at once —
 * thousands of rows from one bad response. This closes exactly one posting, on the strength of a
 * person who went and looked, and a wrong close is not permanent: `reopenIfClosed` in
 * `./ingest-board.ts` puts a closed posting back to `open` as soon as any board read lists it
 * again, and `scheduleIngest` reads every enabled board every `INGEST_INTERVAL_HOURS` (6 by
 * default). So the residual — a healthy board that drops exactly this one posting — costs at most
 * one ingest cycle of invisibility, which does not justify the second read's price: the flag would
 * have to stay claimed past `FLAGS_CLAIM_STALE_MINUTES`, which needs a fifth `flag_status` value
 * and an enum migration that must ship in a file of its own.
 *
 * Compared against the raw listing, never the role-filtered `kept` set. `decideClosing` checks both
 * because a role-filter change can strand a board; this path never consults the filter, so it
 * cannot be fooled by one.
 */
async function suspectRead(
  db: Db,
  companyId: string,
  ats: AtsKind,
  listed: readonly { externalId: string }[],
): Promise<JobLiveVerdict> {
  const open = await db
    .select({ externalId: jobs.externalId })
    .from(jobs)
    .where(
      and(
        eq(jobs.companyId, companyId),
        eq(jobs.source, ats),
        eq(jobs.status, "open"),
        eq(jobs.isDemo, false),
      ),
    );
  const listedIds = new Set(listed.map((j) => j.externalId));
  const missing = open.filter((j) => !listedIds.has(j.externalId)).length;
  const suspect =
    open.length >= SUSPECT_MIN_OPEN &&
    (listed.length === 0 || missing > SUSPECT_MISSING_SHARE * open.length);

  return suspect
    ? {
        kind: "suspect",
        reason: "empty-or-partial-listing",
        openJobs: open.length,
        missing,
        listed: listed.length,
      }
    : { kind: "gone", reason: "not-listed" };
}
