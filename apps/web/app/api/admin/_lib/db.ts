// Database side of `/api/admin`.
//
// **Every read here is a `@pemby/db` helper taking a `Db`.** This file writes no SQL of its own,
// which is unusual for an `_lib/db.ts` in this app — the Brief and the profile reach for raw SQL on
// `getDb().$client` because their questions are per-surface. These five are not: `selectFlagsForReview`,
// `selectQuarantinedJobs` and `selectDeliveryFailures` are the admin helpers the db kernel published
// for this page, and `getSourceHealth` and `aiUsageTotals` already existed. A second copy of any of
// them here would be a second answer to a question that has one.
//
// **The cap comes from `readDailyCapUsd()`, and `ai_cap_alerts` is not read at all.** That table
// holds a row for 2026-09-17 with `cap_usd = 0.000000`, written by a forced-zero-cap test, so a
// panel rendering "cap hit" from it would show a breach that never happened. Today's spend against
// the configured cap is the honest form of the same question, and it is the only one offered.
//
// **Demo rows are shown, marked, never dropped.** That is the deliberate inversion described at
// `packages/db/src/queries/admin.ts:9`: demo exclusion is a correctness requirement for a rule that
// spends money or changes a real job, and these panels do neither. On staging four of five users
// are seeded, so a filter would leave the owner looking at empty panels with no way to tell
// "nothing happened" from "nothing is shown". Every row carries `isDemo` and the page stamps it.

import { AiConfigError, countsTowardDailyCap, readDailyCapUsd, utcDay } from "@pemby/ai";
import {
  aiUsageTotals,
  getDb,
  getSourceHealth,
  quarantineJob,
  recordFlagOutcome,
  releaseJob,
  selectDeliveryFailures,
  selectFlagForOwner,
  selectFlagsForReview,
  selectQuarantinedJobs,
} from "@pemby/db";
import type { AiUsageTotalsRow, FlagStatus, SourceHealthRow } from "@pemby/db";
import type {
  AdminAutomatedActionRow,
  AdminBoardRow,
  AdminDeliveryFailureRow,
  AdminFlagAction,
  AdminFlagRow,
  AdminPanel,
  AdminQuarantinedJobRow,
  AdminSourceHealth,
  AdminSpend,
  AdminSpendTaskRow,
  AdminView,
  BoardConcern,
  LoggedFlagAction,
} from "./view";

/**
 * The flag states the **kernel** lets the owner write a verdict from.
 *
 * It mirrors `VERDICT_FROM.owner` in `packages/db/src/queries/flags.ts` and exists only so this
 * surface can draw a button exactly where one will work. It is not a second permission check: the
 * kernel still decides, and every write here passes `by: "owner"` so it is judged against that same
 * table rather than against the automation's narrower one.
 *
 * **It was `["open"]`, and that was the defect.** The kernel gained `by: "owner"` and nothing in
 * `apps/web` passed it, so the queue sorted escalated flags first and then refused every one of
 * them — the rows most in need of a person were the only rows a person could not touch.
 */
const OWNER_VERDICT_FROM: readonly FlagStatus[] = ["open", "needs_review", "auto_resolved"];

/**
 * `approve` quarantines the post, so it is offered only where the post is still live enough for
 * that to mean anything. An `auto_resolved` flag has already had its consequence; re-deciding it is
 * a dismissal or nothing.
 */
const APPROVE_FROM: readonly FlagStatus[] = ["open", "needs_review"];

/** Actions that changed a real company's business with no human in the loop. */
const HEAVY_ACTIONS: readonly LoggedFlagAction[] = ["job_closed", "quarantined", "tier_downgraded"];

/**
 * Actions worth logging as events. `none` is a rule deciding there was nothing to do, and
 * `sent_to_review` is a rule handing the flag to a person — that one belongs in the queue, where it
 * already is, not in a log of things that happened without one.
 */
const LOGGED_ACTIONS: readonly LoggedFlagAction[] = [
  "job_closed",
  "quarantined",
  "tier_downgraded",
  "re_enriched",
  "reverification_queued",
  "merged",
];

/**
 * Whether this deploy can put a quarantined post back.
 *
 * `releaseJob` is imported from the kernel and is present, so this is `true` — but the check and the
 * `release_unavailable` branch behind it stay. They were built while the helper did not exist, and
 * they are what stopped a control being drawn that could only fail; a branch that answers honestly
 * when a dependency is missing is worth keeping after the dependency arrives, because the next
 * missing one is discovered by the deploy rather than by the owner.
 *
 * The guard that matters is inside the helper — `where status = 'quarantined'` — so a release can
 * never resurrect a closed or merged post, and this surface does not re-implement that rule.
 */
const RELEASE_AVAILABLE = typeof releaseJob === "function";

/** Most rows any one panel puts on screen. A guard, not a page size; none of them paginates. */
const FLAG_LIMIT = 50;
const AUTOMATED_LIMIT = 200;
const QUARANTINE_LIMIT = 50;
const DELIVERY_LIMIT = 100;
const BOARD_ATTENTION_LIMIT = 40;

/** How far back the delivery-failure panel looks. */
export const DELIVERY_WINDOW_DAYS = 7;

/**
 * How far back the automated-actions log looks.
 *
 * **A real filter, on the column the order sorts by.** `order: "history"` sorts by `resolved_at desc`
 * and `since` bounds that same column, which is the pairing that makes this number mean what the
 * copy says: a flag filed forty days ago and actioned this morning is in the window, and it is
 * precisely the row the reader came for. Bounding on `created_at` instead would drop it.
 */
export const AUTOMATED_WINDOW_DAYS = 30;

/** A board whose last successful read is older than this is stale, whatever its status says. */
const BOARD_STALE_HOURS = 24;

const iso = (at: Date): string => at.toISOString();
const isoOrNull = (at: Date | null): string | null => (at === null ? null : at.toISOString());

/** Midnight UTC of the day containing `now`. The cap is a UTC-day cap (`@pemby/ai`, `utcDay`). */
function startOfUtcDay(now: Date): Date {
  return new Date(`${utcDay(now)}T00:00:00.000Z`);
}

/**
 * Today's AI spend against the real cap, and the same spend by task.
 *
 * `spentUsd` **excludes spend on a user's own key**, because `countsTowardDailyCap` excludes it
 * from the cap itself (`packages/ai/src/cost.ts:30`). Adding it here would show the owner a number
 * that no mechanism enforces, and would read as a cap being approached on money Pemby never spent.
 * It is reported separately instead, so it is visible without being counted.
 */
function summarizeSpend(rows: AiUsageTotalsRow[], now: Date): AdminSpend {
  let capUsd: number | null = null;
  let capError: AdminSpend["capError"] = null;
  try {
    capUsd = readDailyCapUsd();
  } catch (error) {
    // A misconfigured cap is a named problem on one panel, not a 500 that takes the other four
    // down with it. Anything other than a config error is a real fault and is not swallowed.
    if (!(error instanceof AiConfigError)) throw error;
    capError = "invalid_cap_config";
  }

  const byTask = new Map<string, AdminSpendTaskRow>();
  let spentUsd = 0;
  let userKeyUsd = 0;
  let calls = 0;

  for (const row of rows) {
    const counts = countsTowardDailyCap(row.keyClass);
    if (counts) spentUsd += row.costUsd;
    else userKeyUsd += row.costUsd;
    calls += row.calls;

    const existing = byTask.get(row.task);
    if (existing) {
      existing.calls += row.calls;
      existing.costUsd += row.costUsd;
      existing.inputTokens += row.inputTokens;
      existing.outputTokens += row.outputTokens;
      if (!existing.keyClasses.includes(row.keyClass)) existing.keyClasses.push(row.keyClass);
      existing.countsTowardCap ||= counts;
    } else {
      byTask.set(row.task, {
        task: row.task,
        calls: row.calls,
        costUsd: row.costUsd,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        keyClasses: [row.keyClass],
        countsTowardCap: counts,
      });
    }
  }

  return {
    day: utcDay(now),
    capUsd,
    capError,
    spentUsd,
    userKeyUsd,
    calls,
    byTask: [...byTask.values()].sort(
      (a, b) => b.costUsd - a.costUsd || a.task.localeCompare(b.task),
    ),
  };
}

/**
 * Why a board would be worth the owner's attention, or null when it is fine.
 *
 * Ordered by urgency rather than by how the row is stored: a board erroring right now matters more
 * than one that was switched off on purpose. `consecutiveErrors > 0` counts as erroring even when
 * `board_status` says otherwise, because the status is what the last read wrote and the counter is
 * what has been happening.
 */
function boardConcern(row: SourceHealthRow, now: Date): BoardConcern | null {
  if (row.boardStatus === "erroring" || row.consecutiveErrors > 0) return "erroring";
  if (row.boardStatus === "not-found") return "not-found";
  if (!row.ingestEnabled) return "disabled";
  const staleBefore = now.getTime() - BOARD_STALE_HOURS * 60 * 60 * 1000;
  if (row.lastSuccessAt === null || row.lastSuccessAt.getTime() < staleBefore) return "stale";
  if (row.boardStatus === "empty" || row.consecutiveEmptyLists > 0) return "empty";
  return null;
}

function summarizeBoards(
  health: Awaited<ReturnType<typeof getSourceHealth>>,
  now: Date,
): AdminSourceHealth {
  const concerned: AdminBoardRow[] = [];
  for (const row of health.rows) {
    const concern = boardConcern(row, now);
    if (concern === null) continue;
    concerned.push({
      companyId: row.companyId,
      companyName: row.companyName,
      ats: row.ats,
      boardStatus: row.boardStatus,
      ingestEnabled: row.ingestEnabled,
      consecutiveErrors: row.consecutiveErrors,
      totalErrors: row.totalErrors,
      totalRuns: row.totalRuns,
      jobsOpen: row.jobsOpen,
      consecutiveEmptyLists: row.consecutiveEmptyLists,
      lastAttemptAt: isoOrNull(row.lastAttemptAt),
      lastSuccessAt: isoOrNull(row.lastSuccessAt),
      lastErrorKind: row.lastErrorKind,
      concern,
    });
  }
  // Worst first, then the board that has been failing longest.
  const rank: Record<BoardConcern, number> = {
    erroring: 0,
    "not-found": 1,
    disabled: 2,
    stale: 3,
    empty: 4,
  };
  concerned.sort(
    (a, b) => rank[a.concern] - rank[b.concern] || b.consecutiveErrors - a.consecutiveErrors,
  );

  return {
    generatedAt: iso(health.generatedAt),
    totals: health.totals,
    needsAttention: concerned.slice(0, BOARD_ATTENTION_LIMIT),
    healthy: health.rows.length - concerned.length,
    truncated: concerned.length > BOARD_ATTENTION_LIMIT,
  };
}

function toFlagRow(row: Awaited<ReturnType<typeof selectFlagsForReview>>[number]): AdminFlagRow {
  return {
    flagId: row.flagId,
    jobId: row.jobId,
    jobTitle: row.jobTitle,
    jobUrl: row.jobUrl,
    jobStatus: row.jobStatus,
    companyName: row.companyName,
    reason: row.reason,
    country: row.country,
    field: row.field,
    fieldValue: row.fieldValue,
    note: row.note,
    weight: row.weight,
    status: row.status,
    actionTaken: row.actionTaken,
    claimAttempts: row.claimAttempts,
    automation: row.automation,
    createdAt: iso(row.createdAt),
    isDemo: row.isDemo,
    actionable: OWNER_VERDICT_FROM.includes(row.status),
    jobQuarantined: row.jobStatus === "quarantined",
    evidenceRows: row.evidenceRows,
  };
}

/**
 * The automated-actions log, built from the same kernel query as the review queue with its
 * `statuses` widened and its `order` set to `history`. No new helper was needed; the kernel
 * documents `auto_resolved` as the one reason to widen the statuses.
 *
 * **The ordering is the kernel's, not this file's.** It used to sort here, by when the flag was
 * *filed*, because the row carried no decision time — which meant the query selected the oldest
 * `limit` rows and this sort then put the oldest verdicts under a heading saying "recent". A local
 * sort cannot fix a wrong page; only the order the limit is applied against can. It is now
 * `resolved_at desc` inside the query, and the rows are taken as they come.
 *
 * The `action_taken` filter stays here: the kernel has no parameter for it, and dropping the rules
 * that decided there was nothing to do is a question about what counts as an event, not about what
 * is in the table.
 */
function toAutomatedRows(
  rows: Awaited<ReturnType<typeof selectFlagsForReview>>,
): AdminAutomatedActionRow[] {
  return rows
    .filter(
      (row): row is (typeof rows)[number] & { actionTaken: LoggedFlagAction } =>
        row.actionTaken !== null && LOGGED_ACTIONS.includes(row.actionTaken as LoggedFlagAction),
    )
    .map((row) => ({
      flagId: row.flagId,
      jobId: row.jobId,
      jobTitle: row.jobTitle,
      jobUrl: row.jobUrl,
      jobStatus: row.jobStatus,
      companyName: row.companyName,
      reason: row.reason,
      country: row.country,
      weight: row.weight,
      actionTaken: row.actionTaken,
      createdAt: iso(row.createdAt),
      // `history` excludes rows with no `resolved_at`, so this is never the fallback in practice;
      // the fallback exists so the type is honest rather than asserted.
      resolvedAt: iso(row.resolvedAt ?? row.createdAt),
      evidenceRows: row.evidenceRows,
      isDemo: row.isDemo,
      heavy: HEAVY_ACTIONS.includes(row.actionTaken),
      undoable: OWNER_VERDICT_FROM.includes(row.status),
      jobQuarantined: row.jobStatus === "quarantined",
    }));
}

function toQuarantinedRow(
  row: Awaited<ReturnType<typeof selectQuarantinedJobs>>[number],
): AdminQuarantinedJobRow {
  return {
    jobId: row.jobId,
    title: row.title,
    url: row.url,
    companyName: row.companyName,
    updatedAt: iso(row.updatedAt),
    firstSeenAt: iso(row.firstSeenAt),
    flagCount: row.flagCount,
    flagWeight: row.flagWeight,
    flagReasons: row.flagReasons,
    isDemo: row.isDemo,
    releasable: RELEASE_AVAILABLE,
  };
}

function toDeliveryRow(
  row: Awaited<ReturnType<typeof selectDeliveryFailures>>[number],
): AdminDeliveryFailureRow {
  return {
    deliveryId: row.deliveryId,
    matchId: row.matchId,
    channelType: row.channelType,
    error: row.error,
    createdAt: iso(row.createdAt),
    jobTitle: row.jobTitle,
    companyName: row.companyName,
    isDemo: row.isDemo,
  };
}

/**
 * One panel's read, isolated.
 *
 * A page that shows five independent answers should not go blank because one of them is
 * unavailable, and it must never let an unavailable panel render as an empty one — "nothing
 * happened" and "nothing could be read" are the two states this whole surface exists to
 * distinguish. So each read is caught here, its panel is named in `failedPanels`, and the caller
 * gets the fallback.
 *
 * The log carries the error's **name and Postgres code only**. Nothing on these panels is personal
 * data, but a driver error quotes the statement it failed on, and a statement is not something to
 * put in a log line by reflex.
 */
async function panel<T>(name: AdminPanel, read: Promise<T>, fallback: T): Promise<[T, boolean]> {
  try {
    return [await read, false];
  } catch (error) {
    console.error("[admin] panel read failed", {
      panel: name,
      error: error instanceof Error ? error.name : "error",
      code:
        typeof (error as { code?: unknown }).code === "string"
          ? (error as { code: string }).code
          : null,
    });
    return [fallback, true];
  }
}

const EMPTY_BOARD_TOTALS = {
  companies: 0,
  active: 0,
  erroring: 0,
  dead: 0,
  disabled: 0,
  openJobs: 0,
  openJobsByAts: {},
};

/** Every panel, read once, off one clock; a panel that throws is named rather than silently empty. */
export async function loadAdminView(now = new Date()): Promise<AdminView> {
  const db = getDb();
  const deliverySince = new Date(now.getTime() - DELIVERY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const automatedSince = new Date(now.getTime() - AUTOMATED_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const [
    [flags, flagsFailed],
    [automated, automatedFailed],
    [quarantined, quarantinedFailed],
    [usage, spendFailed],
    [health, sourceFailed],
    [failures, deliveryFailed],
  ] = await Promise.all([
    panel("flags", selectFlagsForReview(db, FLAG_LIMIT), []),
    panel(
      "automatedActions",
      selectFlagsForReview(db, AUTOMATED_LIMIT, {
        statuses: ["auto_resolved"],
        order: "history",
        since: automatedSince,
      }),
      [],
    ),
    panel("quarantined", selectQuarantinedJobs(db, QUARANTINE_LIMIT), []),
    panel("spend", aiUsageTotals(db, { since: startOfUtcDay(now) }), []),
    panel("source", getSourceHealth(db), {
      generatedAt: now,
      rows: [],
      totals: EMPTY_BOARD_TOTALS,
    }),
    panel("deliveryFailures", selectDeliveryFailures(db, deliverySince, DELIVERY_LIMIT), []),
  ]);

  const failedPanels: AdminPanel[] = [];
  if (flagsFailed) failedPanels.push("flags");
  if (automatedFailed) failedPanels.push("automatedActions");
  if (quarantinedFailed) failedPanels.push("quarantined");
  if (spendFailed) failedPanels.push("spend");
  if (sourceFailed) failedPanels.push("source");
  if (deliveryFailed) failedPanels.push("deliveryFailures");

  return {
    readAt: iso(now),
    failedPanels,
    flags: flags.map(toFlagRow),
    automatedActions: toAutomatedRows(automated),
    automatedWindowDays: AUTOMATED_WINDOW_DAYS,
    releaseAvailable: RELEASE_AVAILABLE,
    quarantined: quarantined.map(toQuarantinedRow),
    spend: summarizeSpend(usage, now),
    source: summarizeBoards(health, now),
    deliveryFailures: failures.map(toDeliveryRow),
    deliveryWindowDays: DELIVERY_WINDOW_DAYS,
  };
}

export type FlagActionResult =
  | { ok: true; quarantined: boolean; released: boolean }
  | {
      ok: false;
      reason: "flag_not_found" | "flag_not_open" | "job_not_quarantined" | "release_unavailable";
    };

export type JobActionResult =
  | { ok: true; released: boolean }
  | { ok: false; reason: "job_not_found" | "job_not_quarantined" | "release_unavailable" };

/**
 * The owner's verdict on one flag.
 *
 * **The write goes through `recordFlagOutcome`, the same helper the worker's rules use**, and this
 * page adds no second writer. That helper is atomic over the verdict and the evidence, and on a
 * dismissal it withdraws the evidence the flag produced — the thing that used to go on pressing on
 * a real company's tier after the flag behind it was thrown out.
 *
 * **Every call passes `by: "owner"`**, which is what selects `VERDICT_FROM.owner` in the kernel —
 * `open`, `needs_review` and `auto_resolved` — rather than the automation's `["open"]`. Omitting it
 * silently gets the restrictive set, so the escalated flags the queue sorts first were refused by
 * the one surface that exists to decide them, and an automated tier downgrade could not be undone
 * through any path at all. The default is restrictive on purpose; naming yourself is the price.
 *
 * `approve` means "the post is bad, hold it out of every Brief and every send": `quarantineJob`
 * plus the matching verdict. Quarantine runs **first** because it is idempotent and the verdict is
 * the contended write — a crash between them leaves a quarantined job and an open flag, which the
 * owner sees and can action again, rather than a resolved flag over a job still going out. That
 * ordering only holds once the *knowable* refusals are out of the way first: hence the status check
 * below, which exists because they were not.
 *
 * `closeJob` is deliberately not offered: closing is terminal and belongs to the rule that verified
 * the post is gone, not to a judgement made from this list.
 *
 * `dismiss` may carry `release`, which also takes the post out of quarantine. Two judgements, two
 * decisions: dismissing says the flag was wrong, releasing puts a post back in front of every user
 * it matches. The verdict is written **first** here, because the flag is the contended row and
 * releasing a post whose flag somebody else has just actioned is the mistake worth avoiding.
 *
 * The verdict is spelled `auto_resolved` because `flag_status` has four values and none of them
 * means "an owner decided". `open` re-offers the flag to the rules for ever, `needs_review` leaves
 * it in this queue, and `dismissed` says the opposite of what happened. `action_taken` records what
 * was actually done. A fifth status is an enum migration and belongs to whoever owns the schema.
 */
export async function actionFlag(
  flagId: string,
  action: AdminFlagAction,
  release = false,
): Promise<FlagActionResult> {
  const db = getDb();

  // The job comes from the flag's own row, never from the request body. A body-supplied `jobId`
  // would let a request quarantine or release one post by naming another's flag, and this is the
  // surface with the widest reach in the product.
  //
  // `selectFlagForOwner` applies **no status filter**, deliberately: a flag that exists but cannot
  // be actioned has to be told apart from one that does not exist, and a list that filtered by
  // status would collapse both into `flag_not_found`. It also replaces a scan of the first 250 rows
  // of a list, which answered `flag_not_found` for a row the page had just displayed.
  const flag = await selectFlagForOwner(db, flagId);
  if (!flag) return { ok: false, reason: "flag_not_found" };
  const jobId = flag.jobId;

  // Refuse what the kernel will refuse, **before** touching the job, and refuse nothing more than
  // that. Without the check, an `approve` that then lost the verdict still quarantined the post:
  // the caller got a refusal, believed nothing had happened, and a real job was held out of every
  // Brief and every send anyway. Measured against a real database, not imagined. But the check must
  // mirror `VERDICT_FROM.owner` and not a narrower guess — when it read `status !== "open"` it was
  // the second half of the bug that made escalated flags unactionable.
  if (!OWNER_VERDICT_FROM.includes(flag.status)) return { ok: false, reason: "flag_not_open" };

  if (action === "dismiss") {
    if (release) {
      if (flag.jobStatus !== "quarantined") return { ok: false, reason: "job_not_quarantined" };
      if (!RELEASE_AVAILABLE) return { ok: false, reason: "release_unavailable" };
    }
    const outcome = await recordFlagOutcome(db, {
      flagId,
      status: "dismissed",
      action: "none",
      by: "owner",
    });
    if (!outcome.actioned) return { ok: false, reason: "flag_not_open" };
    const released = release ? await releaseJob(db, jobId) : false;
    return { ok: true, quarantined: false, released };
  }

  if (!APPROVE_FROM.includes(flag.status)) return { ok: false, reason: "flag_not_open" };
  const quarantined = await quarantineJob(db, jobId);
  const outcome = await recordFlagOutcome(db, {
    flagId,
    status: "auto_resolved",
    action: "quarantined",
    by: "owner",
  });
  return outcome.actioned
    ? { ok: true, quarantined, released: false }
    : { ok: false, reason: "flag_not_open" };
}

/**
 * Put a quarantined post back.
 *
 * The inverse of what one tap on a `scam` flag does. Until `releaseJob` existed there was no
 * inverse at all — a real post sat out of every Brief, every send and every kit with no remedy short
 * of an `UPDATE` by hand. The `release_unavailable` answer is kept for the deploy that is missing
 * the helper, and the panel draws no control while that is the answer.
 *
 * The job is read from the quarantined list first, so "no such post" and "that post is not in
 * quarantine" are different answers, and so a request cannot name an arbitrary job id. The guard
 * that matters is in the helper — `where status = 'quarantined'`, which cannot resurrect a closed
 * or merged post — and this check is only how the caller gets told which one happened.
 *
 * **The flag behind the post is deliberately untouched.** Releasing says the post should be visible
 * again; it does not say the flag was wrong, and writing a verdict nobody asked for would put words
 * in the owner's mouth on a row a rule may still be working.
 */
export async function releaseQuarantinedJob(jobId: string): Promise<JobActionResult> {
  const db = getDb();
  const held = await selectQuarantinedJobs(db, QUARANTINE_LIMIT);
  if (!held.some((row) => row.jobId === jobId)) {
    return { ok: false, reason: "job_not_quarantined" };
  }
  if (!RELEASE_AVAILABLE) return { ok: false, reason: "release_unavailable" };
  return { ok: true, released: await releaseJob(db, jobId) };
}
