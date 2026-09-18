import type { ParsedProfilePartial } from "@pemby/core";
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { EMBEDDING_MODEL, createdAt, embedding, id, timestamps } from "./_shared";
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

/** `cv_files.source`: an uploaded file or pasted text. */
export const CV_SOURCES = ["file", "text"] as const;
export type CvSource = (typeof CV_SOURCES)[number];

/** `cv_files.stage_timings`: ISO timestamps, each set when its stage is reached. */
export type CvStageTimings = {
  uploadedAt?: string;
  extractedAt?: string;
  parseStartedAt?: string;
  firstPartialAt?: string;
  parsedAt?: string;
};

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

    /**
     * Explainable per-user scoring nudges (PLAN D6): every "Not for me" reason moves this one
     * user's future scores, and nobody else's. Keys are namespaced (`stack:kubernetes`,
     * `family:qa-sdet`, `company:<uuid>`); values are additive deltas in **score points on the
     * 0..100 scale**, not a 0..1 fraction.
     *
     * `NUDGE_LIMITS` in `@pemby/core` (`scoring/nudges.ts`) is the source of truth for the bounds
     * and the only place to change them: one "Not for me" removes `step` points from a key, each
     * key is clamped to `minPerKey`..`maxPerKey`, the sum applied to any one score is clamped to
     * `minTotal`..`maxTotal`, and a user holds at most `maxKeys` keys, the weakest `|delta|`
     * evicted first. Nothing here is a global weight.
     *
     * The comment in migration 0008 repeats an earlier, wrong "-1..1" range. That file is applied
     * and the migrator hashes it, so it was left alone deliberately; this comment is the correct
     * one.
     */
    scoringNudges: jsonb("scoring_nudges").$type<Record<string, number>>().notNull().default({}),

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
    /** Null for pasted text (`source = 'text'`). */
    bucketKey: text("bucket_key").unique(),
    source: text("source").$type<CvSource>().notNull().default("file"),
    fileName: text("file_name").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    sha256: text("sha256").notNull(),
    extractedText: text("extracted_text"),
    /** Validated, normalized `ParsedProfile` for phase 06 rows; demo and older rows may differ. */
    parsed: jsonb("parsed").$type<Record<string, unknown>>(),
    /** Latest streamed snapshot while `parse_status = 'parsing'`. */
    parsedPartial: jsonb("parsed_partial").$type<ParsedProfilePartial>(),
    /** Stable code for `unreadable` / `failed` (`scanned_or_empty`, `parse_failed`). No text. */
    errorCode: text("error_code"),
    /** Set while `parse_status = 'queued'` (AI cap reached): when the parse is retried. */
    queuedUntil: timestamp("queued_until", { withTimezone: true }),
    stageTimings: jsonb("stage_timings").$type<CvStageTimings>(),
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
    /**
     * The recipe generation this vector was last confirmed under: `EMBED_TEXT_VERSION`, and nothing
     * else, because a profile has no post hash to pin. Its only job is the one
     * `job_embeddings.source_key` does with its recipe half — make a bump to the embedding recipe
     * re-embed what is stored, rather than leave vectors built from text no current run would
     * produce.
     */
    sourceKey: text("source_key"),
    /**
     * When a run last confirmed this vector against the profile row and the newest parsed CV,
     * whether it wrote a new vector or found the content hash unchanged. Stamped from the
     * database's own `now()` and read as `checked_at < greatest(...)`; `job_embeddings.checked_at`
     * carries the reasoning, including why this is a watermark and not an equality test. Personal
     * data never lands here: it is a timestamp.
     */
    checkedAt: timestamp("checked_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [index("profile_embeddings_hnsw_idx").using("hnsw", t.embedding.op("halfvec_cosine_ops"))],
);

/** Fixed-window counters for CV upload limits (phase 06). One row per key and window start. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text("key").notNull(),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] })],
);

/**
 * Anonymous user waiting to be claimed by a new, not yet verified account (phase 06). Written at
 * sign-up; `/verify-email` runs the claim and deletes the row. Either user's deletion removes it.
 */
export const pendingClaims = pgTable("pending_claims", {
  anonymousUserId: text("anonymous_user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  newUserId: text("new_user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
});
