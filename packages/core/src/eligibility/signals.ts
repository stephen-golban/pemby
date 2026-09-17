// The eligibility signal contract. Every extractor (rules, schema.org, ATS fields, the LLM, company
// evidence, user reports) emits `EligibilitySignal`s; the engine combines them into tiers. A signal
// states what one piece of text says, never a verdict. Isomorphic: no Node imports.

import type { WayOfWorking } from "../ways-of-working";
import type { CountryCode } from "./regions/countries";
import type { RegionCode } from "./regions/groups";

/** Who produced the signal. */
export const SIGNAL_SOURCES = [
  /** Deterministic patterns over the post text (`extractRuleSignals`). */
  "rules",
  /** schema.org JobPosting JSON-LD on the posting page. */
  "schema-org",
  /** Structured ATS fields: location list, workplace type, employment type. */
  "ats-structured",
  /** Enrichment model output. */
  "llm",
  /** Company-level evidence (careers or hiring-policy pages). */
  "company",
  /** A Pemby user's report ("applied from Moldova as a contractor: offer"). */
  "user-report",
] as const;
export type SignalSource = (typeof SIGNAL_SOURCES)[number];

/**
 * What the signal claims. Semantics the engine can rely on:
 *
 * - `allow-list`: the candidate must live in one of `scopes`. Countries outside every scope are
 *   not allowed. A region scope must be expanded with `regionContains`, which carries confidence.
 * - `exclude`: candidates living in `scopes` are not allowed. Says nothing about other places.
 * - `worldwide`: the post says any country is fine. `scopes` is empty. Sanctions and timezone
 *   limits can still apply.
 * - `work-authorization`: the candidate must already hold the right to work in `scopes`. Empty
 *   `scopes` means "in the job's location" (the post did not name it; use the anchor).
 * - `citizenship-or-clearance`: a person-level requirement (citizenship, "US person", ITAR/EAR,
 *   security clearance) that residence cannot satisfy. `requirement` says which.
 * - `timezone`: a working-hours constraint (`timezone`). Soft: it limits practicality, not law.
 * - `engagement`: how the company engages people (`engagement.mode`): B2B, contractor, EOR, a
 *   contractor platform, employee-only, visa sponsorship or its absence.
 * - `anchor`: where the job sits (`anchor.workplace` plus `scopes`), from ATS location fields or
 *   a "Location:" label. An anchor is not an eligibility statement on its own: "Remote - US" in a
 *   location field is often a legal entity country, not a residence rule.
 */
export const SIGNAL_KINDS = [
  "allow-list",
  "exclude",
  "worldwide",
  "work-authorization",
  "citizenship-or-clearance",
  "timezone",
  "engagement",
  "anchor",
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

/**
 * How directly the text says it.
 * - `explicit`: a requirement in plain words ("must be based in", "US only", "can only hire in").
 * - `implied`: a convention that usually means it ("Remote (US)", "US-based candidates", a
 *   location label, schema.org requirements that differ from the job location).
 * - `weak`: a preference, a perk-like phrase ("work from anywhere"), a qualifier that narrows it
 *   in unknown ways ("where we have a work location"), or schema.org requirements that just copy
 *   the job location (Google's fallback, research 02 §4.2).
 */
export const SIGNAL_STRENGTHS = ["explicit", "implied", "weak"] as const;
export type SignalStrength = (typeof SIGNAL_STRENGTHS)[number];

/** Which input field the evidence was read from. */
export type EvidenceField = "title" | "locations" | "description" | "employment-type" | "json-ld";

/** A verbatim span. `start`/`end` are UTF-16 offsets into that field's text when known. */
export interface SignalEvidence {
  field: EvidenceField;
  text: string;
  start?: number;
  end?: number;
}

/** Places a signal is about. Regions stay unexpanded so their confidence is not lost. */
export interface SignalScopes {
  countries: readonly CountryCode[];
  regions: readonly RegionCode[];
}

/** Hours east of UTC, as written in the post (CEST is +2, not "CET in summer"). */
export interface UtcOffsetRange {
  minOffset: number;
  maxOffset: number;
}

export interface TimezoneConstraint {
  /**
   * `within`: the candidate's own UTC offset should fall in one of `ranges`.
   * `overlap`: the candidate must work (part of) the business hours of `ranges`.
   */
  mode: "within" | "overlap";
  /** Empty when only `places` are known ("European time zones" with no offsets we trust). */
  ranges: readonly UtcOffsetRange[];
  /** Required overlap in hours; "full" for a fixed schedule in that zone; null when unstated. */
  overlapHours: number | "full" | null;
  /** Places the zone was named after ("US time zones"), when the post used places. */
  places?: SignalScopes;
}

export const ENGAGEMENT_MODES = [
  /** "B2B contract", "on a B2B basis": the person invoices from their own business. */
  "b2b",
  /** "independent contractor", "contractor role", "1099". */
  "contractor",
  /** "freelance" engagements. */
  "freelance",
  /** Employer of record: employed through a third party in the candidate's country. */
  "eor",
  /** "via Deel/Remote.com/Oyster": a platform that does contractors and EOR; mode unstated. */
  "contractor-platform",
  /** "not a contract role", "we don't work with contractors". */
  "employee-only",
  /** Visa sponsorship or relocation support is offered. */
  "visa-sponsorship",
  /** "unable to sponsor visas", "without sponsorship". */
  "no-visa-sponsorship",
  /**
   * The role requires moving to a place ("must relocate to Lisbon", "candidates in Ukraine ready to
   * relocate to Poland"). `scopes` name the target place when the post names one: the job is
   * there, not in the candidate's country. Says nothing about relocation support.
   */
  "relocation-required",
] as const;
export type EngagementMode = (typeof ENGAGEMENT_MODES)[number];

export const CITIZENSHIP_REQUIREMENTS = [
  /** A named citizenship ("must be a US citizen"). */
  "citizenship",
  /** US person: citizen, permanent resident or protected individual (export rules). */
  "us-person",
  /** ITAR/EAR or another export-control regime named in the post. */
  "export-control",
  /** Security clearance (TS/SCI, Secret, SC/DV, NV1...). */
  "clearance",
] as const;
export type CitizenshipRequirement = (typeof CITIZENSHIP_REQUIREMENTS)[number];

export type AnchorWorkplace = "remote" | "hybrid" | "onsite" | "unspecified";

export interface EligibilitySignal {
  source: SignalSource;
  kind: SignalKind;
  /** Countries and regions. Empty for `worldwide`, and for kinds whose doc says so. */
  scopes: SignalScopes;
  /**
   * Ways of working the signal applies to; empty means all of them. Rules leave it empty for
   * place statements (a post rarely says "US only for employees"); engagement signals name the
   * ways they bear on.
   */
  waysOfWorking: readonly WayOfWorking[];
  strength: SignalStrength;
  evidence: SignalEvidence;
  /** Set when `kind` is `timezone`. */
  timezone?: TimezoneConstraint;
  /** Set when `kind` is `engagement`. */
  engagement?: { mode: EngagementMode; provider?: string };
  /** Set when `kind` is `citizenship-or-clearance`. */
  requirement?: CitizenshipRequirement;
  /** Set when `kind` is `anchor`. */
  anchor?: { workplace: AnchorWorkplace };
  /**
   * Countries in `scopes.countries` that were guessed rather than named unambiguously: "Georgia"
   * resolved to GE from nearby names, a bare city that is also a foreign place ("Odessa",
   * "Belgrade"), an ISO code in a structured field ("GE"). Absent when every country was named
   * unambiguously. The engine must not treat a guessed country as named.
   */
  guessedCountries?: readonly CountryCode[];
}

export const EMPTY_SCOPES: SignalScopes = Object.freeze({ countries: [], regions: [] });
