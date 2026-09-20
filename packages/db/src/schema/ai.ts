import type { AiCallOutcome } from "@pemby/core";
import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestamps } from "./_shared";
import { user } from "./auth";
import { aiTask, keyClass } from "./enums";
import { companies, jobs } from "./jobs";

/**
 * Cost ledger for every model call; the $3/day cap sums this (PLAN D18). One row per attempt
 * that reached OpenRouter: a fallback to the next model, or a repair retry, is its own row.
 */
export const aiUsage = pgTable(
  "ai_usage",
  {
    id: id(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    task: aiTask("task").notNull(),
    model: text("model").notNull(),
    keyClass: keyClass("key_class").notNull(),
    /** `PromptTemplate.versionId` from the private config; null for prompt-less tasks. */
    promptVersion: text("prompt_version"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** From the response; an estimate when `cost_estimated` (e.g. a timed-out attempt). */
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    costEstimated: boolean("cost_estimated").notNull().default(false),
    /** OpenRouter generation id, for reconciliation. */
    generationId: text("generation_id"),
    /** Wall time of this attempt alone (not the whole fallback/repair chain). */
    latencyMs: integer("latency_ms"),
    /**
     * `ok` | `repaired` (valid after one repair retry) | `invalid` (schema still invalid) |
     * `error`. Values: `AI_CALL_OUTCOMES` in `@pemby/core`.
     */
    outcome: text("outcome").$type<AiCallOutcome>().notNull().default("ok"),
    /** The model chain tried so far, including this attempt, in order. */
    attemptedModels: text("attempted_models")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "set null" }),
    companyId: uuid("company_id").references(() => companies.id, { onDelete: "set null" }),
    /** Run tag such as `eval:gpt-oss-120b`, `backfill`, `sample`; null for routine calls. */
    runLabel: text("run_label"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ai_usage_created_idx").on(t.createdAt),
    index("ai_usage_user_task_created_idx").on(t.userId, t.task, t.createdAt),
    index("ai_usage_task_created_idx").on(t.task, t.createdAt),
    /** Recent failures per job: enrichment backs off after repeated `invalid` outcomes. */
    index("ai_usage_job_created_idx")
      .on(t.jobId, t.createdAt)
      .where(sql`${t.jobId} is not null`),
  ],
);

export type AiCapAlertChannel = "telegram" | "email" | "none";

/**
 * One row per UTC day on which the daily cap was hit, so the alert goes out once per day.
 * `claimCapAlert` re-claims an undelivered row after 15 minutes; `markCapAlertDelivered` closes it.
 */
export const aiCapAlerts = pgTable("ai_cap_alerts", {
  day: date("day").primaryKey(),
  spentUsd: numeric("spent_usd", { precision: 12, scale: 6, mode: "number" }).notNull(),
  capUsd: numeric("cap_usd", { precision: 12, scale: 6, mode: "number" }).notNull(),
  /** Planned channel: `telegram` | `email` | `none` (no channel configured). */
  channel: text("channel").$type<AiCapAlertChannel>().notNull(),
  /** Time of the latest claim. */
  sentAt: timestamp("sent_at", { withTimezone: true }).notNull().defaultNow(),
  /** Channel the alert actually went out on; null until delivered. */
  deliveredVia: text("delivered_via").$type<AiCapAlertChannel>(),
  /** Claims made for the day, the first included. */
  attempts: integer("attempts").notNull().default(1),
});

/**
 * The user's own OpenRouter key, encrypted at rest (PLAN D17, phase 09).
 *
 * Here rather than on `profiles` because the row is a secret with its own lifecycle: it is written
 * by one OAuth callback, read only by the server that makes a model call, and deleted the moment
 * the user disconnects. A column on `profiles` would be loaded by every profile read in the
 * product — onboarding, settings, the export — and a secret that rides along on unrelated reads is
 * a secret that eventually gets logged.
 *
 * **There is no plaintext column and there must never be one.** `encrypted_key` holds base64 of
 * `version(1) || iv(12) || authTag(16) || ciphertext`, produced by `encryptUserKey` in `@pemby/ai`
 * (AES-256-GCM, a fresh 12-byte IV per encryption). The leading version byte is there now because
 * adding it later is a migration; the auth tag means a tampered blob fails to decrypt rather than
 * decrypting to something.
 *
 * `key_hash` is the lower-case hex SHA-256 of the key. It is **not** a credential and **not** a
 * lookup key — it exists solely to build the two deep links that let the user manage their own key
 * on OpenRouter (`/keys/<hash>`, `/logs?api_key_hash=<hash>`), which resolve only for the signed-in
 * owner. Pemby cannot revoke a user's key; "disconnect" means deleting this row and sending them
 * there. Nothing looks a row up by hash, so it carries no unique index: two different accounts
 * connecting the same key is a fact about them, not a collision for us to police.
 *
 * `user_id` is unique — one connected account per user — and `ON DELETE cascade`. Cascade is the
 * only correct option of the three: `restrict` would break `deleteUserAndCvRows` (which knows
 * about `cv_files` and nothing else), and `set null` would leave an encrypted secret behind with
 * nobody to attribute it to and no way to ever delete it.
 *
 * No `match_id`, so `retireStaleMatches` needs no new clause in its "safe to delete" predicate.
 */
export const userAiKeys = pgTable("user_ai_keys", {
  id: id(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => user.id, { onDelete: "cascade" }),
  /** base64 of `version(1) || iv(12) || authTag(16) || ciphertext`. Never a plaintext key. */
  encryptedKey: text("encrypted_key").notNull(),
  /** Lower-case hex SHA-256 of the key, for the user's own OpenRouter deep links. */
  keyHash: text("key_hash").notNull(),
  /** The label OpenRouter shows on the key, when it gave us one. Display only. */
  label: text("label"),
  /** When a model call last used this key. Null until the first one. */
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  ...timestamps(),
});
