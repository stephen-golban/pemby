// Read-only panels for the owner's admin page (phase 09). Two of its panels were already backed
// before this phase — `getSourceHealth` in `./source-health.ts` and `aiUsageTotals` in
// `./ai-usage.ts` — and these are the three that were not.
//
// **Nothing here writes.** Every statement is a select; the admin page's actions go through the
// flag helpers in `./flags.ts`, which are the same ones the worker uses, so an owner clicking
// "close" and a rule closing take the same path.
//
// **Demo rows are shown, not hidden, and every row says which it is.** That is the opposite of the
// rule for `./flags.ts`, and deliberately so. Demo exclusion is a correctness requirement for a rule
// that *spends money or changes a real job*; these panels do neither. An observability surface that
// silently drops rows is a surface that lies to the one person who has to know what is actually in
// the database — and on staging, where 4 of 5 users are seeded, filtering would leave the owner
// looking at three empty panels and no way to tell "nothing happened" from "nothing is shown".
// `isDemo` on each row lets the page label or filter; the query does not decide for it.
//
// **`ai_cap_alerts` is deliberately not read here.** It holds a row for 2026-09-17 with
// `cap_usd = 0.000000` — a forced-zero-cap test, not a $3 breach — so a panel that renders "cap hit"
// from that table shows a hit that never happened. The real cap comes from `readDailyCapUsd` in
// `@pemby/ai` and the real spend from `aiUsageTotals`; that pair is the honest version of the
// question, and this file does not offer a dishonest one.
//
// Conventions, from `./matching.ts`: every timestamp read through `db.execute` is selected as epoch
// milliseconds and rebuilt here, because a raw execute has no column mappers and a `timestamptz`
// arrives as Postgres's own text.
import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Db } from "../client";
import { DEFAULT_MAX_FLAG_CLAIM_ATTEMPTS } from "./flags";
import type { ChannelType } from "./delivery";
import type { FlagAction, FlagField, FlagReason, FlagStatus, JobStatus } from "./flags";

/**
 * The statuses the review queue shows unless asked otherwise: the two that are waiting on somebody.
 * `auto_resolved` and `dismissed` are history and would bury them.
 */
export const REVIEW_QUEUE_STATUSES: readonly FlagStatus[] = ["needs_review", "open"];

const epochMs = (column: SQL, alias: string): SQL =>
  sql`(extract(epoch from ${column}) * 1000)::bigint as ${sql.raw(alias)}`;

const toDate = (ms: string | null): Date | null => (ms === null ? null : new Date(Number(ms)));

// ---- 1. The flag review queue ----------------------------------------------------------------

export interface FlagReviewRow {
  flagId: string;
  jobId: string;
  jobTitle: string;
  jobUrl: string;
  jobStatus: JobStatus;
  companyName: string;
  /** Null when the account that filed it has been deleted (`flags.user_id` is `set null`). */
  userId: string | null;
  reason: FlagReason;
  country: string | null;
  field: FlagField | null;
  /** Null even for a set `field` on the Telegram path, which never writes this column. */
  fieldValue: string | null;
  /**
   * Free text from an "Other" flag. **This surface is the only reader there is or may ever be** —
   * it never reaches enrichment, a kit or any prompt.
   *
   * **Null on every row today**: nothing writes `flags.note` on any surface. The web picker has no
   * free-text field and the Telegram path writes five columns, none of them this one. So PLAN
   * section 6's "free text goes to the owner review queue" has no producer yet, and the queue must
   * render `note IS NULL` as the normal case rather than as a missing value.
   */
  note: string | null;
  weight: number;
  status: FlagStatus;
  actionTaken: FlagAction | null;
  /** How many times the rules have claimed this flag. */
  claimAttempts: number;
  /** True while a worker holds a claim on it. See `automation` for what that is worth. */
  processing: boolean;
  /**
   * Where the automation got to, computed here so the surface never has to know the worker's
   * configured ceiling in order to read the data:
   *
   * - `untouched` — never claimed. The rules have not reached it yet.
   * - `claimed` — a worker holds a claim on a row the claim query can still reach. **After the
   *   stale cutoff this means a crashed worker, not live work**; the claim query re-offers it, and
   *   `claimAttempts` says how often that has already happened. Patience is still the right answer,
   *   because the row *is* coming back — which is the whole difference between this and `gave-up`.
   * - `tried` — claimed at least once and released, with attempts still available.
   * - `gave-up` — `status = 'open'` and the attempt ceiling is reached. **The automation tried and
   *   stopped.** Nothing will process this flag again; it is here because a human has to look. This
   *   is the one value that means the row needs a decision rather than patience, and it is why it
   *   is a field and not something the panel infers from two numbers.
   *
   * **The arms are ordered so that the least recoverable state wins**, which is the opposite of the
   * order they were first written in. `gave-up` is tested before `claimed`, because a flag can be
   * both — exhausted *while* holding the claim of the worker that died on its last attempt — and of
   * the two, only `gave-up` is true about what happens next.
   *
   * `status = 'needs_review'` is deliberately *not* `gave-up`: a rule escalating on purpose and the
   * automation running out of road are different events and read differently to whoever is on the
   * queue.
   */
  automation: FlagAutomationState;
  createdAt: Date;
  /**
   * When a verdict was recorded, or null when none has been.
   *
   * Only `auto_resolved` and `dismissed` stamp it — `needs_review` means a person has not looked
   * yet, and dating that as resolved would make a queue's age column meaningless. So this is null
   * for every row in the queue and set for every row in a history view, which is exactly the split
   * the two callers want.
   */
  resolvedAt: Date | null;
  /**
   * How many `eligibility_evidence` rows still carry this flag's id.
   *
   * Here because the undo copy needs it. "Dismissing withdraws this flag's evidence" is a promise
   * about an outcome, and without this number the surface cannot tell whether there is any evidence
   * left to withdraw — so it would describe work it intends rather than a result it will achieve,
   * which is this phase's signature defect. Zero is a normal and common answer: most flags produce
   * no evidence at all.
   */
  evidenceRows: number;
  /** The job is seeded demo data, or the flagger is a demo user. */
  isDemo: boolean;
}

/** See `FlagReviewRow.automation`. */
export type FlagAutomationState = "untouched" | "claimed" | "tried" | "gave-up";

type RawFlagReviewRow = {
  flag_id: string;
  job_id: string;
  job_title: string;
  job_url: string;
  job_status: JobStatus;
  company_name: string;
  user_id: string | null;
  reason: FlagReason;
  country: string | null;
  field: FlagField | null;
  field_value: string | null;
  note: string | null;
  weight: number;
  status: FlagStatus;
  action_taken: FlagAction | null;
  claim_attempts: number;
  processing: boolean;
  automation: FlagAutomationState;
  created_at_ms: string;
  resolved_at_ms: string | null;
  evidence_rows: number;
  is_demo: boolean;
};

/**
 * `FlagReviewRow.automation`, as SQL.
 *
 * **The arms are ordered so that the least recoverable state wins**, and that ordering is the whole
 * of the correctness here.
 *
 * `gave-up` is tested **before** `claimed`, because a flag can be both and only one of them is true
 * about what happens next. The case that makes it load-bearing is exactly the one `claim_attempts`
 * exists to bound: a worker dying mid-rule on its last attempt leaves the claim set *and* the
 * attempts spent. With `claimed` tested first that row read `claimed` for ever, and the owner's
 * queue said "someone is on it" about a flag nothing would ever pick up again.
 *
 * `claimed` is additionally scoped to `status = 'open'`, because that is the only status the claim
 * query can reach. A claim sitting on any other status is debris left from before the verdict, and
 * calling it `claimed` would hide a `needs_review` row that is waiting on the owner behind a
 * reassuring "someone is on it".
 *
 * Kept out of the query body as a fragment rather than written inline: `--` comments inside a
 * template-literal query survive only as long as the newlines do, and the reasoning is too load
 * bearing to depend on that.
 */
const automationCase = (maxAttempts: number): SQL => sql`
      case
        when f.status = 'open' and f.claim_attempts >= ${maxAttempts} then 'gave-up'
        when f.status = 'open' and f.processing_at is not null then 'claimed'
        when f.claim_attempts > 0 then 'tried'
        else 'untouched'
      end`;

/**
 * The columns and joins behind a `FlagReviewRow`, written once.
 *
 * Shared by the queue and the by-id lookup so the two cannot drift: a field added for one surface
 * and missing on the other is the kind of difference nobody notices until a page renders `undefined`
 * for a row it fetched a different way.
 *
 * `evidence_rows` is a correlated count rather than a join, so a flag with no evidence — the common
 * case — still produces exactly one row.
 */
const flagReviewSelect = (maxAttempts: number): SQL => sql`
    select
      f.id as flag_id, f.job_id, f.user_id, f.reason, f.country, f.field, f.field_value,
      f.note, f.weight::real as weight, f.status, f.action_taken, f.claim_attempts,
      f.processing_at is not null as processing,
      ${automationCase(maxAttempts)} as automation,
      ${epochMs(sql`f.created_at`, "created_at_ms")},
      ${epochMs(sql`f.resolved_at`, "resolved_at_ms")},
      (select count(*)::int from eligibility_evidence e where e.flag_id = f.id) as evidence_rows,
      j.title as job_title, j.url as job_url, j.status as job_status,
      c.name as company_name,
      (j.is_demo or coalesce(p.is_demo, false)) as is_demo
      from flags f
      join jobs j on j.id = f.job_id
      join companies c on c.id = j.company_id
      left join profiles p on p.user_id = f.user_id`;

const toFlagReviewRow = (r: RawFlagReviewRow): FlagReviewRow => ({
  flagId: r.flag_id,
  jobId: r.job_id,
  jobTitle: r.job_title,
  jobUrl: r.job_url,
  jobStatus: r.job_status,
  companyName: r.company_name,
  userId: r.user_id,
  reason: r.reason,
  country: r.country,
  field: r.field,
  fieldValue: r.field_value,
  note: r.note,
  weight: Number(r.weight),
  status: r.status,
  actionTaken: r.action_taken,
  claimAttempts: Number(r.claim_attempts),
  processing: r.processing,
  automation: r.automation,
  createdAt: new Date(Number(r.created_at_ms)),
  resolvedAt: toDate(r.resolved_at_ms),
  evidenceRows: Number(r.evidence_rows),
  isDemo: r.is_demo,
});

/**
 * Which way round the rows come back, and which timestamp `since` filters on.
 *
 * **A queue and a log want opposite orders, and that is the point.** A queue asks "what is waiting
 * and how long has it been waiting" — escalated first, then oldest, so nothing can sit at the bottom
 * for ever. A log asks "what just happened" — newest first. One parameter, two behaviours; the thing
 * that is not acceptable is two behaviours behind no parameter, which is what this was: the ordering
 * was ascending for both, so a history view over more `auto_resolved` rows than its limit returned
 * the **oldest** ones and called them recent. Invisible at one row; wrong and silent in production.
 */
export type FlagReviewOrder = "queue" | "history";

export interface FlagReviewParams {
  /**
   * The ceiling the **worker** is configured with, so `automation` says `gave-up` about the same
   * rows the claim query has actually stopped offering. Defaults to the claim's own default.
   */
  maxAttempts?: number;
  /**
   * Which statuses to return. Defaults to `REVIEW_QUEUE_STATUSES` — the rows waiting on somebody.
   *
   * The one reason to widen it is `auto_resolved`: those flags are what an automated tier downgrade
   * is made of, and the owner can now dismiss them to undo one (`VERDICT_FROM.owner`). Without a way
   * to *list* them the owner has the power and no way to reach it. It is a separate call and a
   * separate view, not a wider default: a queue that mixed finished flags in with the ones waiting
   * would hide the second behind the first, which is the same shadowing that made `claimed` mask
   * `gave-up`.
   */
  statuses?: readonly FlagStatus[];
  /** `queue` (the default) or `history`. See `FlagReviewOrder`. */
  order?: FlagReviewOrder;
  /**
   * Only rows at or after this instant, **on the same column the chosen order sorts by** — so
   * `history` filters on `resolved_at` and `queue` on `created_at`. Keeping the two together is what
   * makes "the last 30 days of automated actions" a filter rather than a sentence in the copy: a
   * history view bounded by `created_at` would drop a flag filed 40 days ago and actioned this
   * morning, which is precisely the row the reader is looking for.
   *
   * In `history` a row with no `resolved_at` is excluded, which is correct — it has not happened yet.
   */
  since?: Date;
}

/**
 * Flags for the owner, as either a queue or a history.
 *
 * As a **queue** (the default): `needs_review` first, then anything still `open`, oldest first
 * inside each. Both belong in one list — an `open` flag no rule matched is a flag nobody will ever
 * look at unless this queue shows it, and a queue that only showed `needs_review` would let those
 * accumulate invisibly.
 *
 * As a **history** (`order: "history"`, usually with `statuses: ["auto_resolved"]`): newest verdict
 * first, so a limit takes the most recent rather than the oldest.
 */
export async function selectFlagsForReview(
  db: Db,
  limit: number,
  {
    maxAttempts = DEFAULT_MAX_FLAG_CLAIM_ATTEMPTS,
    statuses = REVIEW_QUEUE_STATUSES,
    order = "queue",
    since,
  }: FlagReviewParams = {},
): Promise<FlagReviewRow[]> {
  if (statuses.length === 0) return [];

  const sinceColumn = order === "history" ? sql`f.resolved_at` : sql`f.created_at`;
  const conditions: SQL[] = [sql`f.status = any(${sql.param([...statuses])}::flag_status[])`];
  if (since) conditions.push(sql`${sinceColumn} >= ${since.toISOString()}::timestamptz`);

  // `nulls last` and the `id` tiebreak keep the page deterministic: without them a limit could
  // return a different slice on two identical calls.
  const orderBy =
    order === "history"
      ? sql`f.resolved_at desc nulls last, f.created_at desc, f.id desc`
      : sql`(f.status = 'needs_review') desc, f.created_at, f.id`;

  const rows = await db.execute<RawFlagReviewRow>(sql`
    ${flagReviewSelect(maxAttempts)}
     where ${sql.join(conditions, sql` and `)}
     order by ${orderBy}
     limit ${limit}
  `);
  return rows.rows.map(toFlagReviewRow);
}

/**
 * One flag by id, in the same shape the queue returns, or null.
 *
 * **No status filter**: the owner acting on a row is entitled to read it whatever state it is in,
 * including one already dismissed — the surface needs to render *why* an action is unavailable, and
 * it cannot do that from a null.
 *
 * It exists because resolving a flag by fetching a page of rows and scanning for the id is wrong in
 * a way that gets worse quietly: past the page limit a row the page had just displayed answers
 * "not found". A wrong *reason* is worse than a wrong outcome, because it sends the reader hunting
 * for a deleted flag instead of a paging bug.
 */
export async function selectFlagForOwner(
  db: Db,
  flagId: string,
  { maxAttempts = DEFAULT_MAX_FLAG_CLAIM_ATTEMPTS }: { maxAttempts?: number } = {},
): Promise<FlagReviewRow | null> {
  const rows = await db.execute<RawFlagReviewRow>(sql`
    ${flagReviewSelect(maxAttempts)}
     where f.id = ${flagId}::uuid
     limit 1
  `);
  const row = rows.rows[0];
  return row ? toFlagReviewRow(row) : null;
}

// ---- 2. Quarantined jobs ----------------------------------------------------------------------

export interface QuarantinedJobRow {
  jobId: string;
  title: string;
  url: string;
  companyId: string;
  companyName: string;
  /** When the row last changed. A quarantine is the last thing that happens to an open job. */
  updatedAt: Date;
  firstSeenAt: Date;
  /** Flags on this job that are not dismissed, and the sum of their weight. */
  flagCount: number;
  flagWeight: number;
  /** The distinct reasons behind those flags, so the panel need not fetch the flags to say why. */
  flagReasons: FlagReason[];
  isDemo: boolean;
}

type RawQuarantinedJobRow = {
  job_id: string;
  title: string;
  url: string;
  company_id: string;
  company_name: string;
  updated_at_ms: string;
  first_seen_at_ms: string;
  flag_count: number;
  flag_weight: string;
  flag_reasons: FlagReason[] | null;
  is_demo: boolean;
};

/**
 * Jobs currently held out of every Brief and every send, most recently quarantined first.
 *
 * `flag_reasons` is read back with `::text[]`: a `flag_reason[]` aggregate arrives from the driver
 * as Postgres's own array literal rather than as a JS array, and the text cast is what makes the
 * driver parse it (the same reason every enum-array read in `./matching.ts` carries one).
 */
export async function selectQuarantinedJobs(db: Db, limit: number): Promise<QuarantinedJobRow[]> {
  const rows = await db.execute<RawQuarantinedJobRow>(sql`
    select
      j.id as job_id, j.title, j.url, j.is_demo,
      ${epochMs(sql`j.updated_at`, "updated_at_ms")},
      ${epochMs(sql`j.first_seen_at`, "first_seen_at_ms")},
      c.id as company_id, c.name as company_name,
      coalesce(fl.n, 0)::int as flag_count,
      coalesce(fl.w, 0)::numeric as flag_weight,
      coalesce(fl.reasons, '{}')::text[] as flag_reasons
      from jobs j
      join companies c on c.id = j.company_id
      left join lateral (
             select count(*)::int as n,
                    sum(f.weight)::numeric as w,
                    array_agg(distinct f.reason) as reasons
               from flags f
              where f.job_id = j.id and f.status <> 'dismissed'
           ) fl on true
     where j.status = 'quarantined'
     order by j.updated_at desc, j.id
     limit ${limit}
  `);

  return rows.rows.map((r) => ({
    jobId: r.job_id,
    title: r.title,
    url: r.url,
    companyId: r.company_id,
    companyName: r.company_name,
    updatedAt: new Date(Number(r.updated_at_ms)),
    firstSeenAt: new Date(Number(r.first_seen_at_ms)),
    flagCount: Number(r.flag_count),
    flagWeight: Number(r.flag_weight),
    flagReasons: r.flag_reasons ?? [],
    isDemo: r.is_demo,
  }));
}

// ---- 3. Delivery failures ---------------------------------------------------------------------

export interface DeliveryFailureRow {
  deliveryId: string;
  userId: string;
  matchId: string | null;
  channelType: ChannelType;
  /** The sanitized error label the dispatcher wrote. Never a provider's raw body. */
  error: string | null;
  createdAt: Date;
  sentAt: Date | null;
  /** Null when the row carries no match (a system message, or a match since deleted). */
  jobTitle: string | null;
  companyName: string | null;
  isDemo: boolean;
}

type RawDeliveryFailureRow = {
  delivery_id: string;
  user_id: string;
  match_id: string | null;
  channel_type: ChannelType;
  error: string | null;
  created_at_ms: string;
  sent_at_ms: string | null;
  job_title: string | null;
  company_name: string | null;
  is_demo: boolean;
};

/**
 * Failed deliveries since `since`, newest first.
 *
 * **Zero `error` rows have ever existed on staging**, so a green run of this proves the statement
 * parses, plans and returns — and proves nothing at all about how the panel renders a real failure.
 * Say so wherever this panel is described; an empty panel here means "nothing has failed", and a
 * surface that cannot tell that from "the query is broken" is the phase-08 lesson repeating.
 *
 * `claim_expired` rows are included. They are failures — a dispatcher died holding a claim — and
 * hiding the one failure mode the system creates for itself would be the wrong kind of tidy.
 */
export async function selectDeliveryFailures(
  db: Db,
  since: Date,
  limit = 200,
): Promise<DeliveryFailureRow[]> {
  const rows = await db.execute<RawDeliveryFailureRow>(sql`
    select
      d.id as delivery_id, d.user_id, d.match_id, d.channel_type, d.error,
      ${epochMs(sql`d.created_at`, "created_at_ms")},
      ${epochMs(sql`d.sent_at`, "sent_at_ms")},
      j.title as job_title, c.name as company_name,
      coalesce(p.is_demo, false) as is_demo
      from delivery_log d
      left join matches m on m.id = d.match_id
      left join jobs j on j.id = m.job_id
      left join companies c on c.id = j.company_id
      left join profiles p on p.user_id = d.user_id
     where d.status = 'failed'
       and d.created_at >= ${since.toISOString()}::timestamptz
     order by d.created_at desc, d.id
     limit ${limit}
  `);

  return rows.rows.map((r) => ({
    deliveryId: r.delivery_id,
    userId: r.user_id,
    matchId: r.match_id,
    channelType: r.channel_type,
    error: r.error,
    createdAt: new Date(Number(r.created_at_ms)),
    sentAt: toDate(r.sent_at_ms),
    jobTitle: r.job_title,
    companyName: r.company_name,
    isDemo: r.is_demo,
  }));
}
