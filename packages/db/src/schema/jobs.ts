import type { EngineReasonKey } from "@pemby/core";
import { sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
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
  boardStatus,
  eligibilityTier,
  employmentType,
  jobStatus,
  keyClass,
  payPeriod,
  seniority,
  wayOfWorking,
} from "./enums";

export type CompanyEvidenceStatus = "found" | "none" | "fetch-failed";

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
    /** Vendor data region of the board ("us" or "eu"); picks the vendor's API host. */
    atsRegion: text("ats_region").notNull().default("us"),
    /** True while the board is in a private source list; the worker reads only enabled boards. */
    ingestEnabled: boolean("ingest_enabled").notNull().default(false),
    /** Name of the private source list that supplied the board; null for manual rows. */
    sourceList: text("source_list"),
    hqCountry: text("hq_country"),
    /** When the company-level hiring-country evidence was last checked (phase 05). */
    evidenceCheckedAt: timestamp("evidence_checked_at", { withTimezone: true }),
    /** Result of that check: `found` | `none` | `fetch-failed`; null until first checked. */
    evidenceStatus: text("evidence_status").$type<CompanyEvidenceStatus>(),
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
    /** Every location string the board lists, joined with "; ". */
    locationText: text("location_text"),
    /** Plain-text description. */
    rawText: text("raw_text").notNull(),
    descriptionHtml: text("description_html"),
    locations: text("locations")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** remote | hybrid | onsite | unknown, as the connector normalized it. */
    workplaceType: text("workplace_type"),
    department: text("department"),
    /** Raw vendor value ("Full-time", "FULL_TIME"); enrichment maps it later. */
    employmentType: text("employment_type"),
    salaryMin: numeric("salary_min", { mode: "number" }),
    salaryMax: numeric("salary_max", { mode: "number" }),
    salaryCurrency: text("salary_currency"),
    salaryPeriod: payPeriod("salary_period"),
    salaryText: text("salary_text"),
    /** The vendor's own updated time, when it exposes one. */
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    /** Last per-job detail read, for vendors whose list lacks descriptions. */
    detailFetchedAt: timestamp("detail_fetched_at", { withTimezone: true }),
    /** PLAN D10 family from the rules-based role filter. */
    roleFamily: text("role_family"),
    /** Normalized title plus sorted normalized locations; candidates for dedupe share it. */
    dedupeKey: text("dedupe_key"),
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
    index("jobs_dedupe_key_idx").on(t.dedupeKey),
  ],
);

/**
 * Health of one company's job board, one row per company, written by the worker on every read of
 * the board (phase 04). The admin page reads it through `getSourceHealth`.
 */
export const companySourceHealth = pgTable(
  "company_source_health",
  {
    companyId: uuid("company_id")
      .primaryKey()
      .references(() => companies.id, { onDelete: "cascade" }),
    lastAttemptAt: timestamp("last_attempt_at", { withTimezone: true }),
    lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastErrorKind: text("last_error_kind"),
    /** Short, no response bodies. */
    lastErrorMessage: text("last_error_message"),
    consecutiveErrors: integer("consecutive_errors").notNull().default(0),
    /** Consecutive `board-not-found` reads; at 3 the board is disabled and its jobs closed. */
    consecutiveNotFound: integer("consecutive_not_found").notNull().default(0),
    /** First read of the current not-found streak; disabling needs the streak to span 24 hours. */
    notFoundSince: timestamp("not_found_since", { withTimezone: true }),
    totalErrors: integer("total_errors").notNull().default(0),
    totalRuns: integer("total_runs").notNull().default(0),
    /** Jobs on the board at the last successful read, before the role filter. */
    jobsListed: integer("jobs_listed").notNull().default(0),
    /** Jobs kept by the role filter at the last successful read. */
    jobsKept: integer("jobs_kept").notNull().default(0),
    /** Open jobs of this company in the database after the last successful read. */
    jobsOpen: integer("jobs_open").notNull().default(0),
    boardStatus: boardStatus("board_status").notNull().default("active"),
    /**
     * Consecutive successful reads that looked like a false empty board (empty, or missing more
     * than 80% of the open jobs). Disappeared jobs close only on the second such read.
     */
    consecutiveEmptyLists: integer("consecutive_empty_lists").notNull().default(0),
    /** When the current run of suspicious reads started. */
    emptyListSince: timestamp("empty_list_since", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("company_source_health_board_status_idx").on(t.boardStatus)],
);

export type VisaSponsorship = "yes" | "no" | "unknown";

/**
 * Structured timezone constraint from the post. Offsets are hours from UTC. `overlapHours` is the
 * required overlap with the window; `zones` keeps named zones as written ("CET", "US Eastern").
 */
export type TimezoneConstraint = {
  minUtcOffset?: number | null;
  maxUtcOffset?: number | null;
  overlapHours?: number | null;
  zones?: string[];
  excerpt?: string | null;
};

/** One item of evidence the eligibility engine used for a `job_eligibility` row. */
export type EligibilityEvidenceItem = {
  /** Same values as the `evidence_source` enum. */
  source: string;
  excerpt: string | null;
  url: string | null;
};

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
    /** Structured form of `timezone_requirement`; null when the post has none. */
    timezoneConstraint: jsonb("timezone_constraint").$type<TimezoneConstraint>(),
    /** `yes` | `no` | `unknown`; null for rows enriched before phase 05. */
    visaSponsorship: text("visa_sponsorship").$type<VisaSponsorship>(),
    redFlags: text("red_flags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** Raw rules as the model returned them; `job_eligibility` is the queryable expansion. */
    eligibilityRules: jsonb("eligibility_rules").$type<EligibilityRule[]>().notNull().default([]),
    /** Posts asking the candidate for money are blocked (PLAN D11). */
    asksCandidateForMoney: boolean("asks_candidate_for_money").notNull().default(false),
    model: text("model").notNull(),
    /** `PromptTemplate.versionId` of the `job-enrichment` prompt. */
    promptVersion: text("prompt_version").notNull(),
    keyClass: keyClass("key_class").notNull().default("public"),
    /** `jobs.content_hash` this enrichment was made from; re-enrich when it differs. */
    contentHash: text("content_hash"),
    /** The full validated model output, for audit and for re-running the engine without calls. */
    output: jsonb("output").$type<Record<string, unknown>>(),
    /** Version of the deterministic rules that ran alongside the model. */
    rulesVersion: text("rules_version"),
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
    /** Short list of the evidence the engine used for this verdict. */
    evidence: jsonb("evidence").$type<EligibilityEvidenceItem[]>().notNull().default([]),
    /**
     * Stable key from `ENGINE_REASONS`; `reason` is only the English rendering of it. Phase 07
     * renders the key through i18n instead of re-parsing the text. Null for rows written before
     * migration 0008 and for rows the engine wrote without a key.
     */
    reasonKey: text("reason_key").$type<EngineReasonKey>(),
    /** Params `renderReason` fills into the key's template ({ country: "Moldova" }). */
    reasonParams: jsonb("reason_params").$type<Record<string, string>>().notNull().default({}),
    engineVersion: text("engine_version"),
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
