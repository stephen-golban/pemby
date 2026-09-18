// Entitlements (PLAN D13, section 5). This is the only place that decides instant vs delayed
// delivery, kit quota and the yellow opt-in. Phases 08, 09 and 10 call this module and nothing
// else. Pure and isomorphic: the caller reads the `passes` row and passes it in; this package
// never touches a database.
//
// PLAN D13 amended 2026-09-17: the yellow opt-in is no longer a pass-only feature. On real staging
// data the whole target market had 21 green (job, country) pairs and Moldova had exactly one, so
// green-only was gating an empty product rather than a premium one. `yellowOptInAllowed` is now
// true on both plans and `allowedTiers` follows the profile's `include_yellow` alone. That is the
// decision, not a bug. A pass now differentiates on exactly three things: instant delivery,
// unlimited kits, and the Chrome extension when it ships (PLAN D9, phase 2).

import type { EligibilityTier } from "../eligibility";

export const PASS_SOURCES = ["purchase", "referral", "guarantee", "share"] as const;
export type PassSource = (typeof PASS_SOURCES)[number];

export type DeliveryMode = "instant" | "delayed-24h";

/** PLAN D13: free users get 3 application kits a calendar month. */
export const FREE_KIT_QUOTA_PER_MONTH = 3;

/** PLAN D13, section 4.4: free users' matches go out 24h after the job was first seen. */
export const FREE_DELIVERY_DELAY_HOURS = 24;

export interface Entitlements {
  plan: "free" | "pass";
  deliveryMode: DeliveryMode;
  /** Kits per calendar month; "unlimited" for pass holders or users on their own key. */
  kitQuota: number | "unlimited";
  /** True on both plans since the D13 amendment; `include_yellow` decides per user. */
  yellowOptInAllowed: boolean;
  /** Tiers the eligibility gate may accept. Never holds `white` or `red` (PLAN D2 amended 2026-09-17). */
  allowedTiers: readonly EligibilityTier[];
}

/** The `passes` row the caller read, reduced to what this module looks at. */
export interface ActivePass {
  source: PassSource;
  startsAt: Date;
  endsAt: Date;
  pausedAt: Date | null;
  revokedAt: Date | null;
}

export interface EntitlementsInput {
  userId: string;
  /** The user's most recent pass row, or null. Read by the caller, never by this package. */
  pass: ActivePass | null;
  /** `profiles.include_yellow`. */
  includeYellow: boolean;
  /** Explicit clock. This package never calls `Date.now()`. */
  now: Date;
  /** Until phase 10, only these user ids are treated as pass holders. */
  testPassHolders?: readonly string[];
}

/** Started, not ended, not paused, not revoked. Ready for phase 10; not believed before it. */
export function isPassActive(pass: ActivePass | null, now: Date): boolean {
  if (!pass) return false;
  if (pass.revokedAt !== null || pass.pausedAt !== null) return false;
  const at = now.getTime();
  return pass.startsAt.getTime() <= at && pass.endsAt.getTime() > at;
}

/**
 * What this user is entitled to right now.
 *
 * Until phase 10 there is no real pass logic: everyone is on the free plan except the caller's
 * allowlist of test pass holders. The `pass` row is accepted and `isPassActive` is exported and
 * ready, but the row is deliberately not believed yet, so a stray row cannot hand out entitlements
 * before the payment flow exists. Phase 10 replaces one line here.
 */
export function entitlementsFor(input: EntitlementsInput): Entitlements {
  const isPassHolder = (input.testPassHolders ?? []).includes(input.userId);
  const allowedTiers: readonly EligibilityTier[] = input.includeYellow
    ? ["green", "yellow"]
    : ["green"];

  return {
    plan: isPassHolder ? "pass" : "free",
    deliveryMode: isPassHolder ? "instant" : "delayed-24h",
    kitQuota: isPassHolder ? "unlimited" : FREE_KIT_QUOTA_PER_MONTH,
    yellowOptInAllowed: true,
    allowedTiers,
  };
}

/**
 * The `matches.deliver_after` timestamp for one match: now for a pass holder, and 24h after the
 * job was **first seen** for a free user (PLAN section 4.4) — not 24h after the match was made, so
 * a job matched days later is not delayed twice. That can be in the past, which is correct: the
 * dispatcher sends anything whose `deliver_after` has passed.
 */
export function deliverAfter(
  entitlements: Pick<Entitlements, "deliveryMode">,
  jobFirstSeenAt: Date,
  now: Date,
): Date {
  if (entitlements.deliveryMode === "instant") return new Date(now.getTime());
  return new Date(jobFirstSeenAt.getTime() + FREE_DELIVERY_DELAY_HOURS * 60 * 60 * 1000);
}
