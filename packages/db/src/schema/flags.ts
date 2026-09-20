import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestamps } from "./_shared";
import { user } from "./auth";
import {
  eligibilityTier,
  evidenceSource,
  evidenceSubject,
  flagAction,
  flagField,
  flagReason,
  flagStatus,
  wayOfWorking,
} from "./enums";
import { companies, jobs } from "./jobs";

/** User flags on jobs (PLAN D26, section 6). */
export const flags = pgTable(
  "flags",
  {
    id: id(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    /** Nullable so flag history and evidence survive account deletion. */
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    reason: flagReason("reason").notNull(),
    /** "Doesn't hire from my country": the flagger's country. */
    country: text("country"),
    /** "Wrong details": fixed picker, no free text. */
    field: flagField("field"),
    fieldValue: text("field_value"),
    /** Free text from "Other" only. Owner review queue only; never sent to any model. */
    note: text("note"),
    /** Pass holders and accurate past flaggers weigh more. */
    weight: real("weight").notNull().default(1),
    status: flagStatus("status").notNull().default("open"),
    /**
     * When a worker claimed this flag for the rules in PLAN section 6; null when unclaimed.
     *
     * The flag rules close jobs, quarantine jobs and queue re-enrichment, and re-enrichment costs a
     * model call. So processing one flag twice is a double spend and a second write against a real
     * job, and `flag_status` has no in-flight value to turn a selection into a claim — its four
     * values (`open`, `auto_resolved`, `needs_review`, `dismissed`) are all verdicts, and writing a
     * verdict before the rule has decided would be a lie in the audit trail. Adding a fifth value
     * would be an enum migration, which must ship alone in its own file (see 0012).
     *
     * A nullable timestamp does the same job without touching the enum: `claimFlagsToProcess`
     * stamps it inside one `update ... where id in (select ... for update skip locked)`, so exactly
     * one worker gets each row, and a claim older than the caller's cutoff is re-offered — the same
     * shape and the same trade as `delivery_log`'s claim (see `../queries/delivery.ts`), resolved
     * the same way: a crashed processor means the flag is looked at again, not that it is lost.
     *
     * `recordFlagAction` clears it when it writes the verdict.
     */
    processingAt: timestamp("processing_at", { withTimezone: true }),
    /**
     * How many times this flag has been claimed. Bounds the crash loop.
     *
     * `processing_at` alone makes a flag that is claimed and never resolved claimable again for
     * ever: the stale cutoff re-offers it, the rule runs again, and every cycle can re-queue
     * enrichment, which costs a model call. A worker that reliably dies on one poisonous flag would
     * therefore spend money on it indefinitely, and nothing in the database would say so.
     *
     * `claimFlagsToProcess` increments this as it claims and refuses a flag at or above its
     * `maxAttempts`. A flag that exhausts its attempts stops being claimed and stays `status =
     * 'open'`, which is exactly where `selectFlagsForReview` finds it — so the outcome of giving up
     * is that a human sees it, not that it disappears.
     *
     * `not null default 0`: in Postgres 11+ a NOT NULL column with a constant default is a catalog
     * change, not a table rewrite, so this is as additive as the nullable columns beside it. The two
     * seeded staging flags get 0.
     */
    claimAttempts: smallint("claim_attempts").notNull().default(0),
    actionTaken: flagAction("action_taken"),
    duplicateOfJobId: uuid("duplicate_of_job_id").references(() => jobs.id, {
      onDelete: "set null",
    }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("flags_job_reason_idx").on(t.jobId, t.reason),
    /**
     * One flag per user, job and reason. Partial because `user_id` is set null when the account
     * is deleted, and those historical flags must not collide.
     */
    uniqueIndex("flags_job_user_reason_uq")
      .on(t.jobId, t.userId, t.reason)
      .where(sql`${t.userId} is not null`),
    index("flags_user_created_idx").on(t.userId, t.createdAt),
    index("flags_status_idx").on(t.status),
  ],
);

/** Evidence behind an eligibility verdict, for one job or a whole company. */
export const eligibilityEvidence = pgTable(
  "eligibility_evidence",
  {
    id: id(),
    subject: evidenceSubject("subject").notNull(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "cascade" }),
    /** Country code, region code or "*". */
    scope: text("scope").notNull(),
    wayOfWorking: wayOfWorking("way_of_working"),
    verdict: eligibilityTier("verdict").notNull(),
    source: evidenceSource("source").notNull(),
    weight: real("weight").notNull().default(1),
    excerpt: text("excerpt"),
    sourceUrl: text("source_url"),
    flagId: uuid("flag_id").references(() => flags.id, { onDelete: "set null" }),
    /** When the source page or post was read. */
    fetchedAt: timestamp("fetched_at", { withTimezone: true }),
    /** Version of the rules or prompt that extracted this evidence. */
    extractorVersion: text("extractor_version"),
    createdAt: createdAt(),
  },
  (t) => [
    check(
      "eligibility_evidence_subject_ck",
      sql`(${t.subject} = 'job' and ${t.jobId} is not null) or (${t.subject} = 'company' and ${t.companyId} is not null)`,
    ),
    /**
     * One evidence row per flag, per subject, per scope.
     *
     * The tier-downgrade rule sums `weight` over red flag evidence and steps the tier down at 2
     * (`@pemby/core`'s `eligibility/engine`), so a **duplicate** of one flag's evidence is not a
     * tidiness problem: two copies of one person's single flag reach the threshold on their own and
     * downgrade a real company. The flag processor is deliberately at-least-once — a worker that
     * dies between writing evidence and writing the verdict has its flag re-offered after the stale
     * cutoff — so the second write is not a hypothetical, it is the designed failure mode.
     *
     * **Why not a bare unique on `flag_id`.** One flag legitimately produces two rows: a
     * `subject='job'` row about the post it was filed against, and a `subject='company'` row about
     * the employer behind it. `scope` is in the key as well, because a flag whose evidence is
     * country-scoped and a flag whose evidence is worldwide are different statements — while a
     * *retry* re-writes the identical subject and scope and is therefore caught. `verdict` is
     * deliberately **not** in the key: a retry that arrived at a different verdict must be refused,
     * not stored twice.
     *
     * Partial on `flag_id is not null` because almost every evidence row comes from a post or a
     * careers page and carries no flag; there is no reason to index those.
     */
    uniqueIndex("eligibility_evidence_flag_subject_scope_uq")
      .on(t.flagId, t.subject, t.scope)
      .where(sql`${t.flagId} is not null`),
    index("eligibility_evidence_job_idx").on(t.jobId),
    index("eligibility_evidence_company_scope_idx").on(t.companyId, t.scope),
  ],
);
