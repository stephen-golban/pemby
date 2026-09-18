// Output schema of the `job-enrichment` task (phase 05 item 3). Sent as a strict JSON schema, so
// every property is required and optional values are `nullable`, never `optional()`. The model
// reports what the post says; `llmToSignals` turns the eligibility part into signals and the engine
// decides tiers. Numbers carry no bounds in the schema (fewer invalid replies across providers);
// consumers clamp them. Isomorphic.

import { z } from "zod";

import { EMPLOYMENT_TYPES, SENIORITIES, WAYS_OF_WORKING } from "../../ways-of-working";
import {
  CITIZENSHIP_REQUIREMENTS,
  ENGAGEMENT_MODES,
  SIGNAL_KINDS,
  type SignalKind,
} from "../signals";

/**
 * `job_enrichment.seniority` values (PLAN D10, intern to principal): core's ladder itself, not a
 * third copy of it. The model may only report a level a row can hold, and the one way to guarantee
 * that is for this list and the pg enum to be the same list — a copy here was one of the three that
 * let the ladder the gate compares by drift from the ladder the database holds.
 */
export const ENRICHMENT_SENIORITIES = SENIORITIES;
export type EnrichmentSeniority = (typeof ENRICHMENT_SENIORITIES)[number];

/** Kinds the model may emit: every signal kind except `anchor`, which only structured fields give. */
export const LLM_SIGNAL_KINDS = SIGNAL_KINDS.filter(
  (kind): kind is Exclude<SignalKind, "anchor"> => kind !== "anchor",
);
export type LlmSignalKind = (typeof LLM_SIGNAL_KINDS)[number];

/**
 * Engagement modes and citizenship requirements share one `detail` field. "relocation-required"
 * ("must relocate to Lisbon") is listed explicitly so the prompt can ask for it before the signal
 * contract adds the mode; `llmToSignals` keeps it only once ENGAGEMENT_MODES has it.
 */
export const LLM_SIGNAL_DETAILS = [
  ...new Set([...ENGAGEMENT_MODES, "relocation-required", ...CITIZENSHIP_REQUIREMENTS] as const),
] as [string, ...string[]];

/** Longest quote the prompt asks for. Longer quotes still validate and are checked like any other. */
export const MAX_QUOTE_CHARS = 300;

const quote = z
  .string()
  .describe(`Verbatim span copied from the post, at most ${MAX_QUOTE_CHARS} characters.`);

export const llmEligibilityItemSchema = z.object({
  kind: z.enum(LLM_SIGNAL_KINDS as [LlmSignalKind, ...LlmSignalKind[]]),
  places: z
    .array(z.string())
    .describe("Countries, ISO codes or region names as the post writes them. Empty for worldwide."),
  waysOfWorking: z.union([z.enum(["all"]), z.array(z.enum(WAYS_OF_WORKING))]),
  strength: z.enum(["explicit", "implied", "weak"]),
  detail: z
    .enum(LLM_SIGNAL_DETAILS)
    .nullable()
    .describe("Engagement mode for kind engagement; requirement for citizenship-or-clearance."),
  quote,
});
export type LlmEligibilityItem = z.infer<typeof llmEligibilityItemSchema>;

export const jobEnrichmentOutputSchema = z.object({
  seniority: z.enum(ENRICHMENT_SENIORITIES).nullable(),
  yearsMin: z.number().nullable(),
  stack: z.array(z.string()),
  domains: z.array(z.string()),
  salary: z
    .object({
      min: z.number().nullable(),
      max: z.number().nullable(),
      currency: z.string().nullable().describe("ISO 4217 code."),
      period: z.enum(["hour", "day", "month", "year"]).nullable(),
    })
    .nullable(),
  employmentTypes: z.array(z.enum(EMPLOYMENT_TYPES)),
  waysOfWorking: z
    .array(z.enum(WAYS_OF_WORKING))
    .describe("Ways of working the post text itself allows."),
  eligibility: z.array(llmEligibilityItemSchema),
  visaSponsorship: z.enum(["yes", "no", "unknown"]),
  timezone: z
    .object({
      minUtcOffset: z.number().nullable(),
      maxUtcOffset: z.number().nullable(),
      overlapHours: z.number().nullable(),
      required: z.boolean(),
      quote,
    })
    .nullable(),
  asksCandidateForMoney: z.boolean(),
  moneyQuote: z.string().nullable(),
  redFlags: z.array(z.string()),
});
export type JobEnrichmentOutput = z.infer<typeof jobEnrichmentOutputSchema>;
