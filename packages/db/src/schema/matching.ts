import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, timestamps } from "./_shared";
import { user } from "./auth";
import {
  applicationState,
  eligibilityTier,
  keyClass,
  matchGate,
  matchKind,
  matchPassReason,
  matchState,
  wayOfWorking,
} from "./enums";
import { jobs } from "./jobs";

export type GateResult = { gate: string; passed: boolean; detail?: string };

/**
 * One row per (user, job) the matcher evaluated as a match or a near miss (PLAN D6, D7, section
 * 4). Jobs that fail more than one gate are not stored.
 */
export const matches = pgTable(
  "matches",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    kind: matchKind("kind").notNull(),
    /** For near misses: the one gate that failed, or `score` for 65–79. */
    blocker: matchGate("blocker"),
    gateResults: jsonb("gate_results").$type<GateResult[]>().notNull().default([]),
    score: smallint("score").notNull(),
    tier: eligibilityTier("tier").notNull(),
    wayOfWorking: wayOfWorking("way_of_working"),
    /** Top 3 templated reasons. */
    reasons: text("reasons")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    gap: text("gap"),
    state: matchState("state").notNull().default("new"),
    passReason: matchPassReason("pass_reason"),
    stateChangedAt: timestamp("state_changed_at", { withTimezone: true }),
    /** Earliest send time: now for pass holders, first_seen_at + 24h for free users (D13). */
    deliverAfter: timestamp("deliver_after", { withTimezone: true }),
    telegramDeliveredAt: timestamp("telegram_delivered_at", { withTimezone: true }),
    emailDeliveredAt: timestamp("email_delivered_at", { withTimezone: true }),
    pushDeliveredAt: timestamp("push_delivered_at", { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    unique("matches_user_job_uq").on(t.userId, t.jobId),
    index("matches_user_kind_state_idx").on(t.userId, t.kind, t.state),
    index("matches_job_idx").on(t.jobId),
    index("matches_deliver_after_idx")
      .on(t.deliverAfter)
      .where(sql`${t.kind} = 'match'`),
  ],
);

/** The user's own application tracker. */
export const applications = pgTable(
  "applications",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Restrict: duplicate jobs are merged via `status = 'merged'`, never deleted. */
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    state: applicationState("state").notNull().default("applied"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    /** Rejected because of location: feeds eligibility evidence. */
    rejectedForLocation: boolean("rejected_for_location").notNull().default(false),
    notes: text("notes"),
    ...timestamps(),
  },
  (t) => [
    unique("applications_user_job_uq").on(t.userId, t.jobId),
    index("applications_user_state_idx").on(t.userId, t.state),
  ],
);

export type KitContent = {
  cvBullets: string[];
  coverLetter: string;
  screeningAnswers: { question: string; answer: string }[];
};

/** Application kits (PLAN D9). Free quota counts rows per user per month. */
export const kits = pgTable(
  "kits",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** Restrict: duplicate jobs are merged via `status = 'merged'`, never deleted. */
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "restrict" }),
    matchId: uuid("match_id").references(() => matches.id, { onDelete: "set null" }),
    content: jsonb("content").$type<KitContent>().notNull(),
    model: text("model").notNull(),
    /** `PromptTemplate.versionId` of the `application-kit` prompt. */
    promptVersion: text("prompt_version").notNull(),
    keyClass: keyClass("key_class").notNull(),
    costUsd: numeric("cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    createdAt: createdAt(),
  },
  (t) => [index("kits_user_created_idx").on(t.userId, t.createdAt)],
);
