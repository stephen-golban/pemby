// The shapes `/api/brief` answers with, shared by the route handlers and the browser.
//
// Everything here is JSON-safe: dates are ISO strings, enums are their database spelling, and
// every sentence a person reads is a key the client renders through i18n (docs/conventions.md).
// That now includes the match reasons and the gap: since migration 0009 the matcher stores
// `matches.reason_keys` / `reason_params` / `gap_key` / `gap_params` alongside the English it used
// to store alone, and `messages/en/brief.json` holds the `scoreReasons.*` table they render
// through. The English columns survive as the fallback for rows written before that migration.

import type { EligibilityTier, EngineReasonKey, ScoreReasonKey, Seniority } from "@pemby/core";
// The programs calendar is its own export subpath: it does a static JSON import, so the root
// barrel deliberately leaves it out (`packages/core/package.json`).
import type { ProgramNextStep } from "@pemby/core/programs";

/** `match_state` pg enum values. */
export const MATCH_STATES = ["new", "saved", "applied", "passed"] as const;
export type MatchState = (typeof MATCH_STATES)[number];

/** `match_pass_reason` pg enum values (PLAN D6). The whole "Not for me" picker, no free text. */
export const PASS_REASONS = [
  "location",
  "salary",
  "seniority",
  "stack",
  "company",
  "role",
  "already_applied",
  "other",
] as const;
export type PassReason = (typeof PASS_REASONS)[number];

/** `flag_reason` pg enum values (PLAN D26). */
export const FLAG_REASONS = [
  "closed_or_fake",
  "not_hiring_from_country",
  "scam",
  "wrong_details",
  "duplicate",
  "other",
] as const;
export type FlagReason = (typeof FLAG_REASONS)[number];

/** `flag_field` pg enum values: the fixed picker behind "wrong details" (PLAN section 6). */
export const FLAG_FIELDS = ["salary", "seniority", "stack", "location", "eligibility"] as const;
export type FlagField = (typeof FLAG_FIELDS)[number];

/**
 * The fixed value lists for the two fields whose vocabulary is closed. `seniority` uses the
 * `seniority` pg enum, `eligibility` uses `eligibility_tier`, and `stack` and `location` are
 * checked against the post's own listed values, which is the only fixed list they can have.
 * Nothing in this picker accepts typed text (PLAN section 6).
 */
export const FLAG_SALARY_VALUES = [
  "not_listed",
  "lower",
  "higher",
  "wrong_currency",
  "wrong_period",
] as const;
export type FlagSalaryValue = (typeof FLAG_SALARY_VALUES)[number];

export const FLAG_SENIORITY_VALUES = [
  "intern",
  "junior",
  "middle",
  "senior",
  "lead",
  "principal",
] as const;

export const FLAG_ELIGIBILITY_VALUES = ["green", "yellow", "white", "red"] as const;

/** `match_gate` pg enum values: the seven hard gates plus `score` (PLAN D7). */
export const NEAR_MISS_BLOCKERS = [
  "eligibility",
  "way_of_working",
  "freshness",
  "seniority",
  "dealbreaker",
  "salary",
  "salary_missing",
  "score",
] as const;
export type NearMissBlocker = (typeof NEAR_MISS_BLOCKERS)[number];

/** `way_of_working` pg enum values. */
export type DbWayOfWorking =
  "b2b_contractor" | "eor_employee" | "relocation_visa" | "freelance" | "local" | "paid_program";

/**
 * The eligibility verdict's own words — the well-written line, and the one a match leads with.
 *
 * `key` plus `params` render through i18n. `text` is what the engine already rendered into
 * `job_eligibility.reason`; rows written before migration 0008 have no key, and until the backfill
 * runs that is most of them, so a reader never sees an empty reason.
 */
export interface EligibilityReasonView {
  key: EngineReasonKey | null;
  params: Record<string, string>;
  text: string | null;
}

/**
 * One templated reason from the score, or the gap.
 *
 * `key` plus `params` render through `scoreReasons.*`. `text` is the English the matcher rendered
 * into `matches.reasons` / `matches.gap`; rows written before migration 0009 have only that, and a
 * key this build does not recognise falls back to it too, so a reader never meets an empty bullet.
 */
export interface ScoreReasonView {
  key: ScoreReasonKey | null;
  params: Record<string, string>;
  text: string | null;
}

export interface BriefMatchView {
  matchId: string;
  jobId: string;
  title: string;
  company: string;
  /** The post's own URL; `applyUrl` when the board gives a separate one. */
  url: string;
  /** First listed location, plus how many more the post lists. */
  location: string | null;
  otherLocations: number;
  tier: EligibilityTier;
  wayOfWorking: DbWayOfWorking | null;
  /** ISO. Null when the post has never been confirmed live on the company's own board. */
  lastVerifiedLiveAt: string | null;
  eligibility: EligibilityReasonView;
  /** Top 3, as the matcher templated them (PLAN D6). */
  reasons: ScoreReasonView[];
  gap: ScoreReasonView | null;
  score: number;
  state: MatchState;
  passReason: PassReason | null;
  /** This user has already flagged this post. */
  flagged: boolean;
  /** The post's own stack and locations: the fixed value lists of the "wrong details" picker. */
  stack: string[];
  locations: string[];
  demo: boolean;
}

/**
 * The matches Pemby has found for this user and is not due to deliver yet (PLAN D13: on a free
 * account every match arrives 24h after the post was first seen, on every channel, and the Brief
 * is a channel).
 *
 * A count and one instant, and deliberately nothing else. The role, the company and the link are
 * exactly what is being held back, so naming any of them here would deliver the match through the
 * web while the product claimed it had not.
 */
export interface HeldView {
  count: number;
  /** ISO, the earliest `deliver_after` still ahead. Null only when `count` is 0. */
  nextAt: string | null;
}

export interface NearMissExample {
  jobId: string;
  title: string;
  company: string;
  /** A seeded demonstration post. It carries the EXAMPLE stamp wherever it is shown (DESIGN.md). */
  demo: boolean;
}

/**
 * The lowest score bar a person may set for themselves (owner decision 2026-09-19, amending
 * PLAN D6), and the value the one-tap `score` fix writes.
 *
 * It is the near-miss band's own floor. Below it there is no `score` near miss left to open, so a
 * lower bar would be a promise the matcher never wrote a row for. The number is already in the
 * repo — `packages/db/drizzle/0014_user_ai_keys_flag_claim_score_floor.sql` and the `score_floor`
 * column comment both state it — and it is deliberately **not** the configured match threshold,
 * which is private config and never appears in this app.
 *
 * If a private config ever set `nearMissMin` above 65, this constant would not become wrong; the
 * fix would simply open fewer rows, and `atFloorCount` below would already say so, because it is
 * counted from the rows' real scores rather than assumed from the band.
 */
export const MIN_SCORE_FLOOR = 65;

export interface NearMissGroupView {
  blocker: NearMissBlocker | null;
  count: number;
  /**
   * How many of the group are yellow — the only ones the "include them?" fix would let through.
   *
   * The read already filters every group to green and yellow, since white and red never show
   * (PLAN D2 as amended 2026-09-17), so this is no longer the count of what the fix would reveal
   * out of a wider set. It stays the number the fix is offered against because it is still the
   * only honest one: a green post in an `eligibility` group was blocked by something the yellow
   * setting does not touch, and counting it would promise posts the tap cannot deliver.
   */
  yellowCount: number;
  /**
   * How many of the group would reach the Brief if the reader dropped their score bar to
   * `MIN_SCORE_FLOOR` — the only ones the `score` fix can deliver.
   *
   * The same honest-count discipline as `yellowCount`, and for the same reason: the pill must
   * promise the number the tap delivers, not the size of the group it sits on. It is counted in
   * SQL from each row's own `matches.score`, so a band that starts lower than 65 yields a count
   * smaller than `count` rather than an over-promise.
   *
   * Zero on every group but `score`, where no such tap exists.
   */
  atFloorCount: number;
  examples: NearMissExample[];
}

export interface BriefView {
  /**
   * ISO, the instant the server read this Brief. Every "seen live 3h ago" on the page is measured
   * from it, so the first paint and the hydrated markup say the same thing.
   */
  readAt: string;
  /** ISO 3166-1 alpha-2, for the country name in every reason. */
  country: string | null;
  seniority: Seniority | null;
  /** PLAN D13 amended 2026-09-17: every user may turn this on, not only pass holders. */
  includeYellow: boolean;
  hideNoSalary: boolean;
  /**
   * `profiles.score_floor`: this reader's own score bar, or null for the configured one.
   *
   * Null is not a number the client may substitute for. The configured threshold is private config
   * and this app never learns it; null simply means "Pemby's bar", which is what the rail says.
   */
  scoreFloor: number | null;
  /** Live, canonical, in-window, due matches only. Everything else is not a match today. */
  matches: BriefMatchView[];
  held: HeldView;
  nearMisses: NearMissGroupView[];
  nearMissTotal: number;
  /** A junior's real next step when the Brief is silent (PLAN D7, D11). Empty above junior. */
  programs: ProgramNextStep[];
}

export interface MatchStatePatch {
  matchId: string;
  state: MatchState;
  /** Required when `state` is `passed`, refused otherwise. */
  passReason?: PassReason;
}

export interface FlagBody {
  jobId: string;
  reason: FlagReason;
  /** Required when `reason` is `wrong_details`, refused otherwise. */
  field?: FlagField;
  fieldValue?: string;
}

export interface PreferencesPatch {
  includeYellow?: boolean;
  hideNoSalary?: boolean;
  /**
   * The reader's own score bar. `null` hands the decision back to the configured threshold;
   * a number is refused below `MIN_SCORE_FLOOR` or above 100 by the route.
   *
   * `undefined` (absent) means "leave it alone", and `null` means "clear it" — two different
   * instructions, which is why `patchPreferences` cannot fold this into the `coalesce` the two
   * booleans use.
   */
  scoreFloor?: number | null;
}
