// PLAN section 6's five flag rules, one function each, plus the catch-all for "Other".
//
// Almost nothing here is new machinery, and that is on purpose — the vocabulary and the mechanisms
// were already in the schema and the engine before this phase started:
//
//   closed or fake  -> `checkJobLive` (new, and the only genuinely new entry point) + `closeJob`
//   not hiring here -> an `eligibility_evidence` row + `recomputeEligibilityForCompany`; the
//                      downgrade itself is already in the eligibility engine, which sums evidence
//                      `weight` and steps the tier down at 2. Nothing here re-implements it.
//   scam            -> `quarantineJob`, a `job_status` value that already existed
//   wrong details   -> a forced re-enrichment with the fixed picker value as a hint; the verdict is
//                      written by the enrich handler when the run finishes (`enrich/flag-followup`)
//   duplicate       -> `dedupeJob`, the same function ingestion uses
//
// **Three rules that bind every one of them.**
//
// 1. **Act, then record.** The world-changing call (`closeJob`, `quarantineJob`, `dedupeJob`) comes
//    first and `recordFlagOutcome` second. The claim is at-least-once by design, so a crash between
//    the two means the flag is re-offered and the action is attempted again — and every one of them
//    is a no-op the second time (`closeJob` and `quarantineJob` both require `status = 'open'`).
//    The other order would leave a flag saying `job_closed` on a job that is open.
// 2. **`recordFlagOutcome` is the only way to write a verdict or evidence**, and it writes both in
//    one statement, with the evidence insert selecting from the verdict's own CTE — so evidence is
//    written only if this worker won the race for the verdict. There is deliberately no other
//    writer; see the kernel's file header.
// 4. **No rule here passes `by`.** The kernel keys its legal transitions on who is acting
//    (`VERDICT_FROM`: `automation: ["open"]`, `owner: ["open", "needs_review"]`) and defaults to
//    `automation`, the restrictive set. So every call below can only resolve a flag that is still
//    `open` — which is the same set the claim offers. **Escalation is a one-way door for the
//    worker**: once a rule writes `needs_review` it has handed the flag to a person, and no rule may
//    take it back. A rule that passed `by: "owner"` would be lying about who it is, and would be
//    able to close the owner's own queue behind their back.
// 5. **No rule here writes `dismissed`**, and that matters since the kernel began withdrawing a
//    dismissed flag's evidence automatically. `dismissed` means "this report was wrong", which is a
//    judgement only a person makes; `auto_resolved` means "the automation acted on it" and keeps its
//    evidence. The rules only ever write `auto_resolved` or `needs_review`, so nothing here can
//    withdraw evidence, and `deleteFlagEvidence` is not called from this module at all.
// 3. **Queue after, never inside.** `requestCompanyEvidenceRecheck` and
//    `recomputeEligibilityForCompany` run after `recordFlagOutcome` returns `actioned: true`. A lost
//    enqueue leaves correct evidence and a stale verdict, which the next sweep repairs; an enqueue
//    inside a transaction that rolls back recomputes against evidence that does not exist.
//
// **Personal data.** Nothing here logs a value. `flag.country` is the flagger's residence and is
// written to `eligibility_evidence.scope`, where it is the *subject* of the evidence rather than a
// fact about a person — and it is the same column a careers-page check writes. It is never logged
// and never put in a queue payload. `flags.note` is never loaded at all.
import type { HttpClient } from "@pemby/ats";
import {
  closeJob,
  countIndependentFlags,
  quarantineJob,
  recordFlagOutcome,
  type Db,
  type FlagAction,
  type FlagToProcess,
  type TerminalFlagStatus,
} from "@pemby/db";
import { sql } from "drizzle-orm";
import type { PgBoss } from "pg-boss";

import { requestCompanyEvidenceRecheck } from "../company-evidence/workers";
import { requestFlagReEnrichment } from "../enrich/flag-followup";
import { recomputeEligibilityForCompany } from "../enrich/enrich-job";
import { checkJobLive } from "../ingest/job-live";
import { dedupeJob } from "../ingest/dedupe";

/**
 * The summed evidence weight at which a company's tier steps down.
 *
 * **Not this file's decision** — it is the number the eligibility engine already uses
 * (`packages/core/src/eligibility/engine/index.ts:1324`, which sums `weight` over red flag and
 * user_report evidence and steps the tier down at 2). It is written here so the two can be read
 * together, and nothing here re-implements the comparison.
 *
 * It is a *weight* sum, not a head count. On `./weight.ts`'s ladder that is ten brand-new accounts,
 * four ordinary onboarded ones, three pass holders — or two of the strongest reports the product
 * can produce.
 */
export const FLAG_CONSENSUS_WEIGHT = 2;

/**
 * The summed weight at which a flag stops being one person's opinion and a human should look.
 *
 * **Deliberately lower than `FLAG_CONSENSUS_WEIGHT`, because it buys something much cheaper.**
 * Reaching 2 downgrades a real company's eligibility tier for everybody; reaching this only puts a
 * row in the owner's review queue, and the cost of being wrong is that the owner reads one more
 * line. Two ordinary onboarded accounts (0.6 each) clear it, which is the "two people independently
 * said the same thing" that makes a judgement worth a human's time.
 */
export const FLAG_REVIEW_WEIGHT = 1.2;

/**
 * The least a single flag may weigh before it is allowed to **spend money**.
 *
 * `wrong_details` is the one rule that buys a model call, and it had no gate at all: one report from
 * a brand-new unonboarded account (0.20) bought a forced enrichment. 0.5 admits an ordinary
 * onboarded account (0.60) and a pass holder (0.80), and excludes a throwaway (0.20), a day-old
 * account (0.40) and anyone with a dismissed report behind them. A report below the bar is not
 * thrown away — it goes to the owner's review queue, where a person can act on it for free.
 */
export const FLAG_SPEND_MIN_WEIGHT = 0.5;

/**
 * How long one posting is off-limits for another flag-triggered enrichment.
 *
 * **The dedup against `pgboss.job` is not a budget and never was.** It matches `created`, `retry`,
 * `active` or recently-failed jobs, so a run that *completed* is not in that set — three accounts
 * flagging one posting bought three runs: A sends one, B and C find it queued and defer, A's run
 * finishes, and B and C each buy another when they are re-claimed. Ten accounts reached a hundred
 * forced runs a day against the **global $3 cap that kit generation shares**, which is a denial of
 * service on every free user's kit, not just a waste.
 *
 * Measured from `ai_usage` rows carrying `run_label = 'flag'` for the posting, so it counts runs
 * that actually happened rather than jobs that were queued. Together with the queue dedup it bounds
 * a posting at **one** flag-triggered model call a day however many people report it.
 */
export const FLAG_ENRICH_COOLDOWN_HOURS = 24;

export interface RuleDeps {
  db: Db;
  boss: PgBoss;
  http: HttpClient;
  signal: AbortSignal;
}

/**
 * What a rule decided.
 *
 * `deferred` is a real answer and not a failure: the rule handed the flag to something else
 * (a forced re-enrichment) that will write the verdict when it knows one. The flag stays claimed
 * and `claim_attempts` bounds how long that can go on.
 */
export type RuleResult =
  | { kind: "actioned"; status: TerminalFlagStatus; action: FlagAction; detail: string }
  | { kind: "deferred"; detail: string }
  /** Another worker wrote the verdict first. Normal under an at-least-once claim. */
  | { kind: "lost"; detail: string };

const review = (detail: string) =>
  ({ status: "needs_review", action: "sent_to_review" as FlagAction, detail }) as const;

/** `recordFlagOutcome` with no evidence, turned into a `RuleResult`. */
async function record(
  db: Db,
  flag: FlagToProcess,
  outcome: { status: TerminalFlagStatus; action: FlagAction; detail: string },
  extra: { duplicateOfJobId?: string } = {},
): Promise<RuleResult> {
  const { actioned } = await recordFlagOutcome(db, {
    flagId: flag.flagId,
    status: outcome.status,
    action: outcome.action,
    ...extra,
  });
  return actioned
    ? { kind: "actioned", status: outcome.status, action: outcome.action, detail: outcome.detail }
    : { kind: "lost", detail: outcome.detail };
}

/**
 * **Closed or fake** — re-check the posting on its own ATS board now; if it is gone, close it for
 * everyone.
 *
 * A board read is the vendor's own answer, and `checkJobLive` throws on anything transient so the
 * queue retries rather than closing a real job on a timed-out request. The three verdicts:
 *
 *   - **gone** (not listed, or the whole board 404s): close it. One report is enough, because this
 *     is the one rule whose evidence is not the report at all — it is the board. A person who is
 *     wrong about a posting being closed cannot make the board stop listing it.
 *   - **live** and the reports have reached `FLAG_REVIEW_WEIGHT`: the board still lists it and
 *     several people say it is fake. That is a judgement, so it goes to the owner. The review
 *     threshold, not the downgrade one: putting a line in a queue is not changing a company's tier.
 *   - **live** below that: nothing to do, spelled `auto_resolved` + `none`. (Never `open` + `none`:
 *     that clears `processing_at` and leaves the flag claimable on the very next poll, for ever.)
 */
export async function ruleClosedOrFake(deps: RuleDeps, flag: FlagToProcess): Promise<RuleResult> {
  const verdict = await checkJobLive(
    { db: deps.db, http: deps.http, signal: deps.signal },
    flag.jobId,
  );

  if (verdict.kind === "gone") {
    const closed = await closeJob(deps.db, flag.jobId);
    // Same rule as `ruleScam`: `closeJob` moves a job only from `open`, so `job_closed` is recorded
    // only when this call closed it. A posting someone else already closed is the outcome the
    // reporter wanted, but this flag did not cause it.
    return record(deps.db, flag, {
      status: "auto_resolved",
      action: closed ? "job_closed" : "none",
      detail: closed ? `gone:${verdict.reason}` : `gone:${verdict.reason}, already not open`,
    });
  }

  if (verdict.kind === "suspect") {
    // The board said no, but the read cannot be believed: an empty or mostly-empty listing, or a
    // whole-board 404 that ingestion has not seen persistently. Absence proves nothing in either
    // case, so nothing is closed and a person decides. The next scheduled board read settles it.
    const detail =
      verdict.reason === "empty-or-partial-listing"
        ? `suspect read: listed=${verdict.listed} missing=${verdict.missing}/${verdict.openJobs}`
        : `unconfirmed board 404: streak=${verdict.streak} spanHours=${verdict.spanHours}`;
    return record(deps.db, flag, review(detail));
  }

  if (verdict.kind === "unknown") {
    // Standing facts, not transient ones: no board configured, no connector for its ATS kind, the
    // job already moved out of `open`, or the row is demo. A human decides; a retry would not help.
    return record(deps.db, flag, review(`unverifiable:${verdict.reason}`));
  }

  const { weightSum } = await countIndependentFlags(deps.db, {
    jobId: flag.jobId,
    reason: flag.reason,
  });
  if (weightSum >= FLAG_REVIEW_WEIGHT) {
    return record(deps.db, flag, review(`live but weight=${weightSum.toFixed(2)}`));
  }
  return record(deps.db, flag, {
    status: "auto_resolved",
    action: "none",
    detail: `live weight=${weightSum.toFixed(2)}`,
  });
}

/**
 * **Doesn't hire from my country** — 1 flag queues re-verification and a company-evidence check;
 * 2+ independent flags downgrade the tier and record the evidence.
 *
 * The downgrade is **not implemented here**. It is already in the eligibility engine, which sums
 * `weight` over red `flag` / `user_report` evidence for a company and steps the tier down at 2. So
 * the rule is exactly two things: write one `eligibility_evidence` row carrying **this flag's own
 * weight**, and ask for the company to be recomputed.
 *
 * **Every flag of this reason writes its row, not only the second one.** An earlier draft of this
 * rule wrote evidence only once the flag count had already reached two, which cannot work: flag #1
 * would leave no row, so when flag #2 arrived the engine would sum one row and never downgrade. The
 * threshold lives in the engine, over the evidence; the rule's job is to make the evidence exist.
 * `eligibility_evidence_flag_subject_scope_uq` makes a retry's second insert a no-op, so
 * at-least-once processing cannot turn one report into two votes.
 *
 * `scope` is the flagger's residence country, or `"*"` when the surface recorded none. A
 * country-scoped statement and a worldwide one are different claims, and the unique index has
 * `scope` in it for exactly that reason.
 *
 * `requestCompanyEvidenceRecheck` is sent on every flag: it is a `stately` queue keyed on the
 * company id and returns null when a check is already queued, which is the correct no-op for the
 * second report about the same employer. It skips companies with no domain by itself.
 */
export async function ruleNotHiringFromCountry(
  deps: RuleDeps,
  flag: FlagToProcess,
): Promise<RuleResult> {
  const scope = flag.country?.trim().toUpperCase() || "*";

  // **The action is read off the evidence, not off the flag count, and that distinction is a real
  // defect this nearly shipped with.** `countIndependentFlags` counts every *open* flag on the job,
  // including ones no rule has processed yet — so with four flags waiting, the very first one to be
  // processed saw a sum of 2.4 and recorded `tier_downgraded` while exactly one evidence row
  // existed and the engine would not have downgraded anything. That is this phase's named failure
  // mode: a mechanism reporting on the work it did rather than the outcome it achieved.
  //
  // `evidenceSum` asks the question the engine asks, over the rows the engine reads, and adds this
  // flag's own weight because its row is written in the same statement as the verdict.
  const existing = await evidenceSum(deps.db, flag.companyId, scope, flag.flagId);
  const projected = existing + flag.weight;

  // **`reverification_queued`, unconditionally — `tier_downgraded` is no longer written here, and
  // that is deliberate.** It used to be chosen from `projected >= FLAG_CONSENSUS_WEIGHT`, which is a
  // *projection*, not an outcome: the engine additionally requires the way of working to match and
  // the verdict not to be `red` already, and `recomputeEligibilityForCompany` skips jobs whose
  // content hash has moved since they were enriched. So a flag could permanently record
  // `tier_downgraded` in the column the owner's queue renders while no tier had moved.
  //
  // It cannot be fixed by measuring, because of an ordering the kernel enforces: the evidence and
  // the verdict are written in **one statement**, and the recompute can only run once the evidence
  // exists — so the action has to be chosen before the outcome is knowable. Rather than guess, this
  // records what is true at write time (evidence recorded, re-verification queued) and *measures*
  // the tier movement afterwards, reporting it in the result and the log. The durable record of a
  // downgrade is `job_eligibility` and the evidence row, which is where it belongs.
  const before = await tierSignature(deps.db, flag.companyId, scope);

  const { actioned, evidenceInserted } = await recordFlagOutcome(deps.db, {
    flagId: flag.flagId,
    status: "auto_resolved",
    action: "reverification_queued",
    evidence: {
      flagId: flag.flagId,
      subject: "company",
      companyId: flag.companyId,
      scope,
      verdict: "red",
      source: "flag",
      // The flag's own weight, never 1: an abuser's report and a pass holder's must not count the
      // same, and this is the number the engine sums.
      weight: flag.weight,
      sourceUrl: flag.jobUrl,
    },
  });
  if (!actioned) return { kind: "lost", detail: `scope=${scope}` };

  // Both of these are sent after the verdict is committed, and both are idempotent.
  const recheck = await requestCompanyEvidenceRecheck(deps.boss, flag.companyId, "flag");
  const recomputed = await recomputeEligibilityForCompany(deps.db, flag.companyId);

  // Measured, not projected: the stored verdicts for this country, before and after the recompute.
  // `recomputed.jobs` counts rows **rewritten**, which is not the same question and is why it was
  // never enough on its own.
  const after = await tierSignature(deps.db, flag.companyId, scope);
  const moved = before !== after;

  return {
    kind: "actioned",
    status: "auto_resolved",
    action: "reverification_queued",
    detail: `scope=${scope} weight=${flag.weight.toFixed(2)} evidenceSum=${projected.toFixed(2)} atThreshold=${projected >= FLAG_CONSENSUS_WEIGHT} tiersMoved=${moved} inserted=${evidenceInserted} recheck=${recheck === null ? "already-queued" : "queued"} recomputed=${recomputed.jobs}`,
  };
}

/**
 * A signature of every stored eligibility verdict this company has for one country.
 *
 * Compared before and after the recompute to answer "did a tier actually move", which is the
 * question `recomputeEligibilityForCompany`'s return value does **not** answer — it counts rows it
 * rewrote, and rewriting a row to the same verdict is the common case.
 */
async function tierSignature(db: Db, companyId: string, scope: string): Promise<string> {
  const rows = await db.execute<{ sig: string | null }>(sql`
    select string_agg(je.job_id::text || ':' || je.way_of_working || ':' || je.tier, ','
                      order by je.job_id, je.way_of_working) as sig
      from job_eligibility je
      join jobs j on j.id = je.job_id
     where j.company_id = ${companyId}::uuid
       and je.scope = ${scope}
  `);
  return rows.rows[0]?.sig ?? "";
}

/**
 * The summed weight of red flag/user_report evidence the eligibility engine would see for this
 * company in this country, **excluding** the flag being processed.
 *
 * The same filter the engine applies (`source in ('flag','user_report') and verdict = 'red'`), over
 * company-subject rows scoped to this country or to `*` — the engine narrows its evidence to one
 * country before summing, and a worldwide row is relevant to every country.
 *
 * This is deliberately not `countIndependentFlags`. That counts flags, including ones no rule has
 * processed and which therefore have no evidence row; this counts what the engine will actually add
 * up. When the two disagree, the engine is right.
 */
async function evidenceSum(
  db: Db,
  companyId: string,
  scope: string,
  excludeFlagId: string,
): Promise<number> {
  const rows = await db.execute<{ total: string }>(sql`
    select coalesce(sum(weight), 0)::numeric as total
      from eligibility_evidence
     where subject = 'company'
       and company_id = ${companyId}::uuid
       and verdict = 'red'
       and source in ('flag', 'user_report')
       and scope in (${scope}, '*')
       and (flag_id is null or flag_id <> ${excludeFlagId}::uuid)
  `);
  return Number(rows.rows[0]?.total ?? 0);
}

/**
 * **Scam** — quarantine immediately, hidden for everyone, until the owner reviews it.
 *
 * `needs_review`, not `auto_resolved`: the job is out of every Brief and every send the moment this
 * runs, and nothing automatic ever lets it back. That is the owner's call, and dating the flag as
 * resolved would make the review queue's age column say a human had already looked.
 *
 * One report is enough. PLAN section 6 says "immediately", and the cost of being wrong is a real job
 * held back until the owner looks, against the cost of leaving a fraudulent post in front of people
 * for as long as it takes a second person to report it.
 */
export async function ruleScam(deps: RuleDeps, flag: FlagToProcess): Promise<RuleResult> {
  const held = await quarantineJob(deps.db, flag.jobId);
  // **`quarantined` only when this call actually quarantined something.** `quarantineJob` moves a
  // job only from `open`, so a posting that was already closed, merged or quarantined returns
  // false — and recording `quarantined` anyway put the falsehood in the column the owner's admin
  // queue renders and the truth in a log line nobody reads. A scam report on a posting that is
  // already gone still needs a person to look at it; it just did not cause a quarantine.
  return record(deps.db, flag, {
    status: "needs_review",
    action: held ? "quarantined" : "none",
    detail: held ? "quarantined" : "job was not open; nothing quarantined",
  });
}

/**
 * **Wrong details** — re-run enrichment on the public key with only the fixed picker value as a
 * hint; if it still disagrees, send it to review.
 *
 * This rule does not write a verdict. It enqueues the forced re-run and returns `deferred`; the
 * `enrich.job` handler compares the reported field before and after and writes `re_enriched` or
 * `sent_to_review` (`enrich/flag-followup.ts`). "Still disagreeing" is not knowable until the model
 * has answered, and a verdict written before then would be a guess in the audit trail.
 *
 * Two things that are easy to get wrong and are handled in `requestFlagReEnrichment`: `enrich.job`
 * is a `standard` queue, so `singletonKey` de-duplicates nothing and `send` never returns null —
 * the dedup is our own read of `pgboss.job`; and a plain re-send is a no-op, because
 * `computeEnrichment` short-circuits on an unchanged content hash and a post's text has not changed
 * because someone reported it, so the send carries `force: true`.
 *
 * **A named field with no value is normal, not a bug.** The Telegram path writes `field` and leaves
 * `field_value` null (`apps/bot/src/store-db.ts` inserts five columns and that is not one of them).
 * The hint then says a reader reports this field is wrong without claiming what it should be, and
 * nothing is invented. A flag with no `field` at all has nothing to re-check and goes to review.
 */
export async function ruleWrongDetails(deps: RuleDeps, flag: FlagToProcess): Promise<RuleResult> {
  if (flag.field === null) {
    return record(deps.db, flag, review("no field named"));
  }

  // **Two gates, because this is the rule that spends.** Neither existed and both are fixes for a
  // demonstrated attack; see `FLAG_SPEND_MIN_WEIGHT` and `FLAG_ENRICH_COOLDOWN_HOURS`. A report that
  // fails either is still read by a human — it goes to the review queue, which costs nothing.
  if (flag.weight < FLAG_SPEND_MIN_WEIGHT) {
    return record(deps.db, flag, review(`below the spend bar (weight=${flag.weight.toFixed(2)})`));
  }
  if (await enrichedByFlagRecently(deps.db, flag.jobId)) {
    return record(deps.db, flag, review(`another report already bought a run for this posting`));
  }

  const outcome = await requestFlagReEnrichment(deps.boss, deps.db, {
    jobId: flag.jobId,
    flagId: flag.flagId,
    hint: { field: flag.field, value: flag.fieldValue },
  });
  // `already-queued` leaves the flag claimed rather than writing a verdict: an enrichment run is on
  // its way, it carries a different flag's id, and this one is answered on a later claim. Bounded
  // by `claim_attempts`, after which the owner sees it.
  return {
    kind: "deferred",
    detail: `field=${flag.field} hasValue=${flag.fieldValue !== null} enrich=${outcome}`,
  };
}

/**
 * Whether a flag has already bought a model call for this posting inside the cooldown.
 *
 * Reads `ai_usage`, not `pgboss.job`: the ledger records calls that were **made**, and a completed
 * queue job has already left the state set the dedup looks at. `run_label = 'flag'` is written by
 * the `enrich.job` handler for exactly these runs, so this counts flag-triggered spend and not the
 * sweep's own enrichment of the same posting.
 */
async function enrichedByFlagRecently(db: Db, jobId: string): Promise<boolean> {
  const rows = await db.execute<{ one: number }>(sql`
    select 1 as one from ai_usage
     where job_id = ${jobId}::uuid
       and task = 'job-enrichment'
       and run_label = 'flag'
       and created_at > now() - make_interval(hours => ${FLAG_ENRICH_COOLDOWN_HOURS})
     limit 1
  `);
  return rows.rows.length > 0;
}

/**
 * **Duplicate** — merge.
 *
 * Runs `dedupeJob`, the same function ingestion runs on a newly seen posting: it groups the
 * company's open jobs by `dedupe_key` and description similarity, keeps the one seen first as
 * canonical and points the rest at it with `status = 'merged'`. Reusing it rather than writing a
 * merge here matters — a second merge implementation would decide canonicality differently from
 * ingestion and the two would fight over the same rows on every board read.
 *
 * If the flagged job ends up merged, that is the action, and `duplicate_of_job_id` is recorded on
 * the flag as well as on the job. If it does not, the dedupe found nothing to merge it with, and
 * only a human can say what the reporter meant — the flag surfaces carry no way to name the other
 * posting, so `flags.duplicate_of_job_id` is null on every row anyone can file today.
 *
 * **One side effect worth knowing about**: `dedupeJob` also *quarantines* a job whose group already
 * contains a quarantined sibling (`ingest/dedupe.ts`). That is ingestion's own rule and it is the
 * right one — a duplicate of a post held back for review is held back too — but it means this rule
 * can change a job's status to `quarantined` without saying `quarantined` in `action_taken`, since
 * the flag's verdict is about what it asked for. The job's own status is the record.
 */
export async function ruleDuplicate(deps: RuleDeps, flag: FlagToProcess): Promise<RuleResult> {
  const result = await dedupeJob(deps.db, flag.jobId);
  const canonical = result?.canonicalId ?? null;
  const merged =
    canonical !== null && canonical !== flag.jobId && result?.mergedIds.includes(flag.jobId);

  if (merged && canonical) {
    return record(
      deps.db,
      flag,
      { status: "auto_resolved", action: "merged", detail: `merged into ${canonical}` },
      { duplicateOfJobId: canonical },
    );
  }
  return record(deps.db, flag, review(`no duplicate found (canonical=${canonical ?? "-"})`));
}

/**
 * **Other** — straight to the owner's review queue, and nowhere else.
 *
 * This is the one reason that can carry free text, and the whole design is that the text never
 * leaves that queue: `claimFlagsToProcess` does not select `flags.note`, `loadFlagForRule` does not
 * select it, and `FlagToProcess` has no field for it. So this rule cannot read what was written even
 * if it wanted to — which is the point. (As of this phase nothing writes `note` on any surface
 * either: neither picker has a free-text field.)
 */
export async function ruleOther(deps: RuleDeps, flag: FlagToProcess): Promise<RuleResult> {
  return record(deps.db, flag, review("other"));
}

/** Dispatch on `flags.reason`. Exhaustive: a new enum value is a compile error here. */
export function ruleFor(reason: FlagToProcess["reason"]) {
  switch (reason) {
    case "closed_or_fake":
      return ruleClosedOrFake;
    case "not_hiring_from_country":
      return ruleNotHiringFromCountry;
    case "scam":
      return ruleScam;
    case "wrong_details":
      return ruleWrongDetails;
    case "duplicate":
      return ruleDuplicate;
    case "other":
      return ruleOther;
  }
}
