import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { EMBEDDING_MODEL, embedding, id, timestamps } from "./_shared";
import { user } from "./auth";
import {
  cvParseStatus,
  employmentType,
  englishLevel,
  payPeriod,
  seniority,
  wayOfWorking,
} from "./enums";

export type WorkPermit = { country: string; kind: string; expiresOn?: string };

/** Everything onboarding collects (PLAN D5). One row per user. */
export const profiles = pgTable(
  "profiles",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    displayName: text("display_name"),

    // Step 1: eligibility.
    citizenships: text("citizenships")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    residenceCountry: text("residence_country"),
    timezone: text("timezone"),
    minOverlapHours: smallint("min_overlap_hours"),
    hasOwnCompany: boolean("has_own_company").notNull().default(false),
    permits: jsonb("permits").$type<WorkPermit[]>().notNull().default([]),
    englishLevel: englishLevel("english_level"),

    // Step 2: ways of working.
    waysOfWorking: wayOfWorking("ways_of_working")
      .array()
      .notNull()
      .default(sql`'{}'`),
    employmentTypes: employmentType("employment_types")
      .array()
      .notNull()
      .default(sql`'{}'`),

    // Step 3: role and money.
    titles: text("titles")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    seniority: seniority("seniority"),
    yearsExperience: smallint("years_experience"),
    stack: text("stack")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    dealbreakers: text("dealbreakers")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    minRate: integer("min_rate"),
    minRateCurrency: text("min_rate_currency"),
    minRatePeriod: payPeriod("min_rate_period"),
    hideNoSalary: boolean("hide_no_salary").notNull().default(false),
    /** Pass holders may opt into yellow matches (PLAN D2, D13). */
    includeYellow: boolean("include_yellow").notNull().default(false),

    // Asked later, in context.
    companyPrefs: jsonb("company_prefs").$type<Record<string, unknown>>().notNull().default({}),
    applicationDefaults: jsonb("application_defaults")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),

    referralCode: text("referral_code").unique(),
    onboardingCompletedAt: timestamp("onboarding_completed_at", { withTimezone: true }),
    /** Seeded demo data on staging. */
    isDemo: boolean("is_demo").notNull().default(false),
    ...timestamps(),
  },
  (t) => [index("profiles_residence_country_idx").on(t.residenceCountry)],
);

/**
 * Uploaded CVs. Anonymous uploads (PLAN D4) belong to a Better Auth anonymous user and carry
 * `expires_at` = upload + 24h.
 *
 * `user_id` is ON DELETE RESTRICT: a `cv_files` row points at a bucket object that Postgres
 * cannot delete, so a cascade would orphan the file. Deleting a user fails while CV rows exist;
 * whoever deletes a user removes the bucket objects and these rows first.
 *
 * Contract for the auth worker (anonymous user -> real account, PLAN D4). Before Better Auth
 * deletes the anonymous user (the anonymous plugin's `onLinkAccount` hook is the intended place;
 * confirm it runs before the delete in the installed version), in one transaction:
 *   1. Re-parent to the new user id: `cv_files`, `profiles`, `matches`, `applications`, `kits`,
 *      `channels`, and `referrals` on the referee side (`referee_user_id`).
 *   2. If the target account already has a profile, keep the target's profile and delete the
 *      anonymous one (its `profile_embeddings` row cascades) instead of re-parenting it.
 *      Unique keys (`matches`, `applications` per user and job) also keep the target's row.
 *   3. Clear `cv_files.expires_at` on the re-parented rows.
 *
 * The 24h cleanup of unclaimed uploads deletes, in order: the bucket objects, the `cv_files`
 * rows, then the anonymous user (which cascades the rest).
 */
export const cvFiles = pgTable(
  "cv_files",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    bucketKey: text("bucket_key").notNull().unique(),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    extractedText: text("extracted_text"),
    parsed: jsonb("parsed").$type<Record<string, unknown>>(),
    parseStatus: cvParseStatus("parse_status").notNull().default("pending"),
    parseModel: text("parse_model"),
    /** `PromptTemplate.versionId` of the `cv-parse` prompt. */
    parsePromptVersion: text("parse_prompt_version"),
    parsedAt: timestamp("parsed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index("cv_files_user_id_idx").on(t.userId),
    index("cv_files_expires_at_idx")
      .on(t.expiresAt)
      .where(sql`${t.expiresAt} is not null`),
  ],
);

/** Profile embedding for matching (private key, ZDR). One current vector per profile. */
export const profileEmbeddings = pgTable(
  "profile_embeddings",
  {
    profileId: uuid("profile_id")
      .primaryKey()
      .references(() => profiles.id, { onDelete: "cascade" }),
    model: text("model").notNull().default(EMBEDDING_MODEL),
    /** Hash of the text that was embedded, to skip unchanged re-embeds. */
    contentHash: text("content_hash").notNull(),
    embedding: embedding(),
    ...timestamps(),
  },
  (t) => [index("profile_embeddings_hnsw_idx").using("hnsw", t.embedding.op("halfvec_cosine_ops"))],
);
