// The free kit quota, answered in one place (phase 09 contract).
//
// The quota itself comes from `../entitlements` and from nowhere else: no caller re-derives 3, and
// no caller reads `passes` to decide. This module only compares that allowance against what the
// user has already spent this calendar month.
//
// **`usedThisMonth` is a count of `kits` rows, never of `ai_usage` rows.** An `ai_usage` row is one
// model *attempt*: a repair retry, a fallback model and a streamed call that failed and was retried
// each write their own row. Counting attempts would charge a user quota for our own retries, and
// the first person to notice would be someone who paid for a pass because a bug told them they were
// out of kits.

import type { Entitlements } from "../entitlements";

export type KitQuotaVerdict =
  | { allowed: true }
  | {
      allowed: false;
      reason: "quota";
      /** The two ways out, and the only two: buy a pass, or connect your own OpenRouter key. */
      choice: "pass-or-connect";
    };

export interface KitQuotaInput {
  /** From `entitlementsFor`. `Pick` so a caller may pass the whole `Entitlements`. */
  entitlements: Pick<Entitlements, "kitQuota">;
  /** `kits` rows for this user in the current calendar month, this one not yet written. */
  usedThisMonth: number;
}

const BLOCKED: KitQuotaVerdict = { allowed: false, reason: "quota", choice: "pass-or-connect" };

/**
 * May this user generate one more kit right now?
 *
 * Fails closed on a count that is not a finite non-negative number. A `NaN` or a negative reaching
 * here means the count failed rather than that the user has quota left, and the money path is the
 * wrong place to be optimistic: a wrongly blocked kit is a support message, a wrongly allowed one
 * is an unbounded spend on Pemby's own key.
 */
export function kitQuotaVerdict(input: KitQuotaInput): KitQuotaVerdict {
  if (input.entitlements.kitQuota === "unlimited") return { allowed: true };
  const used = input.usedThisMonth;
  if (!Number.isFinite(used) || used < 0) return BLOCKED;
  return used < input.entitlements.kitQuota ? { allowed: true } : BLOCKED;
}
