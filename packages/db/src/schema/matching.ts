import type { GateResult, ScoreComponent, ScoreComponentResult } from "@pemby/core";
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

/**
 * `gate_results` and `score_components` hold exactly what the gate and scoring code in
 * `@pemby/core` produces; the shapes are re-exported here so a reader of the schema can see what
 * the jsonb columns contain without leaving the file.
 */
export type { GateResult, ScoreComponentResult };

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
    /**
     * `MatchScore.components`: per component the normalized value (null when there was no signal
     * to score), the weight it carried and the points it contributed, so a score can be explained
     * and re-weighted without re-running the matcher. Null for rows written before migration 0008.
     *
     * A component with a null value also carries `absence`, which says whether there was nothing to
     * know (`not-applicable`: the post stated no band, listed no stack, named no domains) or
     * whether Pemby could have known and did not (`missing`). Only the second kind lowers the
     * score's evidence ceiling, and this column is where a reader of one row can tell them apart.
     * Rows written before scorer version 2 have no `absence` on any component.
     *
     * The weights of the components that scored sum to 1 — a component that scored nothing carries
     * weight 0, its share having been spread over the rest — so `points` here is the fit before the
     * evidence ceiling, not the stored `score` (see `scoring/score.ts`).
     */
    scoreComponents:
      jsonb("score_components").$type<Record<ScoreComponent, ScoreComponentResult>>(),
    tier: eligibilityTier("tier").notNull(),
    wayOfWorking: wayOfWorking("way_of_working"),
    /**
     * Top 3 templated reasons, already rendered into English.
     *
     * Kept as the fallback for rows written before migration 0009, which have nothing else. Every
     * row written since carries `reasonKeys` / `reasonParams` as well, and that is what the UI
     * renders through i18n; this column is what it falls back to.
     */
    reasons: text("reasons")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /**
     * `MatchScore.reasons` as keys — `ScoreReason.key`, one per entry of `reasons`, in the same
     * order — so a reason can be rendered in any language instead of stored as English prose.
     */
    reasonKeys: text("reason_keys")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    /** `ScoreReason.params`, positionally aligned with `reasonKeys`. */
    reasonParams: jsonb("reason_params").$type<Record<string, string>[]>().notNull().default([]),
    /** The one templated gap, rendered into English. Fallback, exactly as `reasons` is. */
    gap: text("gap"),
    /** `MatchScore.gap` as a key. Null when there is no gap, and on rows written before 0009. */
    gapKey: text("gap_key"),
    gapParams: jsonb("gap_params").$type<Record<string, string>>().notNull().default({}),
    /**
     * `SCORER_VERSION` of the scorer that produced this verdict, or 0 for a row written before the
     * marker existed. It is what tells a current verdict from one an older scorer left behind.
     *
     * `retireStaleMatches` reads it in both of its two modes, and this column is the only condition
     * in one of them. In *version mode* a row below the current version is stale by that fact alone,
     * which is what clears out a scorer bump. In *named-pairs mode* the caller passes the pairs a run
     * actually judged and wrote no row for, and the version is a ceiling instead: a row a newer
     * scorer wrote is never retired on an older scorer's say-so. Named-pairs mode is the one that
     * reaches a row already **at** the current version whose pair a run has just judged out of
     * existence — the one-tap near-miss fix (PLAN D7), where a widened profile turns 36 near misses
     * into 1 and the other 35 rows have to go. Between them, a score no live scorer would produce
     * cannot sit in a Brief for ever.
     *
     * The matcher owns this column, as it owns `score` and `kind`. Nothing the user did is recorded
     * here.
     */
    scorerVersion: smallint("scorer_version").notNull().default(0),
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
