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
//
// ---------------------------------------------------------------------------------------------
// Phase 09: three questions, three entry points, because one shape was a defect factory.
//
// Phase 08's worst defect lived in this file's *type*, not in its code and not in any caller:
// `testPassHolders` was optional, one caller omitted it, `(input.testPassHolders ?? [])` was
// vacuously false for everybody, every user resolved to the free plan, and instant delivery
// silently did not exist. Nothing was wrong except that the type permitted an incomplete question.
//
// The fix is not only "make it required". A required field a caller cannot honestly answer is a
// field that gets faked with `[]` or `false`, which is the same defect wearing a compiler's
// approval. So the module asks three separable questions instead, and each caller asks the one it
// can actually answer:
//
//   allowedTiersFor          - "which tiers may this person see?"   (the logged-out teaser)
//   deliveryEntitlementsFor  - "+ when does their match go out?"    (the matcher, the dispatcher)
//   entitlementsFor          - "+ how many kits may they make?"     (the kit path, phase 09)
//
// Only the last one needs to know whether a user has connected their own OpenRouter key, and only
// the kit path can answer that, because only it reads the user-key table. The matcher and the
// dispatcher never have to invent a value for something they do not read.

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

/**
 * Everything except the kit quota: what the matcher and the dispatcher read.
 *
 * It is a real subset, not a convenience alias. `kitQuota` is absent because a caller that cannot
 * answer `ownKeyConnected` must not be handed a number that looks authoritative and is not.
 */
export type DeliveryEntitlements = Omit<Entitlements, "kitQuota">;

/** The `passes` row the caller read, reduced to what this module looks at. */
export interface ActivePass {
  source: PassSource;
  startsAt: Date;
  endsAt: Date;
  pausedAt: Date | null;
  revokedAt: Date | null;
}

/** What it takes to answer everything except the kit quota. */
export interface DeliveryEntitlementsInput {
  userId: string;
  /** The user's most recent pass row, or null. Read by the caller, never by this package. */
  pass: ActivePass | null;
  /** `profiles.include_yellow`. */
  includeYellow: boolean;
  /** Explicit clock. This package never calls `Date.now()`. */
  now: Date;
  /**
   * Until phase 10, only these user ids are treated as pass holders.
   *
   * **Required since phase 09.** It was optional, and its absence at one call site was what made
   * instant delivery not exist. Omitting it is now a compile error; passing `[]` to silence the
   * compiler is the same defect by hand, so a caller that genuinely has no allowlist should be
   * asking `allowedTiersFor` instead.
   */
  testPassHolders: readonly string[];
}

export interface EntitlementsInput extends DeliveryEntitlementsInput {
  /**
   * The user has their own OpenRouter key connected (phase 09). Their own credits pay for their
   * kits, so `kitQuota` is `"unlimited"`.
   *
   * It changes **`kitQuota` and nothing else**. A free user with their own key is still a free
   * user: `plan` stays `"free"` and `deliveryMode` stays `"delayed-24h"`, because connecting a key
   * pays for model calls, not for the product. Spending someone else's credits is not a purchase,
   * and the 24h delay is what a pass sells.
   */
  ownKeyConnected: boolean;
}

/** Started, not ended, not paused, not revoked. Ready for phase 10; not believed before it. */
export function isPassActive(pass: ActivePass | null, now: Date): boolean {
  if (!pass) return false;
  if (pass.revokedAt !== null || pass.pausedAt !== null) return false;
  const at = now.getTime();
  return pass.startsAt.getTime() <= at && pass.endsAt.getTime() > at;
}

/**
 * Which eligibility tiers this person may be shown, from the yellow opt-in alone (PLAN D13 amended
 * 2026-09-17). No plan, no pass, no user id: since the amendment the answer does not depend on any
 * of them, and a surface that only needs tiers should not have to produce them.
 *
 * The logged-out teaser (`apps/web/lib/teaser/sql-source.ts`) is exactly that surface. It used to
 * call `entitlementsFor` with `userId: ""` and no allowlist and read one field off the result.
 */
export function allowedTiersFor(input: { includeYellow: boolean }): readonly EligibilityTier[] {
  return input.includeYellow ? ["green", "yellow"] : ["green"];
}

/**
 * Plan, delivery mode, yellow opt-in and tiers — everything a delivered match depends on.
 *
 * Until phase 10 there is no real pass logic: everyone is on the free plan except the caller's
 * allowlist of test pass holders. The `pass` row is accepted and `isPassActive` is exported and
 * ready, but the row is deliberately not believed yet, so a stray row cannot hand out entitlements
 * before the payment flow exists. Phase 10 replaces one line here.
 */
export function deliveryEntitlementsFor(input: DeliveryEntitlementsInput): DeliveryEntitlements {
  const isPassHolder = input.testPassHolders.includes(input.userId);

  return {
    plan: isPassHolder ? "pass" : "free",
    deliveryMode: isPassHolder ? "instant" : "delayed-24h",
    yellowOptInAllowed: true,
    allowedTiers: allowedTiersFor(input),
  };
}

/**
 * What this user is entitled to right now, kit quota included.
 *
 * The kit quota is decided here and nowhere else (phase 09 contract): no caller re-derives 3, and
 * no caller reads `passes` to decide. It is counted from `kits` rows per user per calendar month —
 * never from `ai_usage`, whose rows are per model *attempt*, so a repair retry or a fallback would
 * consume quota a user never spent. See `kitQuotaVerdict` in `../kits`.
 */
export function entitlementsFor(input: EntitlementsInput): Entitlements {
  const delivery = deliveryEntitlementsFor(input);
  const unlimited = delivery.plan === "pass" || input.ownKeyConnected;

  return {
    ...delivery,
    kitQuota: unlimited ? "unlimited" : FREE_KIT_QUOTA_PER_MONTH,
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
