// Hard gates (PLAN D6). Types only; gate evaluation lands in the matching phase.

export const HARD_GATES = [
  "eligibility",
  "way-of-working",
  "verified-live",
  "seniority",
  "dealbreakers",
  "salary-floor",
] as const;
export type HardGate = (typeof HARD_GATES)[number];

export interface GateResult {
  gate: HardGate;
  passed: boolean;
  /** Templated reason key, rendered through i18n. */
  reason: string;
}

export type GateResults = Readonly<Record<HardGate, GateResult>>;
