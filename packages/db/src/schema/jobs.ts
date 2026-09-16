import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { EMBEDDING_MODEL, embedding, id, timestamps } from "./_shared";
import {
  atsType,
  eligibilityTier,
  employmentType,
  jobStatus,
  keyClass,
  payPeriod,
  seniority,
  wayOfWorking,
} from "./enums";

export const companies = pgTable(
  "companies",
  {
    id: id(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    domain: text("domain"),
    websiteUrl: text("website_url"),
    careersUrl: text("careers_url"),
    atsType: atsType("ats_type"),
    atsBoardToken: text("ats_board_token"),
    hqCountry: text("hq_country"),
    /** When the company-level hiring-country evidence was last checked (phase 05). */
    evidenceCheckedAt: timestamp("evidence_checked_at", { withTimezone: true }),
    isDemo: boolean("is_demo").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    unique("companies_ats_board_uq").on(t.atsType, t.atsBoardToken),
    index("companies_domain_idx").on(t.domain),
  ],
);

export const jobs = pgTable(
  "jobs",
  {
    id: id(),
    /** Restrict: duplicate companies are merged by re-pointing jobs, never by deleting. */
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "restrict" }),
    /** Connector that found the job: an ATS name, or "demo" for seed data. */
    source: text("source").notNull(),
    externalId: text("external_id").notNull(),
    url: text("url").notNull(),
    applyUrl: text("apply_url"),
    title: text("title").notNull(),
    locationText: text("location_text"),
    rawText: text("raw_text").notNull(),
    /** Hash of the raw post; a change triggers re-enrichment. */
    contentHash: text("content_hash").notNull(),
    status: jobStatus("status").notNull().default("open"),
    postedAt: timestamp("posted_at", { withTimezone: true }),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastVerifiedLiveAt: timestamp("last_verified_live_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    duplicateOfJobId: uuid("duplicate_of_job_id").references((): AnyPgColumn => jobs.id, {
      onDelete: "set null",
    }),
    isDemo: boolean("is_demo").notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    /** External ids are only unique per board, so the company is part of the key. */
    unique("jobs_company_source_external_id_uq").on(t.companyId, t.source, t.externalId),
    index("jobs_company_id_idx").on(t.companyId),
    index("jobs_status_verified_idx").on(t.status, t.lastVerifiedLiveAt),
    index("jobs_first_seen_at_idx").on(t.firstSeenAt),
  ],
);

export type EligibilityRule = {
  scope: string;
  waysOfWorking: string[];
  tier: "green" | "yellow" | "white" | "red";
  reason: string;
  evidence?: string;
};

/** LLM enrichment of one job (public key). One current row per job. */
export const jobEnrichment = pgTable(
  "job_enrichment",
  {
    jobId: uuid("job_id")
      .primaryKey()
      .references(() => jobs.id, { onDelete: "cascade" }),
    roleFamily: text("role_family"),
    seniority: seniority("seniority"),
    yearsMin: smallint("years_min"),
    stack: text("stack")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    domains: text("domains")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    employmentTypes: employmentType("employment_types")
      .array()
      .notNull()
      .default(sql`'{}'`),
    waysOfWorking: wayOfWorking("ways_of_working")
      .array()
      .notNull()
      .default(sql`'{}'`),
    salaryMin: integer("salary_min"),
    salaryMax: integer("salary_max"),
    salaryCurrency: text("salary_currency"),
    salaryPeriod: payPeriod("salary_period"),
    timezoneRequirement: text("timezone_requirement"),
    /** Raw rules as the model returned them; `job_eligibility` is the queryable expansion. */
    eligibilityRules: jsonb("eligibility_rules").$type<EligibilityRule[]>().notNull().default([]),
    /** Posts asking the candidate for money are blocked (PLAN D11). */
    asksCandidateForMoney: boolean("asks_candidate_for_money").notNull().default(false),
    model: text("model").notNull(),
    /** `PromptTemplate.versionId` of the `job-enrichment` prompt. */
    promptVersion: text("prompt_version").notNull(),
    keyClass: keyClass("key_class").notNull().default("public"),
    enrichedAt: timestamp("enriched_at", { withTimezone: true }).notNull().defaultNow(),
    ...timestamps(),
  },
  (t) => [
    index("job_enrichment_stack_gin_idx").using("gin", t.stack),
    index("job_enrichment_ways_gin_idx").using("gin", t.waysOfWorking),
    index("job_enrichment_seniority_idx").on(t.seniority),
  ],
);

/**
 * Eligibility per job, per scope (country, region or "*") and way of working: the hard gate the
 * matcher reads (PLAN D2, section 4 rule 1). Rebuilt from enrichment, evidence and flags.
 */
export const jobEligibility = pgTable(
  "job_eligibility",
  {
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    scope: text("scope").notNull(),
    wayOfWorking: wayOfWorking("way_of_working").notNull(),
    tier: eligibilityTier("tier").notNull(),
    reason: text("reason").notNull(),
    ...timestamps(),
  },
  (t) => [
    primaryKey({ name: "job_eligibility_pk", columns: [t.jobId, t.scope, t.wayOfWorking] }),
    index("job_eligibility_scope_tier_idx").on(t.scope, t.tier, t.wayOfWorking),
  ],
);

/** Job embedding (PLAN D19). One current vector per job. */
export const jobEmbeddings = pgTable(
  "job_embeddings",
  {
    jobId: uuid("job_id")
      .primaryKey()
      .references(() => jobs.id, { onDelete: "cascade" }),
    model: text("model").notNull().default(EMBEDDING_MODEL),
    contentHash: text("content_hash").notNull(),
    embedding: embedding(),
    ...timestamps(),
  },
  (t) => [index("job_embeddings_hnsw_idx").using("hnsw", t.embedding.op("halfvec_cosine_ops"))],
);
