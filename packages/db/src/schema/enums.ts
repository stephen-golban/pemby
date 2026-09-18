import {
  AI_TASKS,
  DB_NEAR_MISS_BLOCKERS,
  DB_SENIORITIES,
  DB_WAYS_OF_WORKING,
  ENGLISH_LEVELS,
  KEY_CLASSES,
} from "@pemby/core";
import { pgEnum } from "drizzle-orm/pg-core";

// Country codes are stored as upper-case ISO 3166-1 alpha-2 text ("MD", "GE"). Eligibility
// scopes may also hold a region code ("EU", "EEA", "LATAM") or "*" for worldwide.

/** PLAN D2. Red is stored so the matcher can explain exclusions, but never shown. */
export const eligibilityTier = pgEnum("eligibility_tier", ["green", "yellow", "white", "red"]);

/** PLAN D3. Core spells these with hyphens; convert only with `toDbWay` / `fromDbWay`. */
export const wayOfWorking = pgEnum("way_of_working", DB_WAYS_OF_WORKING);

/** PLAN D5 step 2. */
export const employmentType = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contract_to_hire",
]);

/** PLAN D10: intern to principal. No `staff`: convert with `toDbSeniority` from `@pemby/core`. */
export const seniority = pgEnum("seniority", DB_SENIORITIES);

/** CEFR levels plus native. */
export const englishLevel = pgEnum("english_level", ENGLISH_LEVELS);

export const payPeriod = pgEnum("pay_period", ["hour", "day", "month", "year"]);

export const atsType = pgEnum("ats_type", [
  "greenhouse",
  "lever",
  "ashby",
  "workable",
  "smartrecruiters",
  "recruitee",
  "personio",
  "other",
]);

/** Board state recorded by ingestion (company_source_health). */
export const boardStatus = pgEnum("board_status", ["active", "empty", "not-found", "erroring"]);

export const jobStatus = pgEnum("job_status", ["open", "closed", "quarantined", "merged"]);

/**
 * CV lifecycle (phase 06). `pending` is legacy (pre-phase-06 rows); new rows start at `uploaded`
 * (file) or `parsing` (pasted text). The new values were added in migration 0006 alone.
 */
export const cvParseStatus = pgEnum("cv_parse_status", [
  "pending",
  "parsed",
  "failed",
  "uploaded",
  "extracting",
  "unreadable",
  "parsing",
  "queued",
]);

/** Which key paid for or processed an AI call (PLAN D17). Same values as `@pemby/ai` KeyClass. */
export const keyClass = pgEnum("key_class", KEY_CLASSES);

/** Routed AI tasks: exactly `@pemby/ai` AI_TASKS (both come from `@pemby/core`). */
export const aiTask = pgEnum("ai_task", AI_TASKS);

export const evidenceSubject = pgEnum("evidence_subject", ["job", "company"]);

export const evidenceSource = pgEnum("evidence_source", [
  "post",
  "careers_page",
  "eor",
  "user_report",
  "flag",
]);

/** A row in `matches` is either a delivered match or a near miss (PLAN section 4 rule 6). */
export const matchKind = pgEnum("match_kind", ["match", "near_miss"]);

/** PLAN D6 actions. */
export const matchState = pgEnum("match_state", ["new", "saved", "applied", "passed"]);

/** One-tap "Not for me" reasons (PLAN D6). No free text. */
export const matchPassReason = pgEnum("match_pass_reason", [
  "location",
  "salary",
  "seniority",
  "stack",
  "company",
  "role",
  "already_applied",
  "other",
]);

/**
 * Hard gates (PLAN D6); a near miss records the one gate it failed, or `score`. Wired to
 * `DB_NEAR_MISS_BLOCKERS` (core's `DB_HARD_GATES` plus `score`, in that order) so the enum and
 * core cannot drift, exactly as `wayOfWorking` is wired to `DB_WAYS_OF_WORKING`.
 */
export const matchGate = pgEnum("match_gate", DB_NEAR_MISS_BLOCKERS);

export const applicationState = pgEnum("application_state", [
  "applied",
  "screening",
  "interviewing",
  "offer",
  "rejected",
  "withdrawn",
  "no_response",
]);

/** PLAN D26 and section 6. */
export const flagReason = pgEnum("flag_reason", [
  "closed_or_fake",
  "not_hiring_from_country",
  "scam",
  "wrong_details",
  "duplicate",
  "other",
]);

export const flagStatus = pgEnum("flag_status", [
  "open",
  "auto_resolved",
  "needs_review",
  "dismissed",
]);

/** Fixed picker for "wrong details" (PLAN section 6). */
export const flagField = pgEnum("flag_field", [
  "salary",
  "seniority",
  "stack",
  "location",
  "eligibility",
]);

export const flagAction = pgEnum("flag_action", [
  "none",
  "job_closed",
  "reverification_queued",
  "tier_downgraded",
  "quarantined",
  "re_enriched",
  "merged",
  "sent_to_review",
]);

/** PLAN D12, D14, D27. */
export const passSource = pgEnum("pass_source", ["purchase", "referral", "guarantee", "share"]);

/** PLAN D15. */
export const paymentProvider = pgEnum("payment_provider", ["dodo", "paddle"]);

export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "paid",
  "failed",
  "refunded",
  "partially_refunded",
]);

/** PLAN D12 price points. */
export const passProduct = pgEnum("pass_product", ["pass_1m", "pass_3m", "pass_6m"]);

export const referralStatus = pgEnum("referral_status", ["pending", "qualified", "purchased"]);

/** PLAN D8. */
export const channelType = pgEnum("channel_type", ["telegram", "email", "push"]);

export const deliveryKind = pgEnum("delivery_kind", ["match", "pass_reminder", "system"]);

export const deliveryStatus = pgEnum("delivery_status", ["sent", "failed", "skipped"]);
