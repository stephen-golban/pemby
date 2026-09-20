// The "wrong details" rule's second half: re-enrich the post, then say whether the report was
// answered or whether a human has to look.
//
// PLAN section 6: *re-run enrichment on the public key with only the fixed picker values as hints;
// if still disagreeing, send to review.* "Still disagreeing" can only be decided **after** the model
// has run, so the verdict is written here, in the `enrich.job` handler, rather than by the flag rule
// that enqueued it. The flag stays claimed in the meantime, which is what `flags.processing_at` is
// for, and what `claim_attempts` bounds if the re-run never completes.
//
// The comparison is deliberately blunt: snapshot the reported field's stored value before the run,
// snapshot it again after, and ask whether it moved. It does **not** ask whether the new value
// matches what the flagger claimed — that would let one person dictate a posting's record, which is
// exactly what "free text never reaches a model" and "a hint is not evidence" exist to prevent. A
// field that moved means the report found something; a field that did not means the post still says
// what it said, and the owner decides.
import { recordFlagOutcome, schema, type Db, type FlagField } from "@pemby/db";
import { eq, sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";

import { ENRICH_JOB_QUEUE, type EnrichJobData } from "./queues";
import type { EnrichmentHint } from "./hints";

const { jobEnrichment } = schema;

/**
 * A stable string for the one enrichment field a `wrong_details` flag named, or "" when the job has
 * no enrichment row at all.
 *
 * `location` reads the enrichment's own answer (ways of working and any timezone requirement) and
 * not `jobs.locations`, because enrichment cannot change `jobs.locations` — that is the vendor's
 * text and only a board read moves it. Comparing a column the run cannot write would make every
 * location report "unchanged" forever.
 */
export async function snapshotEnrichmentField(
  db: Db,
  jobId: string,
  field: FlagField,
): Promise<string> {
  const [row] = await db
    .select({
      seniority: jobEnrichment.seniority,
      yearsMin: jobEnrichment.yearsMin,
      stack: jobEnrichment.stack,
      salaryMin: jobEnrichment.salaryMin,
      salaryMax: jobEnrichment.salaryMax,
      salaryCurrency: jobEnrichment.salaryCurrency,
      salaryPeriod: jobEnrichment.salaryPeriod,
      waysOfWorking: jobEnrichment.waysOfWorking,
      timezoneRequirement: jobEnrichment.timezoneRequirement,
      eligibilityRules: jobEnrichment.eligibilityRules,
      visaSponsorship: jobEnrichment.visaSponsorship,
    })
    .from(jobEnrichment)
    .where(eq(jobEnrichment.jobId, jobId));
  if (!row) return "";

  const sorted = (values: readonly string[]) => [...values].sort().join(",");
  switch (field) {
    case "salary":
      return [row.salaryMin, row.salaryMax, row.salaryCurrency, row.salaryPeriod].join("|");
    case "seniority":
      return `${row.seniority ?? ""}|${row.yearsMin ?? ""}`;
    case "stack":
      return sorted(row.stack);
    case "location":
      return `${sorted(row.waysOfWorking)}|${row.timezoneRequirement ?? ""}`;
    case "eligibility":
      return `${JSON.stringify(row.eligibilityRules)}|${row.visaSponsorship ?? ""}`;
  }
}

export interface FlagReEnrichmentRequest {
  jobId: string;
  flagId: string;
  hint: EnrichmentHint | null;
}

export type FlagReEnrichmentOutcome = "sent" | "already-queued";

/**
 * Enqueue a forced re-enrichment for a flag, or report that one is already in flight.
 *
 * **`enrich.job` is a `standard` queue**, so `singletonKey` creates no unique index and `send` never
 * returns `null` for a duplicate — pass it the same key twice and you get two jobs and two model
 * calls. Every other producer of this queue does its own de-duplication against `pgboss.job`
 * (`selectJobsToEnrich`'s `skipQueued` term) and so does this, with the same predicate: a job in
 * `created`, `retry` or `active`, or one that failed in the last 24 hours, means do not send.
 *
 * The 24-hour failed window is copied deliberately rather than shortened. A post that makes the
 * model fail keeps failing, and a flag on it would otherwise re-queue a paid call every time the
 * claim went stale.
 */
export async function requestFlagReEnrichment(
  boss: PgBoss,
  db: Db,
  request: FlagReEnrichmentRequest,
): Promise<FlagReEnrichmentOutcome> {
  const { jobId, flagId, hint } = request;
  const queued = await db.execute<{ one: number }>(sql`
    select 1 as one from pgboss.job q
     where q.name = ${ENRICH_JOB_QUEUE}
       and q.singleton_key = ${jobId}
       and (q.state in ('created', 'retry', 'active')
            or (q.state = 'failed' and q.completed_on > now() - interval '24 hours'))
     limit 1
  `);
  if (queued.rows.length > 0) return "already-queued";

  await boss.send(
    ENRICH_JOB_QUEUE,
    {
      jobId,
      force: true,
      flagId,
      ...(hint ? { hints: [{ field: hint.field, value: hint.value }] } : {}),
    } satisfies EnrichJobData,
    { singletonKey: jobId },
  );
  return "sent";
}

/** What the re-run turned out to be, for the flag that asked for it. */
export type FlagRunResult =
  /** The reported field's stored value moved. The report found something. */
  | "changed"
  /** The run finished and the field says exactly what it said. Still disagreeing. */
  | "unchanged"
  /** The run did not happen, or produced nothing to compare, and nothing further is coming. */
  | "not-run";

/**
 * Write the `wrong_details` flag's verdict once its re-run has finished.
 *
 * `changed` is the only outcome that resolves itself: the post's record moved, which is what the
 * report asked for. `unchanged` is PLAN section 6's "if still disagreeing, send to review" — the
 * model read the post again, with the reader's field in front of it, and answered the same. A run
 * that never happened is the same answer from the owner's point of view: nobody has looked yet.
 *
 * No evidence row. A disagreement about pay or seniority is not eligibility evidence, and the
 * engine's weight sum is the tier-downgrade mechanism for one specific reason
 * (`not_hiring_from_country`). Passing evidence here would push a real company's tier down because
 * someone thought the salary band was wrong.
 *
 * Returns whether this call won the `status = 'open'` race; `false` means another processor already
 * wrote a verdict, and is a normal outcome, not an error.
 */
export async function resolveFlagRun(
  db: Db,
  flagId: string,
  result: FlagRunResult,
): Promise<boolean> {
  const outcome =
    result === "changed"
      ? ({ status: "auto_resolved", action: "re_enriched" } as const)
      : ({ status: "needs_review", action: "sent_to_review" } as const);
  const { actioned } = await recordFlagOutcome(db, { flagId, ...outcome });
  return actioned;
}
