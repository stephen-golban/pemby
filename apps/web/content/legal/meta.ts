/**
 * Effective date shown at the top of /terms, /privacy and /refunds. One value for all three pages;
 * the lead updates it when a changed version is promoted to production.
 */
export const EFFECTIVE_DATE = "16 September 2026";

export const LEGAL_DOCUMENTS = ["terms", "privacy", "refunds"] as const;
export type LegalDocument = (typeof LEGAL_DOCUMENTS)[number];
