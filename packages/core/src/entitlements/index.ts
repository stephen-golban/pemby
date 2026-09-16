// Entitlements (PLAN D13, section 5). Phase 07 fills this folder; it will be the only place
// that decides instant vs delayed delivery, kit quota and yellow opt-in. Types only for now.

export const PASS_SOURCES = ["purchase", "referral", "guarantee", "share"] as const;
export type PassSource = (typeof PASS_SOURCES)[number];

export type DeliveryMode = "instant" | "delayed-24h";

export interface Entitlements {
  plan: "free" | "pass";
  deliveryMode: DeliveryMode;
  /** Kits per calendar month; "unlimited" for pass holders or users on their own key. */
  kitQuota: number | "unlimited";
  yellowOptInAllowed: boolean;
}
