// The flag rules' side of the database (PLAN D26, section 6, phase 09).
//
// The vocabulary was already complete before this phase: `flags` and `eligibility_evidence` shipped
// in 0001, `job_status` already had `quarantined`, `flag_action` already enumerated every action
// section 6 names, and the tier-downgrade rule is already implemented in the eligibility engine,
// which sums evidence `weight` and steps the tier down at >= 2. Nothing here re-decides any of
// that. This file claims a flag, records the verdict, writes the evidence row the engine will read,
// counts the flags behind a decision, and sets the two job statuses a rule may set.
//
// **Three things in this file are load-bearing and easy to undo by accident.**
//
// 1. `claimFlagsToProcess` never selects `flags.note`. Free text from an "Other" flag goes to the
//    owner review queue and **nowhere else** — not to enrichment, not to a kit, not to any prompt.
//    The rules run in a worker that calls models, so the safest place for that rule is the column
//    list: text that is never loaded cannot be passed on. `selectFlagsForReview` in `./admin.ts` is
//    the one reader, and it is owner-only.
// 2. Every helper whose result feeds a rule that spends money or changes a real job excludes demo.
//    `is_demo` exists on exactly three tables — `profiles`, `companies`, `jobs` — and the seed
//    writes demo rows into `flags` as into everything else, so the established mitigation is
//    phase 08's: **join the fact, do not add a column** (see `./delivery.ts`). A `flags.is_demo`
//    column would default to false on precisely the rows a rule would then act on.
// 3. `flags.user_id` is nullable, on purpose: `on delete set null`, so flag history and the
//    evidence derived from it survive account deletion. "Two independent flags" therefore cannot be
//    counted by distinct `user_id` once an account has gone. `countIndependentFlags` returns the
//    `weight` sum — which is what the engine itself already sums — *and* the distinct user count,
//    and lets the caller decide which one its rule is about.
//
// Conventions, from `./matching.ts`: `sql.param` for array parameters, `::text[]` for enum-array
// reads, and every timestamp read through `db.execute` selected as epoch milliseconds and rebuilt
// here, because a raw execute has no column mappers and a `timestamptz` arrives as Postgres's own
// text.
import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import type { Db } from "../client";
import type { eligibilityEvidence, flags, jobs } from "../schema";

export type Flag = typeof flags.$inferSelect;
export type NewFlag = typeof flags.$inferInsert;
export type FlagReason = (typeof flags.$inferSelect)["reason"];
export type FlagStatus = (typeof flags.$inferSelect)["status"];
export type FlagField = NonNullable<(typeof flags.$inferSelect)["field"]>;
export type FlagAction = NonNullable<(typeof flags.$inferSelect)["actionTaken"]>;
export type JobStatus = (typeof jobs.$inferSelect)["status"];
export type EvidenceTier = (typeof eligibilityEvidence.$inferSelect)["verdict"];
export type EvidenceSource = (typeof eligibilityEvidence.$inferSelect)["source"];
export type EvidenceWayOfWorking = (typeof eligibilityEvidence.$inferSelect)["wayOfWorking"];

const epochMs = (column: SQL, alias: string): SQL =>
  sql`(extract(epoch from ${column}) * 1000)::bigint as ${sql.raw(alias)}`;

/**
 * A flag that may drive a rule: not on a demo job, and not filed by a demo user.
 *
 * Written as `not exists (a demo profile for this user)` rather than as a join, because
 * `flags.user_id` is nullable and an inner join to `profiles` would silently drop every flag whose
 * author has since deleted their account — the history that `on delete set null` exists to keep.
 * A user with no profile row at all (signed up, never onboarded) is not demo and is not excluded.
 *
 * `j.is_demo = false` is the second half and the more robust one: a fictional job is not a job a
 * rule may close, whoever flagged it. `c.is_demo = false` is the third: `is_demo` exists on exactly
 * three tables and this checks all three, so a real-looking job hung off a seeded company cannot
 * drive a rule either. No such row exists in the seed today; it costs one predicate to keep it that
 * way.
 */
const flagIsReal = (flagAlias: string, jobAlias: string, companyAlias: string): SQL => sql`
  ${sql.raw(jobAlias)}.is_demo = false
  and ${sql.raw(companyAlias)}.is_demo = false
  and not exists (
        select 1 from profiles p
         where p.user_id = ${sql.raw(flagAlias)}.user_id and p.is_demo = true
      )`;

/** Everything a PLAN section 6 rule needs about one flag. Note the absence of `note`. */
export interface FlagToProcess {
  flagId: string;
  jobId: string;
  companyId: string;
  /** Null when the account that filed it has been deleted. */
  userId: string | null;
  reason: FlagReason;
  /** "Doesn't hire from my country": the flagger's residence, ISO 3166-1 alpha-2. */
  country: string | null;
  field: FlagField | null;
  /**
   * The value from the "wrong details" picker, **often null even when `field` is set**: the
   * Telegram path writes five columns and `field_value` is not one of them
   * (`apps/bot/src/store-db.ts`). A rule must handle a named field with no value and must not
   * invent one.
   */
  fieldValue: string | null;
  /** The anti-abuse knob. Pass holders and accurate past flaggers weigh more; 1 by default. */
  weight: number;
  /**
   * Claims made on this flag **including this one**, so a handler can tell a first look from a
   * retry after a crash. At `maxAttempts` the flag stops being offered and is left for the owner.
   */
  claimAttempts: number;
  createdAt: Date;
  jobStatus: JobStatus;
  jobTitle: string;
  jobUrl: string;
  /** Null when the job's company has no domain; `requestCompanyEvidenceRecheck` needs one. */
  companyDomain: string | null;
  duplicateOfJobId: string | null;
}

type RawFlagToProcess = {
  flag_id: string;
  job_id: string;
  company_id: string;
  user_id: string | null;
  reason: FlagReason;
  country: string | null;
  field: FlagField | null;
  field_value: string | null;
  weight: number;
  claim_attempts: number;
  created_at_ms: string;
  job_status: JobStatus;
  job_title: string;
  job_url: string;
  company_domain: string | null;
  duplicate_of_job_id: string | null;
};

/** A claim not cleared within this long is assumed to belong to a crashed worker and re-offered. */
export const DEFAULT_FLAG_CLAIM_STALE_MS = 15 * 60 * 1000;

/**
 * The floor under `staleClaimMs`, mirroring `MIN_STALE_CLAIM_MS` in `./delivery.ts` and enforced
 * the same way — by throwing, not by clamping.
 *
 * The arithmetic is the dangerous part. This used to floor the value to whole seconds, so anything
 * under 1000 ms became `processing_at < now()`, which re-offers **every claimed flag on every
 * poll** — every worker processing every flag at once, for ever, with no error, no non-zero exit
 * and a return value that reads as *busy* rather than broken. A caller that passes 500 has made a
 * mistake and needs to be told, not quietly given the worst possible behaviour.
 */
export const MIN_FLAG_CLAIM_STALE_MS = 60_000;

/**
 * How many times one flag may be claimed before the rules give up on it and leave it to a human.
 * Small on purpose: the cost of another cycle is a model call, and the cost of stopping is that the
 * flag appears in the owner's review queue, which is where an unprocessable flag belongs anyway.
 *
 * **The signal a reader should look for is `status = 'open'` together with
 * `claim_attempts >= maxAttempts`.** That pair, and only that pair, means the automation tried and
 * gave up; `status = 'open'` with a lower count means it has simply not finished, and
 * `status = 'needs_review'` means a rule deliberately escalated. `selectFlagsForReview` computes
 * that comparison for its caller (`FlagReviewRow.automation`), because a surface that has to know
 * the worker's configured ceiling in order to read the data would get it wrong the first time the
 * ceiling changed.
 */
export const DEFAULT_MAX_FLAG_CLAIM_ATTEMPTS = 5;

/**
 * The floor under `maxAttempts`, enforced by throwing exactly as `MIN_FLAG_CLAIM_STALE_MS` is.
 *
 * A caller that passes 0 has made a mistake whose symptom is that **no flag is ever processed
 * again** — `claim_attempts < 0` matches nothing — while the claim returns an empty array, which is
 * indistinguishable from a healthy queue with nothing in it. That is the failure mode this whole
 * phase keeps meeting: a mechanism reporting on the work it did rather than the outcome it
 * achieved. It is one comparison to make it loud instead.
 */
export const MIN_FLAG_CLAIM_ATTEMPTS = 1;

export interface ClaimFlagsParams {
  limit: number;
  /** Re-offer a claim older than this many milliseconds. Default 15 minutes, floor 60s. */
  staleClaimMs?: number;
  /** Stop offering a flag once it has been claimed this many times. Default 5. */
  maxAttempts?: number;
}

/**
 * Claim up to `limit` open flags for processing, oldest first.
 *
 * **A real claim, not a select.** The rules this feeds close jobs, quarantine jobs and queue
 * re-enrichment, and a re-enrichment is a model call — so two workers reaching one flag is a double
 * spend against a real job, and `enrich.job` is a `standard` pg-boss queue, where `singletonKey`
 * creates no unique index and `send` never returns null for a duplicate. Nothing upstream will stop
 * it; this statement has to.
 *
 * One statement: `update ... where id in (select ... order by created_at limit N for update skip
 * locked)`. The inner select takes row locks and skips rows another transaction already holds, so
 * concurrent callers partition the set instead of colliding, and the update commits the claim. It
 * is the same shape as `delivery_log`'s claim (`./delivery.ts`) and it accepts the same trade: a
 * worker that dies mid-flag leaves `processing_at` set, and after `staleClaimMs` the flag is
 * offered again. Looking at a flag twice after a crash is recoverable; dropping it silently is not.
 *
 * `flag_status` could not carry the claim. Its four values are all verdicts — writing one before
 * the rule has decided would be false in the audit trail — and adding a fifth would be an enum
 * migration, which has to ship in a file of its own.
 *
 * **`for update of c`, naming the `flags` alias, and this matters.** A bare `FOR UPDATE` locks a
 * row from *every* table in the FROM list, so the earlier version took a row lock on `jobs` and on
 * `companies` as well. That is not a theoretical cost: ingest, enrichment and the flag rules
 * themselves all update `jobs`, and `SKIP LOCKED` would then skip the flag silently and return
 * fewer rows — measured, an unrelated `select ... from jobs ... for update` held in another session
 * made a claim over 3 claimable flags return **0**, with no error. The correlation is what makes it
 * vicious: a job under active ingestion is precisely the job whose flags would starve.
 *
 * **Bounded retries.** `claim_attempts` goes up with every claim and a flag at `maxAttempts` stops
 * being offered. Without that, a flag that is claimed and never resolved is re-offered for ever and
 * each cycle can re-queue enrichment, which costs a model call. An exhausted flag keeps
 * `status = 'open'`, so it surfaces in `selectFlagsForReview` — giving up means a human sees it.
 *
 * **Excludes demo**, via `flagIsReal` (job, company **and** flagger). **Does not select `note`**:
 * see the file header.
 */
export async function claimFlagsToProcess(
  db: Db,
  params: number | ClaimFlagsParams,
): Promise<FlagToProcess[]> {
  const opts: ClaimFlagsParams = typeof params === "number" ? { limit: params } : params;
  const {
    limit,
    staleClaimMs = DEFAULT_FLAG_CLAIM_STALE_MS,
    maxAttempts = DEFAULT_MAX_FLAG_CLAIM_ATTEMPTS,
  } = opts;
  if (!Number.isFinite(staleClaimMs) || staleClaimMs < MIN_FLAG_CLAIM_STALE_MS) {
    throw new Error(
      `staleClaimMs must be at least ${MIN_FLAG_CLAIM_STALE_MS}ms, got ${String(staleClaimMs)}`,
    );
  }
  if (!Number.isInteger(maxAttempts) || maxAttempts < MIN_FLAG_CLAIM_ATTEMPTS) {
    throw new Error(
      `maxAttempts must be an integer of at least ${MIN_FLAG_CLAIM_ATTEMPTS}, got ${String(maxAttempts)}`,
    );
  }
  const staleSeconds = Math.floor(staleClaimMs / 1000);

  const rows = await db.execute<RawFlagToProcess>(sql`
    with claimed as (
      update flags f
         set processing_at = now(),
             claim_attempts = f.claim_attempts + 1,
             updated_at = now()
       where f.id in (
             select c.id
               from flags c
               join jobs j on j.id = c.job_id
               join companies co on co.id = j.company_id
              where c.status = 'open'
                and c.claim_attempts < ${maxAttempts}
                and (
                      c.processing_at is null
                      or c.processing_at < now() - make_interval(secs => ${staleSeconds}::int)
                    )
                and ${flagIsReal("c", "j", "co")}
              order by c.created_at, c.id
              limit ${limit}
                for update of c skip locked
           )
      returning f.id, f.job_id, f.user_id, f.reason, f.country, f.field, f.field_value,
                f.weight, f.claim_attempts, f.created_at, f.duplicate_of_job_id
    )
    select
      cl.id as flag_id, cl.job_id, cl.user_id, cl.reason, cl.country, cl.field,
      cl.field_value, cl.weight::real as weight, cl.claim_attempts, cl.duplicate_of_job_id,
      ${epochMs(sql`cl.created_at`, "created_at_ms")},
      j.status::text as job_status, j.title as job_title, j.url as job_url,
      c.id as company_id, c.domain as company_domain
      from claimed cl
      join jobs j on j.id = cl.job_id
      join companies c on c.id = j.company_id
     order by cl.created_at, cl.id
  `);

  return rows.rows.map((r) => ({
    flagId: r.flag_id,
    jobId: r.job_id,
    companyId: r.company_id,
    userId: r.user_id,
    reason: r.reason,
    country: r.country,
    field: r.field,
    fieldValue: r.field_value,
    weight: Number(r.weight),
    claimAttempts: Number(r.claim_attempts),
    createdAt: new Date(Number(r.created_at_ms)),
    jobStatus: r.job_status,
    jobTitle: r.job_title,
    jobUrl: r.job_url,
    companyDomain: r.company_domain,
    duplicateOfJobId: r.duplicate_of_job_id,
  }));
}

/**
 * The statuses a rule may actually write. `open` is excluded, and that exclusion is the fix for a
 * real defect: a rule that decided "nothing to do" used to write `status = 'open'` with
 * `action = 'none'`, which clears `processing_at` and leaves the flag claimable on the very next
 * poll — for ever, re-queueing enrichment and spending money every cycle. Staging already holds a
 * row in exactly that shape (`status='open'` carrying `action_taken='reverification_queued'`).
 *
 * "Nothing to do" is a verdict, and its spelling is `auto_resolved` + `none`. Making that a type
 * error rather than a comment is what stops the loop from being re-created by the next caller.
 */
export type TerminalFlagStatus = Exclude<FlagStatus, "open">;

export interface RecordFlagActionParams {
  flagId: string;
  /** Never `open`: see `TerminalFlagStatus`. */
  status: TerminalFlagStatus;
  action: FlagAction;
  /** For the `merged` action: the job this one is a duplicate of. */
  duplicateOfJobId?: string | null;
}

/**
 * Write the verdict on a claimed flag and release the claim.
 *
 * `where id = ... and status = 'open'` is the second half of the mutual exclusion: even if two
 * workers somehow both processed one flag, only one of them writes a verdict, and the loser can see
 * that it lost. **Returns whether it won**, where the phase contract's published signature said
 * `void` — a `void` update that matched nothing is the phase-08 failure exactly, a mechanism
 * reporting on the work it did rather than the outcome. Returning more breaks no caller.
 *
 * `resolved_at` is stamped only for the two statuses that really are resolutions. `needs_review`
 * means a human has not looked yet, and dating it as resolved would make the review queue's age
 * column meaningless.
 */
export async function recordFlagAction(
  db: Db,
  { flagId, status, action, duplicateOfJobId }: RecordFlagActionParams,
): Promise<boolean> {
  assertTerminal(status);
  const updated = await db.execute<{ id: string }>(sql`
    update flags
       set status = ${status}::flag_status,
           action_taken = ${action}::flag_action,
           duplicate_of_job_id = coalesce(${duplicateOfJobId ?? null}::uuid, duplicate_of_job_id),
           resolved_at = case
                           when ${status}::flag_status in ('auto_resolved', 'dismissed')
                           then now() else resolved_at
                         end,
           processing_at = null,
           updated_at = now()
     where id = ${flagId}::uuid
       and status = 'open'
    returning id
  `);
  return updated.rows.length > 0;
}

/**
 * An evidence row derived from a flag, as a discriminated union so the table's CHECK constraint
 * (`eligibility_evidence_subject_ck`: `subject='job'` needs `job_id`, `subject='company'` needs
 * `company_id`) is a **type** error at the call site rather than a constraint violation at runtime.
 */
export type FlagEvidenceRow = FlagEvidenceBase &
  ({ subject: "job"; jobId: string } | { subject: "company"; companyId: string });

interface FlagEvidenceBase {
  /** The flag this evidence came from. The whole point of this helper: it is never left null. */
  flagId: string;
  /** Country code, region code, or "*". */
  scope: string;
  verdict: EvidenceTier;
  /** Default `flag`. `user_report` is the other value a flag-derived row may carry. */
  source?: EvidenceSource;
  wayOfWorking?: EvidenceWayOfWorking;
  /**
   * How much this row counts. The engine **sums** `weight` over red flag/user_report evidence and
   * steps the tier down at >= 2, so this is the number that decides a downgrade — carry the flag's
   * own `weight` through rather than defaulting to 1, or an abuser's flags and a pass holder's
   * count the same.
   */
  weight?: number;
  /**
   * A quote from a **public** source — a job post, a careers page. **Never `flags.note`.** Free
   * text from an "Other" flag goes to the owner review queue and nowhere else, and this column is
   * read by enrichment.
   */
  excerpt?: string | null;
  sourceUrl?: string | null;
  extractorVersion?: string | null;
  fetchedAt?: Date | null;
}

/**
 * **There is deliberately no exported single-statement evidence writer.**
 *
 * Writing evidence and writing the verdict used to be two exported calls, and the claim is
 * at-least-once by design, so a worker that died between them had its flag re-offered after the
 * stale cutoff and wrote the evidence twice — and two copies of one person's single flag sum to the
 * weight at which the engine downgrades a real company's tier. That was reproduced against a real
 * table: `count = 2`, `sum(weight) = 2`.
 *
 * `eligibility_evidence_flag_subject_scope_uq` makes the duplicate a no-op, so the worst case is now
 * bounded. It is still closed off, because a two-statement path that compiles is a path someone
 * takes at 2am, and the ordering — evidence only if the verdict was won — is the guarantee, not the
 * uniqueness. `recordFlagOutcome` is the only way in. A rule that finds it needs something this does
 * not offer should ask, rather than reach for a second writer.
 */

/** The column values for one flag-derived evidence row, as `recordFlagOutcome` inserts them. */
function evidenceValues(row: FlagEvidenceRow) {
  return {
    subject: row.subject,
    jobId: row.subject === "job" ? row.jobId : null,
    companyId: row.subject === "company" ? row.companyId : null,
    scope: row.scope,
    wayOfWorking: row.wayOfWorking ?? null,
    verdict: row.verdict,
    source: row.source ?? ("flag" as EvidenceSource),
    weight: row.weight ?? 1,
    excerpt: row.excerpt ?? null,
    sourceUrl: row.sourceUrl ?? null,
    flagId: row.flagId,
    fetchedAt: row.fetchedAt ?? null,
    extractorVersion: row.extractorVersion ?? null,
  };
}

function assertTerminal(status: FlagStatus): asserts status is TerminalFlagStatus {
  if (status === "open") {
    throw new Error(
      "a flag verdict may not be 'open': a rule with nothing to do writes 'auto_resolved' + 'none'",
    );
  }
}

/**
 * Withdraw the evidence one flag produced. Returns how many rows went.
 *
 * `eligibility_evidence.flag_id` exists so a row can be traced back to the flag that caused it
 * **and withdrawn when that flag is dismissed**, and until this function there was no withdrawal —
 * `countIndependentFlags` correctly stopped counting a dismissed flag while its evidence went on
 * pressing on the company's tier for ever. `recordFlagOutcome` calls this automatically on
 * `dismissed`; it is exported for the owner's admin surface, which dismisses flags by hand.
 *
 * A delete rather than a soft flag, because the engine reads every non-`post` company row and has
 * no concept of a retracted one; adding that concept is an engine change, and the engine is not
 * mine to change this phase.
 */
export async function deleteFlagEvidence(db: Db, flagId: string): Promise<number> {
  const gone = await db.execute<{ id: string }>(sql`
    delete from eligibility_evidence where flag_id = ${flagId}::uuid returning id
  `);
  return gone.rows.length;
}

export interface RecordFlagOutcomeParams extends RecordFlagActionParams {
  /**
   * The evidence this rule produced, written in the **same statement** as the verdict. Omitted when
   * the rule produced none.
   */
  evidence?: FlagEvidenceRow;
}

export interface FlagOutcome {
  /** False when another worker got to the flag first, in which case nothing else happened. */
  actioned: boolean;
  /** False when the verdict was lost, or when this evidence row already existed. */
  evidenceInserted: boolean;
  /** Rows removed because the verdict was `dismissed`. */
  evidenceWithdrawn: number;
}

/**
 * Write a flag's verdict and its evidence **atomically**, and withdraw its evidence on a dismissal.
 *
 * **This is the only call a rule should make, and now the only one it can.** Writing the evidence
 * and writing the verdict as two statements is at-least-once, so a worker that dies between them
 * has its flag re-offered after the stale cutoff and runs the rule again. The engine downgrades a
 * company's tier when the summed `weight` of red flag evidence reaches 2, so **that crash used to
 * turn one person's single flag into a tier downgrade of a real company.** Reproduced against a
 * real table before this existed: two inserts, `count = 2`, `sum(weight) = 2`.
 *
 * Two mechanisms, deliberately, because they fail differently. The unique index
 * (`eligibility_evidence_flag_subject_scope_uq`) is the durable guarantee and holds no matter who
 * writes or how many processes race. This statement is the ordering guarantee: the evidence insert
 * selects `from act`, so it writes **only if the verdict write won the `status = 'open'` race**,
 * and a worker that lost the flag to someone else cannot leave evidence behind for a verdict it did
 * not get to record.
 *
 * One statement rather than `db.transaction`, because every helper here takes a `Db` and a Drizzle
 * transaction object is not one. Data-modifying CTEs run in a single snapshot and commit together,
 * which is the same atomicity with a signature the rest of the file can keep.
 *
 * The queue send that follows — `recomputeEligibilityForCompany` — cannot join this, and should
 * not: enqueue *after* this returns `actioned: true`. A lost enqueue leaves correct evidence and a
 * stale verdict, which the next sweep repairs; an enqueue inside a transaction that then rolls back
 * would recompute against evidence that does not exist.
 */
export async function recordFlagOutcome(
  db: Db,
  { flagId, status, action, duplicateOfJobId, evidence }: RecordFlagOutcomeParams,
): Promise<FlagOutcome> {
  assertTerminal(status);
  if (evidence && status === "dismissed") {
    throw new Error("a dismissed flag withdraws its evidence; it may not also write some");
  }
  if (evidence && evidence.flagId !== flagId) {
    throw new Error("evidence.flagId must be the flag being actioned");
  }

  const act = sql`
    act as (
      update flags
         set status = ${status}::flag_status,
             action_taken = ${action}::flag_action,
             duplicate_of_job_id = coalesce(${duplicateOfJobId ?? null}::uuid, duplicate_of_job_id),
             resolved_at = case
                             when ${status}::flag_status in ('auto_resolved', 'dismissed')
                             then now() else resolved_at
                           end,
             processing_at = null,
             updated_at = now()
       where id = ${flagId}::uuid
         and status = 'open'
      returning id
    )`;

  // Only on a dismissal, and only for a verdict this call actually won.
  const withdrawn = sql`
    withdrawn as (
      delete from eligibility_evidence
       where ${status === "dismissed" ? sql`flag_id = (select id from act)` : sql`false`}
      returning id
    )`;

  const v = evidence ? evidenceValues(evidence) : null;
  const ev = v
    ? sql`
    ev as (
      insert into eligibility_evidence (
        subject, job_id, company_id, scope, way_of_working, verdict, source, weight,
        excerpt, source_url, flag_id, fetched_at, extractor_version
      )
      select ${v.subject}::evidence_subject, ${v.jobId}::uuid, ${v.companyId}::uuid, ${v.scope},
             ${v.wayOfWorking}::way_of_working, ${v.verdict}::eligibility_tier,
             ${v.source}::evidence_source, ${v.weight}::real, ${v.excerpt}, ${v.sourceUrl},
             act.id, ${v.fetchedAt}::timestamptz, ${v.extractorVersion}
        from act
      on conflict (flag_id, subject, scope) where flag_id is not null do nothing
      returning id
    )`
    : sql`ev as (select null::uuid as id where false)`;

  const rows = await db.execute<{ actioned: number; evidence_inserted: number; withdrawn: number }>(
    sql`
    with ${act}, ${withdrawn}, ${ev}
    select (select count(*) from act)::int as actioned,
           (select count(*) from ev)::int as evidence_inserted,
           (select count(*) from withdrawn)::int as withdrawn
  `,
  );
  const r = rows.rows[0];
  return {
    actioned: Number(r?.actioned ?? 0) > 0,
    evidenceInserted: Number(r?.evidence_inserted ?? 0) > 0,
    evidenceWithdrawn: Number(r?.withdrawn ?? 0),
  };
}

export interface CountIndependentFlagsParams {
  jobId: string;
  reason: FlagReason;
}

export interface IndependentFlagCount {
  /**
   * Sum of `flags.weight`. **This is the number PLAN section 6's "two independent flags" means**,
   * because it is the number the eligibility engine already sums for the same decision, and because
   * `user_id` goes null when an account is deleted — so a count of distinct users falls over time
   * while the evidence does not.
   */
  weightSum: number;
  /** Distinct non-null `user_id`. A floor, not a truth: deleted accounts are invisible here. */
  users: number;
  /** Rows counted, deleted accounts included. */
  flags: number;
}

/**
 * How much independent flagging one job has attracted for one reason.
 *
 * Dismissed flags are excluded: an owner who has looked at a report and thrown it out must not
 * still have it counting toward closing the job. Everything else counts, including flags already
 * actioned — the tier-downgrade rule is cumulative and a flag does not stop being evidence because
 * it has been processed.
 *
 * **Excludes demo**, via `flagIsReal`: the seed writes demo flags, and two of them must never close
 * a real job.
 */
export async function countIndependentFlags(
  db: Db,
  { jobId, reason }: CountIndependentFlagsParams,
): Promise<IndependentFlagCount> {
  const rows = await db.execute<{ weight_sum: string; users: number; flags: number }>(sql`
    select
      coalesce(sum(f.weight), 0)::numeric as weight_sum,
      count(distinct f.user_id)::int as users,
      count(*)::int as flags
      from flags f
      join jobs j on j.id = f.job_id
      join companies co on co.id = j.company_id
     where f.job_id = ${jobId}::uuid
       and f.reason = ${reason}::flag_reason
       and f.status <> 'dismissed'
       and ${flagIsReal("f", "j", "co")}
  `);
  const row = rows.rows[0];
  return {
    weightSum: Number(row?.weight_sum ?? 0),
    users: Number(row?.users ?? 0),
    flags: Number(row?.flags ?? 0),
  };
}

/**
 * Hold a job out of every Brief and every send while a human looks at it (the `scam` rule).
 *
 * Only from `open`, and returns whether the status moved. A job that is already closed, merged or
 * quarantined is not re-decided by a flag: closing is terminal, merging is a decision about
 * identity that a flag has no standing to undo, and a second quarantine is a no-op worth reporting
 * as one rather than as an action taken.
 *
 * `is_demo` is deliberately *not* in the predicate. The demo exclusion belongs where the decision
 * is made — `claimFlagsToProcess` and `countIndependentFlags` — and repeating it in the two
 * mechanical setters would suggest those are the guard, which they are not.
 */
export async function quarantineJob(db: Db, jobId: string): Promise<boolean> {
  const updated = await db.execute<{ id: string }>(sql`
    update jobs
       set status = 'quarantined', updated_at = now()
     where id = ${jobId}::uuid
       and status = 'open'
    returning id
  `);
  return updated.rows.length > 0;
}

/**
 * Close a job the "closed or fake" rule confirmed is gone. Only from `open`; returns whether the
 * status moved. `closed_at` is `coalesce`d so a re-close cannot rewrite when it actually went.
 */
export async function closeJob(db: Db, jobId: string): Promise<boolean> {
  const updated = await db.execute<{ id: string }>(sql`
    update jobs
       set status = 'closed', closed_at = coalesce(closed_at, now()), updated_at = now()
     where id = ${jobId}::uuid
       and status = 'open'
    returning id
  `);
  return updated.rows.length > 0;
}
