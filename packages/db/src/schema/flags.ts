import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgTable,
  real,
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
    index("eligibility_evidence_job_idx").on(t.jobId),
    index("eligibility_evidence_company_scope_idx").on(t.companyId, t.scope),
  ],
);
