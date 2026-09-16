// Eligibility tiers (PLAN D2). Types only; the engine lands in a later phase.

export const ELIGIBILITY_TIERS = ["green", "yellow", "white", "red"] as const;
/** green: hires from your country; yellow: likely; white: unclear; red: excluded (never shown). */
export type EligibilityTier = (typeof ELIGIBILITY_TIERS)[number];

/** Where a piece of evidence came from (PLAN section 3, eligibility_evidence.source). */
export const EVIDENCE_SOURCES = ["post", "careers-page", "eor", "user-report", "flag"] as const;
export type EvidenceSource = (typeof EVIDENCE_SOURCES)[number];

/** ISO 3166-1 alpha-2 country code, upper case. */
export type CountryCode = string;

export interface EligibilityEvidence {
  subject: { kind: "job" | "company"; id: string };
  country: CountryCode;
  tier: EligibilityTier;
  source: EvidenceSource;
  weight: number;
}

/** Every label shows its reason. */
export interface EligibilityVerdict {
  country: CountryCode;
  tier: EligibilityTier;
  reason: string;
  evidence: readonly EligibilityEvidence[];
}
